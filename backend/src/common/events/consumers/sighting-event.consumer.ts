import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AlertsService } from '../../../modules/alerts/alerts.service';
import { normalizeLicensePlate } from '../../../modules/vehicles/utils/plate-normalizer';
import {
  validateVehicleSightingCreatedPayload,
  VehicleSightingCreatedPayload,
} from '../event-contracts/vehicle-sighting-created.event';
import { RedisStreamClient, StreamMessage } from '../redis/redis-stream.client';

@Injectable()
export class SightingEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SightingEventConsumer.name);
  public isRunning = false;
  private consumerLoopPromise: Promise<void> | null = null;
  private recoveryLoopPromise: Promise<void> | null = null;
  private isRecoveringPending = false;
  private readonly deliveryAttemptCounts: Map<string, number> = new Map();

  public readonly streamName: string;
  public readonly consumerGroup: string;
  public readonly consumerName: string;

  // Configuration for pending message recovery (Phase 4.2)
  public readonly pendingRecoveryEnabled: boolean;
  public readonly pendingRecoveryIntervalMs: number;
  public readonly pendingMinIdleMs: number;
  public readonly pendingBatchSize: number;
  public readonly pendingMaxDeliveryAttempts: number;

  // Telemetry metrics
  public totalEventsReceived = 0;
  public totalSightingsPersisted = 0;
  public totalEvidencePersisted = 0;
  public totalDuplicatesDetected = 0;
  public totalAlertsTriggered = 0;
  public totalProcessingErrors = 0;
  public totalAcks = 0;
  public totalPendingRecovered = 0;
  public totalPendingReclaimAttempts = 0;
  public totalDeadLettersDropped = 0;

  constructor(
    private readonly redisClient: RedisStreamClient,
    private readonly prisma: PrismaService,
    private readonly alertsService: AlertsService,
    private readonly configService: ConfigService,
  ) {
    this.streamName = this.configService.get<string>(
      'REDIS_STREAM_VEHICLE_SIGHTINGS',
      'gujcamera:events:vehicle-sightings',
    );
    this.consumerGroup = this.configService.get<string>(
      'REDIS_CONSUMER_GROUP_SIGHTINGS',
      'gujcamera:backend:sightings-group',
    );
    this.consumerName = `backend-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;

    this.pendingRecoveryEnabled =
      this.configService.get<string>('REDIS_PENDING_RECOVERY_ENABLED', 'true') !== 'false';
    this.pendingRecoveryIntervalMs = Number(
      this.configService.get<number>('REDIS_PENDING_RECOVERY_INTERVAL_MS', 15000),
    );
    this.pendingMinIdleMs = Number(
      this.configService.get<number>('REDIS_PENDING_MIN_IDLE_MS', 30000),
    );
    this.pendingBatchSize = Number(
      this.configService.get<number>('REDIS_PENDING_BATCH_SIZE', 10),
    );
    this.pendingMaxDeliveryAttempts = Number(
      this.configService.get<number>('REDIS_PENDING_MAX_DELIVERY_ATTEMPTS', 5),
    );
  }

  async onModuleInit(): Promise<void> {
    const isRedisDisabled =
      this.configService.get<string>('REDIS_CONSUMER_ENABLED', 'true') === 'false';
    if (isRedisDisabled) {
      this.logger.warn('Redis sighting consumer is disabled via REDIS_CONSUMER_ENABLED=false');
      return;
    }

    try {
      await this.redisClient.ensureConsumerGroup(this.streamName, this.consumerGroup);
      this.isRunning = true;
      this.consumerLoopPromise = this.runConsumerLoop();

      if (this.pendingRecoveryEnabled) {
        this.recoveryLoopPromise = this.runPendingRecoveryLoop();
      }

      this.logger.log(
        `Sighting event consumer started [Stream: ${this.streamName}, Group: ${this.consumerGroup}, Consumer: ${this.consumerName}, PendingRecovery: ${this.pendingRecoveryEnabled}]`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to initialize sighting event consumer: ${err.message}`);
      // Do not crash the entire NestJS application if Redis is temporarily unreachable on startup
      // Worker will retry or recover when Redis is available
    }
  }

  private async runConsumerLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const messages = await this.redisClient.readGroup(
          this.consumerGroup,
          this.consumerName,
          this.streamName,
          10,
          2000,
        );

        if (messages && messages.length > 0) {
          for (const message of messages) {
            if (!this.isRunning) break;
            await this.processStreamMessage(message);
          }
        }
      } catch (loopErr: any) {
        if (this.isRunning) {
          this.logger.error(`Error in consumer loop: ${loopErr.message}`);
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
    }
  }

  /**
   * Process a single Redis stream message with strict transactional boundaries,
   * idempotency, and deferred acknowledgment (ACK only after database commit).
   */
  public async processStreamMessage(message: StreamMessage): Promise<boolean> {
    this.totalEventsReceived++;
    let payload: VehicleSightingCreatedPayload;

    // 1. Deserialization & Payload Validation
    try {
      let rawData: any;
      if (message.fields.data) {
        rawData = JSON.parse(message.fields.data);
      } else {
        rawData = message.fields;
      }
      payload = validateVehicleSightingCreatedPayload(rawData);
    } catch (valErr: any) {
      this.totalProcessingErrors++;
      this.logger.error(
        `Malformed or invalid event rejected (messageId: ${message.id}): ${valErr.message}`,
      );
      // Malformed payloads cannot be recovered by retrying; acknowledge to avoid infinite loop
      await this.safeAck(this.streamName, this.consumerGroup, message.id);
      return false;
    }

    const {
      event_id,
      sighting_id,
      evidence_id,
      camera_id,
      plate_normalized,
      confidence,
      consensus_of,
      storage_ref,
      evidence_hash,
      captured_at,
      correlation_id,
    } = payload;

    this.logger.log(
      `[Event Received] sighting: ${sighting_id} | plate: ${plate_normalized} | camera: ${camera_id} | event: ${event_id}`,
    );

    // 2. Camera Resolution
    const resolvedCameraId = await this.resolveCameraId(camera_id);
    if (!resolvedCameraId) {
      this.totalProcessingErrors++;
      this.logger.error(
        `Cannot persist sighting ${sighting_id}: Referenced camera '${camera_id}' not found in registry`,
      );
      // Camera missing: Do NOT ACK yet, or allow retry once camera is onboarded
      return false;
    }

    // 3. Re-validate / normalize plate at the backend boundary
    const canonicalPlate = normalizeLicensePlate(plate_normalized);
    if (!canonicalPlate) {
      this.totalProcessingErrors++;
      this.logger.error(`Cannot persist sighting ${sighting_id}: Invalid normalized plate format`);
      await this.safeAck(this.streamName, this.consumerGroup, message.id);
      return false;
    }

    // 4. Idempotency Check (Survives Process Restarts)
    try {
      const existingSighting = await this.prisma.vehicleSighting.findUnique({
        where: { id: sighting_id },
      });

      if (existingSighting) {
        this.totalDuplicatesDetected++;
        this.logger.log(
          `[Idempotent Skip] Sighting '${sighting_id}' already exists in PostgreSQL. Acknowledging duplicate delivery.`,
        );
        await this.safeAck(this.streamName, this.consumerGroup, message.id);
        return true;
      }

      // 5. Database Transaction: Persist Vehicle, Sighting, and Evidence atomically
      const capturedDate = new Date(captured_at);

      await this.prisma.$transaction(async (tx) => {
        // Upsert canonical Vehicle entity
        await tx.vehicle.upsert({
          where: { plateNormalized: canonicalPlate },
          create: {
            plateNormalized: canonicalPlate,
            firstSeen: capturedDate,
            lastSeen: capturedDate,
          },
          update: {
            lastSeen: capturedDate,
          },
        });

        // Insert canonical VehicleSighting
        await tx.vehicleSighting.create({
          data: {
            id: sighting_id,
            plateNormalized: canonicalPlate,
            cameraId: resolvedCameraId,
            ts: capturedDate,
            confidence: new Prisma.Decimal(confidence),
            consensusOf: consensus_of,
            frameRef: storage_ref,
            vehicleClass: payload.vehicle_class ?? null,  // Phase 10: persist vehicle class
          } as any,  // Phase 10: 'vehicleClass' pending prisma migrate deploy
        });

        // Insert linked Evidence artifact record
        await tx.evidence.create({
          data: {
            id: evidence_id,
            sourceType: 'SIGHTING',
            sourceId: sighting_id,
            storageRef: storage_ref,
            hash: evidence_hash,
            capturedAt: capturedDate,
          },
        });
      });

      this.totalSightingsPersisted++;
      this.totalEvidencePersisted++;

      this.logger.log(
        `[Persisted] Sighting '${sighting_id}' and Evidence '${evidence_id}' saved to PostgreSQL`,
      );
    } catch (dbErr: any) {
      // Check for concurrent race condition unique constraint violation (P2002)
      if (dbErr.code === 'P2002') {
        this.totalDuplicatesDetected++;
        this.logger.log(
          `[Concurrent Idempotency] Unique constraint on sighting '${sighting_id}' met during transaction. Safe idempotent outcome.`,
        );
        await this.safeAck(this.streamName, this.consumerGroup, message.id);
        return true;
      }

      this.totalProcessingErrors++;
      this.logger.error(
        `Database persistence failed for sighting '${sighting_id}': ${dbErr.message}. Message remaining unacked for retry.`,
      );
      return false;
    }

    // 6. Watchlist Matching & Alert Generation (Phase 2E Integration)
    try {
      const matchResult = await this.alertsService.processSightingMatch(
        sighting_id,
        correlation_id,
      );

      if (matchResult.matched && matchResult.alerts_generated > 0) {
        this.totalAlertsTriggered += matchResult.alerts_generated;
        this.logger.warn(
          `[Watchlist Alert Triggered] Sighting ${sighting_id} matched watchlist! Generated ${matchResult.alerts_generated} alert(s).`,
        );
      } else {
        this.logger.debug(
          `[Watchlist Checked] Sighting ${sighting_id} (plate: ${canonicalPlate}) checked: no active watchlist match.`,
        );
      }
    } catch (alertErr: any) {
      // Alert processing failure is logged, but the sighting is already durably persisted.
      this.logger.error(
        `Error during watchlist matching for sighting '${sighting_id}': ${alertErr.message}`,
      );
    }

    // 7. Acknowledge message in Redis Streams strictly after durable persistence
    await this.safeAck(this.streamName, this.consumerGroup, message.id);
    this.logger.debug(`[ACK] Message ${message.id} acknowledged in stream ${this.streamName}`);
    return true;
  }

  private async safeAck(stream: string, group: string, messageId: string): Promise<void> {
    if (messageId && typeof messageId === 'string' && messageId.trim().length > 0) {
      await this.redisClient.ack(stream, group, messageId);
      this.deliveryAttemptCounts.delete(messageId);
    }
    this.totalAcks++;
  }

  public getDeliveryAttempts(messageId: string): number {
    return this.deliveryAttemptCounts.get(messageId) || 0;
  }

  /**
   * Reclaim and process pending messages from the consumer group's PEL.
   * Can be called periodically by the background loop or triggered manually.
   */
  public async recoverPendingBatch(startId = '0-0'): Promise<string> {
    if (this.isRecoveringPending || !this.isRunning) {
      return startId;
    }

    this.isRecoveringPending = true;
    this.totalPendingReclaimAttempts++;

    try {
      const claimResult = await this.redisClient.autoClaim(
        this.streamName,
        this.consumerGroup,
        this.consumerName,
        this.pendingMinIdleMs,
        startId,
        this.pendingBatchSize,
      );

      const messages = claimResult.messages || [];
      const nextStartId = claimResult.nextStartId || '0-0';

      if (messages.length > 0) {
        this.logger.log(
          `[Pending Recovery] Reclaimed ${messages.length} pending message(s) from PEL (startId: ${startId}, nextId: ${nextStartId})`,
        );

        for (const message of messages) {
          if (!this.isRunning) break;

          // Check delivery attempt threshold to handle poison pills / persistent unresolvable messages
          const currentAttempts = (this.deliveryAttemptCounts.get(message.id) || 0) + 1;
          this.deliveryAttemptCounts.set(message.id, currentAttempts);

          // Bounded map size maintenance
          if (this.deliveryAttemptCounts.size > 10000) {
            const keysToDelete = Array.from(this.deliveryAttemptCounts.keys()).slice(0, 2000);
            for (const k of keysToDelete) {
              this.deliveryAttemptCounts.delete(k);
            }
          }

          if (currentAttempts > this.pendingMaxDeliveryAttempts) {
            this.totalDeadLettersDropped++;
            this.totalProcessingErrors++;
            this.logger.error(
              `[Dead Letter] Message ${message.id} exceeded maximum delivery attempts (${this.pendingMaxDeliveryAttempts}). Acknowledging to avoid consumer starvation.`,
            );
            await this.safeAck(this.streamName, this.consumerGroup, message.id);
            continue;
          }

          const success = await this.processStreamMessage(message);
          if (success) {
            this.totalPendingRecovered++;
            this.deliveryAttemptCounts.delete(message.id);
          }
        }
      }

      return nextStartId === '0-0' ? '0-0' : nextStartId;
    } catch (err: any) {
      this.logger.error(`Failed to reclaim pending messages on ${this.streamName}: ${err.message}`);
      return '0-0';
    } finally {
      this.isRecoveringPending = false;
    }
  }

  private async runPendingRecoveryLoop(): Promise<void> {
    this.logger.log(
      `Pending message recovery loop active [Interval: ${this.pendingRecoveryIntervalMs}ms, MinIdle: ${this.pendingMinIdleMs}ms, BatchSize: ${this.pendingBatchSize}]`,
    );

    // Initial startup delay to give new message stream consumers priority
    await new Promise((res) => setTimeout(res, Math.min(2000, this.pendingRecoveryIntervalMs)));

    let currentStartId = '0-0';

    while (this.isRunning) {
      try {
        currentStartId = await this.recoverPendingBatch(currentStartId);
      } catch (err: any) {
        if (this.isRunning) {
          this.logger.error(`Error in pending recovery loop: ${err.message}`);
        }
      }

      // Interruptible delay between recovery batches
      const intervalMs = Math.max(100, this.pendingRecoveryIntervalMs);
      await new Promise((res) => setTimeout(res, intervalMs));
    }
  }

  /**
   * Resolve Camera ID from UUID or Camera Code Prefix (e.g., 'CAM-AHM-01')
   * Strictly enforces unambiguous resolution: if multiple cameras match,
   * resolution fails to prevent cross-camera data corruption.
   */
  public async resolveCameraId(cameraIdOrCode: string): Promise<string | null> {
    if (!cameraIdOrCode || typeof cameraIdOrCode !== 'string') return null;

    const trimmed = cameraIdOrCode.trim();

    // 1. Unambiguous UUID lookup
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    if (isUuid) {
      const camera = await this.prisma.camera.findUnique({
        where: { id: trimmed },
        select: { id: true },
      });
      return camera ? camera.id : null;
    }

    // 2. Unambiguous prefix lookup (e.g. 'CAM-AHM-01: ...' or 'CAM-AHM-01')
    const primaryMatches = await this.prisma.camera.findMany({
      where: {
        OR: [
          { name: { equals: trimmed } },
          { name: { startsWith: `${trimmed}:` } },
          { name: { startsWith: `${trimmed} ` } },
        ],
      },
      select: { id: true, name: true },
    });

    if (primaryMatches.length === 1) {
      return primaryMatches[0].id;
    }

    if (primaryMatches.length > 1) {
      this.logger.error(
        `Ambiguous camera code '${trimmed}': matched ${primaryMatches.length} cameras (${primaryMatches.map((c) => c.name).join(', ')}). Aborting resolution.`,
      );
      return null;
    }

    // 3. Fallback: exact startsWith match
    const fallbackMatches = await this.prisma.camera.findMany({
      where: { name: { startsWith: trimmed } },
      select: { id: true, name: true },
    });

    if (fallbackMatches.length === 1) {
      return fallbackMatches[0].id;
    }

    if (fallbackMatches.length > 1) {
      this.logger.error(
        `Ambiguous camera prefix '${trimmed}': matched ${fallbackMatches.length} cameras. Aborting resolution.`,
      );
      return null;
    }

    return null;
  }

  async onModuleDestroy(): Promise<void> {
    this.isRunning = false;
    const promises: Promise<void>[] = [];
    if (this.consumerLoopPromise) promises.push(this.consumerLoopPromise);
    if (this.recoveryLoopPromise) promises.push(this.recoveryLoopPromise);

    if (promises.length > 0) {
      try {
        await Promise.race([
          Promise.all(promises),
          new Promise((res) => setTimeout(res, 2500)),
        ]);
      } catch {}
      this.consumerLoopPromise = null;
      this.recoveryLoopPromise = null;
    }
    this.logger.log('Sighting event consumer stopped cleanly');
  }
}
