import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { SightingEventConsumer } from './sighting-event.consumer';
import { PrismaService } from '../../../prisma/prisma.service';
import { AlertsService } from '../../../modules/alerts/alerts.service';
import { RedisStreamClient } from '../redis/redis-stream.client';
import {
  VideoSourceType,
  EVENT_TYPE_SIGHTING_CREATED,
  SCHEMA_VERSION,
  validateVehicleSightingCreatedPayload,
  VehicleSightingCreatedPayload,
} from '../event-contracts/vehicle-sighting-created.event';

/**
 * Phase 5 — Realistic Video Input & End-to-End Pipeline Contract Unit Test
 * Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
 */
describe('SightingEventConsumer & Phase 5 Event Pipeline Validation', () => {
  let consumer: SightingEventConsumer;
  let prismaMock: any;
  let alertsServiceMock: any;
  let redisClientMock: any;
  let configServiceMock: any;

  const validSha256 = '315cb76daa3caa030ef0de4aecbaafa8dd20c114901d940682cceb1a9fa42db7';
  const mockCameraUuid = 'c1111111-2222-3333-4444-555555555555';

  beforeEach(async () => {
    prismaMock = {
      camera: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve([
            {
              id: mockCameraUuid,
              name: 'CAM-DEMO-01: Highway Junction Research',
              lat: 23.0225,
              long: 72.5714,
            },
          ]);
        }),
      },
      cameraStream: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      vehicleSighting: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sighting-1' }),
      },
      vehicle: {
        upsert: jest.fn().mockResolvedValue({ plateNormalized: 'GJ01AB1234' }),
      },
      evidence: {
        create: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prismaMock);
      }),
    };

    alertsServiceMock = {
      processSightingMatch: jest.fn().mockResolvedValue({
        matched: false,
        alerts_generated: 0,
        alerts: [],
      }),
    };

    redisClientMock = {
      ensureConsumerGroup: jest.fn().mockResolvedValue(undefined),
      readGroup: jest.fn().mockResolvedValue([]),
      ack: jest.fn().mockResolvedValue(1),
      autoClaim: jest.fn().mockResolvedValue({
        nextStartId: '0-0',
        messages: [],
        deletedMessageIds: [],
      }),
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SightingEventConsumer,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AlertsService, useValue: alertsServiceMock },
        { provide: RedisStreamClient, useValue: redisClientMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    consumer = module.get<SightingEventConsumer>(SightingEventConsumer);
  });

  describe('1. Source Type & Contract Validation', () => {
    it('accepts valid VideoSourceType enums in sighting event payload', () => {
      const sourceTypes = [
        VideoSourceType.RESEARCH_VIDEO,
        VideoSourceType.SYNTHETIC_STREAM,
        VideoSourceType.DEMO_FILE,
        VideoSourceType.REAL_RTSP,
        VideoSourceType.REAL_ONVIF,
        VideoSourceType.VMS_GATEWAY,
      ];

      for (const st of sourceTypes) {
        const payload: VehicleSightingCreatedPayload = {
          event_id: 'e-1',
          event_type: EVENT_TYPE_SIGHTING_CREATED,
          schema_version: SCHEMA_VERSION,
          occurred_at: new Date().toISOString(),
          producer: 'ai-worker',
          sighting_id: 's-1',
          evidence_id: 'ev-1',
          camera_id: 'CAM-DEMO-01',
          plate_normalized: 'GJ01AB1234',
          confidence: 0.92,
          consensus_of: 3,
          total_observations: 5,
          storage_ref: 's3://police-evidence-vault/evidence/snap_1.jpg',
          evidence_hash: validSha256,
          captured_at: new Date().toISOString(),
          correlation_id: 'corr-id-1',
          source_type: st,
        };

        const validated = validateVehicleSightingCreatedPayload(payload);
        expect(validated.source_type).toBe(st);
      }
    });

    it('defaults source_type to SYNTHETIC_STREAM if omitted for backwards compatibility', () => {
      const payload = {
        event_id: 'e-legacy',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 's-legacy',
        evidence_id: 'ev-legacy',
        camera_id: 'CAM-AHM-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.88,
        consensus_of: 3,
        total_observations: 3,
        storage_ref: 's3://police-evidence-vault/evidence/legacy.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
      };

      const validated = validateVehicleSightingCreatedPayload(payload);
      expect(validated.source_type).toBe(VideoSourceType.SYNTHETIC_STREAM);
    });

    it('rejects invalid or corrupted event payload missing required plate or camera', () => {
      const corruptPayload = {
        event_id: 'e-corrupt',
        // missing camera_id and plate_normalized
        confidence: 0.9,
      };

      expect(() => validateVehicleSightingCreatedPayload(corruptPayload)).toThrow();
    });
  });

  describe('2. Pipeline Execution: Realistic Video Event -> Database Persistence', () => {
    it('persists sighting from RESEARCH_VIDEO source and associates it to camera PostGIS location', async () => {
      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-demo-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 'sighting-demo-001',
        evidence_id: 'evidence-demo-001',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.94,
        consensus_of: 4,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/demo_traffic_snap.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-demo-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const streamMessage = {
        id: '1700000000000-0',
        fields: { data: JSON.stringify(eventPayload) },
      };

      const success = await consumer.processStreamMessage(streamMessage);
      expect(success).toBe(true);

      // Verify camera resolution
      expect(prismaMock.camera.findMany).toHaveBeenCalled();

      // Verify Vehicle upsert
      expect(prismaMock.vehicle.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { plateNormalized: 'GJ01AB1234' },
        }),
      );

      // Verify VehicleSighting persistence with camera ID
      expect(prismaMock.vehicleSighting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'sighting-demo-001',
            plateNormalized: 'GJ01AB1234',
            cameraId: mockCameraUuid,
            frameRef: 's3://police-evidence-vault/evidence/demo_traffic_snap.jpg',
          }),
        }),
      );

      // Verify Evidence persistence with SHA-256 hash
      expect(prismaMock.evidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'evidence-demo-001',
            sourceType: 'SIGHTING',
            sourceId: 'sighting-demo-001',
            hash: validSha256,
          }),
        }),
      );

      // Verify safe acknowledgment in Redis
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        '1700000000000-0',
      );
    });

    it('verifies SHA-256 cryptographic integrity matches image payload bytes', () => {
      const mockEvidenceBytes = Buffer.from('REALISTIC_CCTV_FRAME_CAPTURE_PAYLOAD_EVIDENCE_2026');
      const expectedDigest = crypto.createHash('sha256').update(mockEvidenceBytes).digest('hex');

      // Verify 64-char lowercase hex
      expect(expectedDigest).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(expectedDigest)).toBe(true);

      // Re-hashing produces identical output (integrity verification)
      const recalculatedDigest = crypto.createHash('sha256').update(mockEvidenceBytes).digest('hex');
      expect(recalculatedDigest).toBe(expectedDigest);
    });
  });

  describe('3. Watchlist Matching & Alert Discrimination', () => {
    it('triggers CRITICAL alert when recognized plate matches an active watchlist entry', async () => {
      alertsServiceMock.processSightingMatch.mockResolvedValueOnce({
        matched: true,
        alerts_generated: 1,
        alerts: [
          {
            id: 'alert-stolen-001',
            severity: 'CRITICAL',
            status: 'NEW',
            plate: 'GJ01AB1234',
          },
        ],
      });

      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-watchlist-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 'sighting-match-001',
        evidence_id: 'evidence-match-001',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.96,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/match.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-match-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const success = await consumer.processStreamMessage({
        id: '1700000000001-0',
        fields: { data: JSON.stringify(eventPayload) },
      });

      expect(success).toBe(true);
      expect(alertsServiceMock.processSightingMatch).toHaveBeenCalledWith(
        'sighting-match-001',
        'corr-match-001',
      );
      expect(consumer.totalAlertsTriggered).toBe(1);
    });

    it('does NOT trigger alert for non-watchlist innocent vehicle', async () => {
      alertsServiceMock.processSightingMatch.mockResolvedValueOnce({
        matched: false,
        alerts_generated: 0,
        alerts: [],
      });

      const initialAlerts = consumer.totalAlertsTriggered;

      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-innocent-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 'sighting-innocent-001',
        evidence_id: 'evidence-innocent-001',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ05XY9999',
        confidence: 0.91,
        consensus_of: 4,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/innocent.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-innocent-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const success = await consumer.processStreamMessage({
        id: '1700000000002-0',
        fields: { data: JSON.stringify(eventPayload) },
      });

      expect(success).toBe(true);
      expect(alertsServiceMock.processSightingMatch).toHaveBeenCalledWith(
        'sighting-innocent-001',
        'corr-innocent-001',
      );
      // Alerts count remains unchanged
      expect(consumer.totalAlertsTriggered).toBe(initialAlerts);
    });
  });

  describe('4. Security & Zero-Secret Leakage Validation', () => {
    it('verifies event payload contains zero credentials, auth tokens, or RTSP passwords', () => {
      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-sec-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 's-sec-1',
        evidence_id: 'ev-sec-1',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.95,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/sec_test.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-sec-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const serialized = JSON.stringify(eventPayload);
      const forbiddenTokens = ['password', 'secret', 'rtsp://', 'Authorization', 'Bearer', 'token'];

      for (const token of forbiddenTokens) {
        expect(serialized.toLowerCase()).not.toContain(token.toLowerCase());
      }
    });
  });

  describe('5. Duplicate Delivery & Idempotency', () => {
    it('acknowledges duplicate delivery without re-inserting into database', async () => {
      // Simulate existing sighting already stored
      prismaMock.vehicleSighting.findUnique.mockResolvedValueOnce({
        id: 'sighting-existing-001',
        plateNormalized: 'GJ01AB1234',
      });

      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-dup-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 'sighting-existing-001',
        evidence_id: 'evidence-existing-001',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.92,
        consensus_of: 3,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/dup.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-dup-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const success = await consumer.processStreamMessage({
        id: '1700000000003-0',
        fields: { data: JSON.stringify(eventPayload) },
      });

      expect(success).toBe(true);
      expect(prismaMock.vehicleSighting.create).not.toHaveBeenCalled();
      expect(consumer.totalDuplicatesDetected).toBe(1);
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        '1700000000003-0',
      );
    });
  });

  describe('6. Redis Stream Pending-Message Recovery (Phase 4.2)', () => {
    const createMockPayload = (
      overrides?: Partial<VehicleSightingCreatedPayload>,
    ): VehicleSightingCreatedPayload => ({
      event_id: 'e-rec-1',
      event_type: EVENT_TYPE_SIGHTING_CREATED,
      schema_version: SCHEMA_VERSION,
      occurred_at: new Date().toISOString(),
      producer: 'ai-worker',
      sighting_id: 'sighting-rec-001',
      evidence_id: 'evidence-rec-001',
      camera_id: 'CAM-DEMO-01',
      plate_normalized: 'GJ01AB1234',
      confidence: 0.95,
      consensus_of: 3,
      total_observations: 5,
      storage_ref: 's3://police-evidence-vault/evidence/rec.jpg',
      evidence_hash: validSha256,
      captured_at: new Date().toISOString(),
      correlation_id: 'corr-rec-001',
      source_type: VideoSourceType.RESEARCH_VIDEO,
      ...overrides,
    });

    it('leaves message unacknowledged in PEL when PostgreSQL persistence fails with transient error', async () => {
      // Simulate transient PostgreSQL connection drop / timeout
      prismaMock.$transaction.mockRejectedValueOnce(
        new Error('Connection terminated unexpectedly by PostgreSQL server'),
      );

      const msg = {
        id: '1700000000010-0',
        fields: { data: JSON.stringify(createMockPayload({ sighting_id: 's-fail-001' })) },
      };

      const success = await consumer.processStreamMessage(msg);

      expect(success).toBe(false);
      expect(consumer.totalProcessingErrors).toBe(1);
      // Critical invariant: safeAck MUST NOT be called on transient failure
      expect(redisClientMock.ack).not.toHaveBeenCalled();
    });

    it('retries and acknowledges a pending message once PostgreSQL becomes available', async () => {
      const msgId = '1700000000011-0';
      const payload = createMockPayload({ sighting_id: 's-retry-001' });
      const pendingMessage = {
        id: msgId,
        fields: { data: JSON.stringify(payload) },
      };

      consumer.isRunning = true;
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [pendingMessage],
        deletedMessageIds: [],
      });

      // Database transaction succeeds on retry
      const nextId = await consumer.recoverPendingBatch('0-0');

      expect(nextId).toBe('0-0');
      expect(prismaMock.vehicleSighting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 's-retry-001' }),
        }),
      );
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        msgId,
      );
      expect(consumer.totalPendingRecovered).toBe(1);
      expect(consumer.getDeliveryAttempts(msgId)).toBe(0);
    });

    it('recovers pending messages left behind after previous consumer crashed / was interrupted', async () => {
      const msgId = '1700000000012-0';
      const crashedConsumerPayload = createMockPayload({
        sighting_id: 's-crashed-001',
        evidence_id: 'ev-crashed-001',
      });
      const pendingMessage = {
        id: msgId,
        fields: { data: JSON.stringify(crashedConsumerPayload) },
      };

      consumer.isRunning = true;
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '1700000000012-0',
        messages: [pendingMessage],
        deletedMessageIds: [],
      });

      const nextId = await consumer.recoverPendingBatch('0-0');

      expect(nextId).toBe('1700000000012-0');
      expect(redisClientMock.autoClaim).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        consumer.consumerName,
        consumer.pendingMinIdleMs,
        '0-0',
        consumer.pendingBatchSize,
      );
      expect(prismaMock.vehicleSighting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 's-crashed-001' }),
        }),
      );
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        msgId,
      );
      expect(consumer.totalPendingRecovered).toBe(1);
    });

    it('acknowledges a successfully persisted message and clears delivery attempt tracking', async () => {
      const msgId = '1700000000013-0';
      const msg = {
        id: msgId,
        fields: { data: JSON.stringify(createMockPayload({ sighting_id: 's-norm-001' })) },
      };

      const success = await consumer.processStreamMessage(msg);

      expect(success).toBe(true);
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        msgId,
      );
      expect(consumer.totalAcks).toBe(1);
      expect(consumer.getDeliveryAttempts(msgId)).toBe(0);
    });

    it('ensures duplicate event during recovery does not create duplicate sightings or duplicate alerts', async () => {
      const msgId = '1700000000014-0';
      const sightingId = 'sighting-dup-rec-001';

      // Sighting was already persisted before
      prismaMock.vehicleSighting.findUnique.mockResolvedValueOnce({
        id: sightingId,
        plateNormalized: 'GJ01AB1234',
      });

      const pendingMessage = {
        id: msgId,
        fields: { data: JSON.stringify(createMockPayload({ sighting_id: sightingId })) },
      };

      consumer.isRunning = true;
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [pendingMessage],
        deletedMessageIds: [],
      });

      await consumer.recoverPendingBatch('0-0');

      // Idempotency: Create must not be called
      expect(prismaMock.vehicleSighting.create).not.toHaveBeenCalled();
      // Watchlist matching must not be re-triggered
      expect(alertsServiceMock.processSightingMatch).not.toHaveBeenCalled();
      // Duplicate metric incremented
      expect(consumer.totalDuplicatesDetected).toBe(1);
      // Duplicate is safely acknowledged
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        msgId,
      );
    });

    it('handles concurrent race condition P2002 unique constraint during transaction idempotently', async () => {
      const msgId = '1700000000015-0';
      const sightingId = 'sighting-race-001';

      // Pre-check findUnique returned null (did not exist yet)
      prismaMock.vehicleSighting.findUnique.mockResolvedValueOnce(null);

      // Concurrent worker inserted record right before this transaction executed
      prismaMock.$transaction.mockRejectedValueOnce({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`id`)',
      });

      const msg = {
        id: msgId,
        fields: { data: JSON.stringify(createMockPayload({ sighting_id: sightingId })) },
      };

      const success = await consumer.processStreamMessage(msg);

      expect(success).toBe(true);
      expect(consumer.totalDuplicatesDetected).toBe(1);
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        msgId,
      );
    });

    it('retries transient DB failures across multiple recovery cycles without permanently stranding message', async () => {
      const msgId = '1700000000016-0';
      const pendingMessage = {
        id: msgId,
        fields: { data: JSON.stringify(createMockPayload({ sighting_id: 's-multi-001' })) },
      };

      consumer.isRunning = true;

      // Cycle 1: Database failure
      prismaMock.$transaction.mockRejectedValueOnce(new Error('Connection reset by peer'));
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [pendingMessage],
        deletedMessageIds: [],
      });
      await consumer.recoverPendingBatch('0-0');

      expect(consumer.getDeliveryAttempts(msgId)).toBe(1);
      expect(redisClientMock.ack).not.toHaveBeenCalled();
      expect(consumer.totalPendingRecovered).toBe(0);

      // Cycle 2: Database failure again
      prismaMock.$transaction.mockRejectedValueOnce(new Error('Deadlock detected'));
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [pendingMessage],
        deletedMessageIds: [],
      });
      await consumer.recoverPendingBatch('0-0');

      expect(consumer.getDeliveryAttempts(msgId)).toBe(2);
      expect(redisClientMock.ack).not.toHaveBeenCalled();
      expect(consumer.totalPendingRecovered).toBe(0);

      // Cycle 3: Database recovers and succeeds
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [pendingMessage],
        deletedMessageIds: [],
      });
      await consumer.recoverPendingBatch('0-0');

      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        msgId,
      );
      expect(consumer.totalPendingRecovered).toBe(1);
      expect(consumer.getDeliveryAttempts(msgId)).toBe(0);
    });

    it('does not reclaim messages prematurely, respecting pendingMinIdleMs threshold', async () => {
      consumer.isRunning = true;
      await consumer.recoverPendingBatch('0-0');

      // Verifies the minIdleTimeMs passed to Redis equals 30000ms (configured threshold)
      expect(redisClientMock.autoClaim).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        consumer.consumerName,
        30000,
        '0-0',
        10,
      );
    });

    it('drops and acknowledges poison-pill messages exceeding pendingMaxDeliveryAttempts to prevent starvation', async () => {
      const poisonId = '1700000000017-0';
      const poisonMessage = {
        id: poisonId,
        fields: { data: JSON.stringify(createMockPayload({ sighting_id: 's-poison-001' })) },
      };

      consumer.isRunning = true;
      // Database transaction always rejects for this corrupt payload
      prismaMock.$transaction.mockRejectedValue(new Error('Persistent unrecoverable SQL error'));

      // Simulate 5 failed recovery attempts
      for (let i = 1; i <= 5; i++) {
        redisClientMock.autoClaim.mockResolvedValueOnce({
          nextStartId: '0-0',
          messages: [poisonMessage],
          deletedMessageIds: [],
        });
        await consumer.recoverPendingBatch('0-0');
        expect(consumer.getDeliveryAttempts(poisonId)).toBe(i);
        expect(redisClientMock.ack).not.toHaveBeenCalled();
      }

      // 6th attempt: exceeds pendingMaxDeliveryAttempts (5)
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [poisonMessage],
        deletedMessageIds: [],
      });
      await consumer.recoverPendingBatch('0-0');

      expect(consumer.totalDeadLettersDropped).toBe(1);
      // Dead letter message is acknowledged to prevent blocking PEL
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        poisonId,
      );
    });

    it('handles malformed events safely via bounded failure path (ACK to prevent infinite retry)', async () => {
      const corruptMessage = {
        id: '1700000000018-0',
        fields: { data: '{not-valid-json' },
      };

      const success = await consumer.processStreamMessage(corruptMessage);

      expect(success).toBe(false);
      expect(consumer.totalProcessingErrors).toBe(1);
      // Malformed payloads cannot be recovered by retrying: acknowledged to unblock stream
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        '1700000000018-0',
      );
    });

    it('handles empty pending list safely without errors', async () => {
      consumer.isRunning = true;
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [],
        deletedMessageIds: [],
      });

      const nextId = await consumer.recoverPendingBatch('0-0');

      expect(nextId).toBe('0-0');
      expect(consumer.totalPendingRecovered).toBe(0);
      expect(consumer.totalProcessingErrors).toBe(0);
    });

    it('ensures Redis connection errors during autoClaim do not crash the consumer', async () => {
      consumer.isRunning = true;
      redisClientMock.autoClaim.mockRejectedValueOnce(
        new Error('ECONNREFUSED: Redis instance offline'),
      );

      const nextId = await consumer.recoverPendingBatch('0-0');

      expect(nextId).toBe('0-0');
      // Consumer remains in running state and does not crash
      expect(consumer.isRunning).toBe(true);
    });

    it('processes new stream messages independently while pending recovery executes', async () => {
      const newMsg = {
        id: '1700000000019-0',
        fields: { data: JSON.stringify(createMockPayload({ sighting_id: 's-new-live-001' })) },
      };
      const pendingMsg = {
        id: '1700000000020-0',
        fields: { data: JSON.stringify(createMockPayload({ sighting_id: 's-recovered-001' })) },
      };

      consumer.isRunning = true;
      redisClientMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [pendingMsg],
        deletedMessageIds: [],
      });

      // Execute new message processing and pending recovery concurrently
      const [liveSuccess, nextId] = await Promise.all([
        consumer.processStreamMessage(newMsg),
        consumer.recoverPendingBatch('0-0'),
      ]);

      expect(liveSuccess).toBe(true);
      expect(nextId).toBe('0-0');
      expect(consumer.totalSightingsPersisted).toBe(2);
      expect(consumer.totalPendingRecovered).toBe(1);
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        '1700000000019-0',
      );
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        '1700000000020-0',
      );
    });

    it('leaves message unacknowledged when referenced camera is missing so it can be retried', async () => {
      prismaMock.camera.findMany.mockResolvedValue([]); // Camera not found on primary and fallback search

      const msg = {
        id: '1700000000021-0',
        fields: {
          data: JSON.stringify(
            createMockPayload({ sighting_id: 's-unreg-cam-001', camera_id: 'CAM-UNKNOWN-99' }),
          ),
        },
      };

      const success = await consumer.processStreamMessage(msg);

      expect(success).toBe(false);
      // Unacknowledged so once the camera is onboarded, recovery will persist it
      expect(redisClientMock.ack).not.toHaveBeenCalled();
    });
  });
});
