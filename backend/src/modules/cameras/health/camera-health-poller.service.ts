import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MediaGatewayService } from '../media-gateway.service';
import { RedisStreamClient } from '../../../common/events/redis/redis-stream.client';
import { LocalEncryptedCredentialProvider } from '../credentials/local-encrypted-credential.provider';
import { OperationalStatus, CameraProtocol } from '@prisma/client';
import {
  sanitizeStreamUrl,
  stripCredentialsFromUrl,
} from '../../../common/utils/url-sanitizer.util';

export interface CameraRuntimeHealth {
  cameraId: string;
  cameraName: string;
  pathName: string;
  status: OperationalStatus;
  consecutiveFailures: number;
  reconnectAttempts: number;
  nextReconnectAt: number;
  lastSeenAt: Date | null;
  lastSuccessAt: Date | null;
  lastTransitionAt: Date;
  failureReason: string | null;
  recoveryAt: Date | null;
  isReconnecting: boolean;
  lastDatabasePersistAt: number;
}

export interface HealthPollerMetrics {
  camerasChecked: number;
  camerasOnline: number;
  camerasDegraded: number;
  camerasOffline: number;
  camerasError: number;
  reconnectAttempts: number;
  reconnectSuccesses: number;
  reconnectFailures: number;
  healthCheckFailures: number;
  lastPollDurationMs: number;
  totalPollCycles: number;
}

@Injectable()
export class CameraHealthPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CameraHealthPollerService.name);

  // Configuration options with production-safe defaults
  public readonly pollIntervalMs: number;
  public readonly reconnectInitialDelayMs: number;
  public readonly reconnectMaxDelayMs: number;
  public readonly reconnectMaxAttempts: number;
  public readonly batchSize: number;
  private readonly autoStart: boolean;

  // In-memory runtime state dictionary (per-camera)
  private readonly runtimeStates = new Map<string, CameraRuntimeHealth>();

  // Timer loop control
  private pollTimeout: NodeJS.Timeout | null = null;
  private isPolling = false;
  private isDestroyed = false;

  // Observability metrics
  private readonly metrics: HealthPollerMetrics = {
    camerasChecked: 0,
    camerasOnline: 0,
    camerasDegraded: 0,
    camerasOffline: 0,
    camerasError: 0,
    reconnectAttempts: 0,
    reconnectSuccesses: 0,
    reconnectFailures: 0,
    healthCheckFailures: 0,
    lastPollDurationMs: 0,
    totalPollCycles: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() @Inject(MediaGatewayService) private readonly mediaGatewayService?: MediaGatewayService,
    @Optional() @Inject(RedisStreamClient) private readonly redisClient?: RedisStreamClient,
    @Optional() @Inject(LocalEncryptedCredentialProvider) private readonly credentialStore?: LocalEncryptedCredentialProvider,
  ) {
    this.pollIntervalMs = parseInt(
      this.configService.get<string>('CAMERA_HEALTH_POLL_INTERVAL_MS', '15000'),
      10,
    );
    this.reconnectInitialDelayMs = parseInt(
      this.configService.get<string>('CAMERA_RECONNECT_INITIAL_DELAY_MS', '2000'),
      10,
    );
    this.reconnectMaxDelayMs = parseInt(
      this.configService.get<string>('CAMERA_RECONNECT_MAX_DELAY_MS', '30000'),
      10,
    );
    this.reconnectMaxAttempts = parseInt(
      this.configService.get<string>('CAMERA_RECONNECT_MAX_ATTEMPTS', '5'),
      10,
    );
    this.batchSize = parseInt(
      this.configService.get<string>('CAMERA_HEALTH_POLL_BATCH_SIZE', '50'),
      10,
    );
    this.autoStart =
      this.configService.get<string>('CAMERA_HEALTH_AUTO_START', 'true') !== 'false';
  }

  async onModuleInit(): Promise<void> {
    if (this.autoStart) {
      this.startPollingLoop();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopPollingLoop();
  }

  /**
   * Start recurring background polling loop using setTimeout recursion
   * (Guarantees zero overlapping execution cycles).
   */
  startPollingLoop(): void {
    if (this.pollTimeout || this.isDestroyed) return;
    this.logger.log(
      `[HealthPoller] Background camera health monitoring started (Interval: ${this.pollIntervalMs}ms, Max Retries: ${this.reconnectMaxAttempts})`,
    );
    this.scheduleNextPoll(this.pollIntervalMs);
  }

  /**
   * Gracefully stop the polling loop and cancel pending timers
   */
  stopPollingLoop(): void {
    this.isDestroyed = true;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    this.logger.log('[HealthPoller] Background camera health monitoring stopped');
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.isDestroyed) return;
    this.pollTimeout = setTimeout(async () => {
      try {
        await this.pollActiveCameras();
      } catch (err: any) {
        this.logger.error(`[HealthPoller] Unexpected error in polling cycle: ${err.message}`);
      } finally {
        this.pollTimeout = null;
        if (!this.isDestroyed) {
          this.scheduleNextPoll(this.pollIntervalMs);
        }
      }
    }, delayMs);
  }

  /**
   * Main polling routine: inspects active registered cameras, queries authoritative
   * MediaMTX path state, determines health transitions, and initiates bounded backoff reconnection.
   */
  async pollActiveCameras(): Promise<void> {
    if (this.isPolling) {
      this.logger.warn('[HealthPoller] Previous health poll cycle still running, skipping overlap');
      return;
    }

    this.isPolling = true;
    const startTime = Date.now();
    this.metrics.totalPollCycles += 1;

    try {
      // 1. Fetch active registered cameras from database
      const activeCameras = await this.prisma.camera.findMany({
        where: { isActive: true },
        include: {
          streams: true,
          health: true,
          credential: { select: { id: true, credentialType: true } },
        },
      });

      this.metrics.camerasChecked = activeCameras.length;

      if (activeCameras.length === 0) {
        this.metrics.lastPollDurationMs = Date.now() - startTime;
        return;
      }

      // 2. Query MediaMTX path readiness in a single batch call (scalable toward large fleets)
      let pathStates = new Map<string, any>();
      let mediaMtxAvailable = false;

      if (this.mediaGatewayService) {
        const pathListResult = await this.mediaGatewayService.listPathStates(4000);
        if (pathListResult.success) {
          pathStates = pathListResult.paths;
          mediaMtxAvailable = true;
        } else {
          this.metrics.healthCheckFailures += 1;
          this.logger.warn(`[HealthPoller] MediaMTX path state query failed: ${pathListResult.error}`);
        }
      }

      // 3. Process each camera with bounded concurrency
      let onlineCount = 0;
      let degradedCount = 0;
      let offlineCount = 0;
      let errorCount = 0;

      for (let i = 0; i < activeCameras.length; i += this.batchSize) {
        const batch = activeCameras.slice(i, i + this.batchSize);
        await Promise.all(
          batch.map(async (camera) => {
            const status = await this.evaluateCameraHealth(camera, pathStates, mediaMtxAvailable);
            if (status === OperationalStatus.ONLINE) onlineCount++;
            else if (status === OperationalStatus.DEGRADED) degradedCount++;
            else if (status === OperationalStatus.OFFLINE) offlineCount++;
            else if (status === OperationalStatus.ERROR) errorCount++;
          }),
        );
      }

      this.metrics.camerasOnline = onlineCount;
      this.metrics.camerasDegraded = degradedCount;
      this.metrics.camerasOffline = offlineCount;
      this.metrics.camerasError = errorCount;
    } catch (err: any) {
      this.metrics.healthCheckFailures += 1;
      this.logger.error(`[HealthPoller] Failed to execute camera health poll: ${err.message}`);
    } finally {
      this.metrics.lastPollDurationMs = Date.now() - startTime;
      this.isPolling = false;
    }
  }

  /**
   * Deterministic evaluation of an individual camera's health state.
   * Compares authoritative MediaMTX path state with in-memory retry tracking.
   * STRICT WRITE-STORM PREVENTION: Only persists to DB when a material transition occurs.
   */
  async evaluateCameraHealth(
    camera: any,
    pathStates: Map<string, any>,
    mediaMtxAvailable: boolean,
  ): Promise<OperationalStatus> {
    // Safety check: Decommissioned camera must never be monitored or updated
    if (!camera.isActive) {
      this.forgetCamera(camera.id);
      return OperationalStatus.OFFLINE;
    }

    const pathName = this.mediaGatewayService
      ? this.mediaGatewayService.normalizePathName(camera.name, camera.id)
      : `cam-${camera.id.slice(0, 8)}`;

    const runtime = this.getOrCreateRuntimeState(camera, pathName);

    // If camera is explicitly in ERROR state, it requires revalidation or credential update
    if (camera.operationalStatus === OperationalStatus.ERROR && runtime.status === OperationalStatus.ERROR) {
      return OperationalStatus.ERROR;
    }

    // Inspect MediaMTX path state
    const pathState = pathStates.get(pathName);
    const isStreamReady = Boolean(pathState && pathState.ready);
    const pathExistsInGateway = Boolean(pathState || (pathStates.size > 0 && pathStates.has(pathName)));

    // Case 1: Stream is confirmed ONLINE and ready by MediaMTX
    if (mediaMtxAvailable && isStreamReady) {
      return this.handleStreamOnline(camera, runtime, pathName, pathState);
    }

    // Case 2: Gateway is completely unavailable or stream path is not ready
    const failureReason = !mediaMtxAvailable
      ? 'Media gateway control plane unreachable'
      : !pathExistsInGateway
        ? 'Stream path not configured in media gateway'
        : 'Stream source disconnected or unreadable by gateway';

    return this.handleStreamFailure(camera, runtime, pathName, failureReason);
  }

  /**
   * Handle stream confirmed healthy/online
   */
  private async handleStreamOnline(
    camera: any,
    runtime: CameraRuntimeHealth,
    pathName: string,
    pathState: any,
  ): Promise<OperationalStatus> {
    const previousStatus = runtime.status;
    const now = new Date();

    runtime.lastSeenAt = now;
    runtime.lastSuccessAt = now;
    runtime.consecutiveFailures = 0;
    runtime.reconnectAttempts = 0;
    runtime.failureReason = null;

    // Check if recovery transition occurred (e.g. DEGRADED -> ONLINE or OFFLINE -> ONLINE)
    const isRecovery =
      previousStatus === OperationalStatus.DEGRADED ||
      previousStatus === OperationalStatus.OFFLINE ||
      previousStatus === OperationalStatus.ERROR ||
      camera.operationalStatus !== OperationalStatus.ONLINE;

    if (isRecovery) {
      runtime.status = OperationalStatus.ONLINE;
      runtime.recoveryAt = now;
      runtime.lastTransitionAt = now;
      runtime.lastDatabasePersistAt = Date.now();

      this.logger.log(
        `[HealthPoller] Camera [${camera.id}] recovered to ONLINE (path: ${pathName})`,
      );

      // 1. Persist recovery to database
      await this.persistCameraState(
        camera.id,
        OperationalStatus.ONLINE,
        0.0,
        now,
      );

      // 2. Sync to Redis active streams & publish ACTIVATE event
      await this.syncRedisStreamState(
        camera,
        pathName,
        OperationalStatus.ONLINE,
        'ACTIVATE',
      );

      // 3. Emit Audit Log for recovery
      await this.recordAuditLog(
        camera.id,
        'CAMERA_RECOVERED',
        { status: previousStatus },
        { status: OperationalStatus.ONLINE, pathName, recoveredAt: now.toISOString() },
      );
    } else {
      // WRITE STORM PREVENTION: ONLINE -> ONLINE produces ZERO database writes and ZERO audit logs
      runtime.status = OperationalStatus.ONLINE;
    }

    return OperationalStatus.ONLINE;
  }

  /**
   * Handle stream missing, not ready, or failing
   */
  private async handleStreamFailure(
    camera: any,
    runtime: CameraRuntimeHealth,
    pathName: string,
    reason: string,
  ): Promise<OperationalStatus> {
    const now = new Date();
    const nowMs = Date.now();
    runtime.consecutiveFailures += 1;
    runtime.failureReason = reason;

    // Determine target state based on reconnect attempts vs max threshold
    if (runtime.reconnectAttempts >= this.reconnectMaxAttempts) {
      // Reconnect retry policy EXHAUSTED: transition to OFFLINE
      if (runtime.status !== OperationalStatus.OFFLINE || camera.operationalStatus !== OperationalStatus.OFFLINE) {
        const previousStatus = runtime.status;
        runtime.status = OperationalStatus.OFFLINE;
        runtime.lastTransitionAt = now;
        runtime.lastDatabasePersistAt = nowMs;

        this.logger.warn(
          `[HealthPoller] Camera [${camera.id}] retry exhausted (${runtime.reconnectAttempts}/${this.reconnectMaxAttempts}), transitioned to OFFLINE`,
        );

        // 1. Persist OFFLINE state to DB
        await this.persistCameraState(
          camera.id,
          OperationalStatus.OFFLINE,
          null,
          now,
        );

        // 2. Sync to Redis active streams
        await this.syncRedisStreamState(
          camera,
          pathName,
          OperationalStatus.OFFLINE,
        );

        // 3. Emit Audit Log for retry exhaustion and camera offline
        await this.recordAuditLog(
          camera.id,
          'CAMERA_RECONNECT_EXHAUSTED',
          { status: previousStatus, reconnectAttempts: runtime.reconnectAttempts },
          { status: OperationalStatus.OFFLINE, reason, maxAttempts: this.reconnectMaxAttempts },
        );
        await this.recordAuditLog(
          camera.id,
          'CAMERA_OFFLINE',
          { status: previousStatus },
          { status: OperationalStatus.OFFLINE, reason },
        );
      }
      return OperationalStatus.OFFLINE;
    }

    // Still within retry limits: transition to or maintain DEGRADED
    if (runtime.status === OperationalStatus.ONLINE || camera.operationalStatus === OperationalStatus.ONLINE) {
      // Transition from ONLINE -> DEGRADED
      const previousStatus = runtime.status;
      runtime.status = OperationalStatus.DEGRADED;
      runtime.lastTransitionAt = now;
      runtime.lastDatabasePersistAt = nowMs;

      this.logger.warn(
        `[HealthPoller] Camera [${camera.id}] health degraded: ${reason}. Entering reconnection backoff.`,
      );

      // 1. Persist DEGRADED state to DB
      await this.persistCameraState(
        camera.id,
        OperationalStatus.DEGRADED,
        null,
        now,
      );

      // 2. Sync to Redis
      await this.syncRedisStreamState(
        camera,
        pathName,
        OperationalStatus.DEGRADED,
      );

      // 3. Emit Audit Log
      await this.recordAuditLog(
        camera.id,
        'CAMERA_HEALTH_DEGRADED',
        { status: previousStatus },
        { status: OperationalStatus.DEGRADED, reason },
      );
    } else {
      // Already DEGRADED or previously OFFLINE: update in-memory status
      runtime.status = OperationalStatus.DEGRADED;
    }

    // Execute Bounded Exponential Backoff Reconnection Reconciliation
    if (nowMs >= runtime.nextReconnectAt && !runtime.isReconnecting) {
      await this.attemptReconnection(camera, runtime, pathName);
    }

    return OperationalStatus.DEGRADED;
  }

  /**
   * Execute bounded exponential backoff reconnection reconciliation
   */
  async attemptReconnection(
    camera: any,
    runtime: CameraRuntimeHealth,
    pathName: string,
  ): Promise<void> {
    runtime.isReconnecting = true;
    this.metrics.reconnectAttempts += 1;
    const attemptIndex = runtime.reconnectAttempts;

    // Calculate bounded exponential backoff delay: min(initial * 2^attempts, maxDelay)
    const backoffDelay = Math.min(
      this.reconnectInitialDelayMs * Math.pow(2, attemptIndex),
      this.reconnectMaxDelayMs,
    );
    runtime.nextReconnectAt = Date.now() + backoffDelay;
    runtime.reconnectAttempts += 1;

    this.logger.log(
      `[HealthPoller] Executing reconnect reconciliation for camera [${camera.id}] (Attempt ${runtime.reconnectAttempts}/${this.reconnectMaxAttempts}, next retry in ${backoffDelay}ms)`,
    );

    try {
      // Step A: Check if camera has been decommissioned in the meantime
      const currentCamera = await this.prisma.camera.findUnique({
        where: { id: camera.id },
        select: { isActive: true, operationalStatus: true },
      });

      if ((currentCamera && !currentCamera.isActive) || (!currentCamera && !camera.isActive)) {
        this.logger.log(`[HealthPoller] Camera [${camera.id}] is no longer active, aborting reconnect`);
        this.forgetCamera(camera.id);
        return;
      }

      // Step B: Reconcile MediaMTX path configuration if MediaGatewayService is present
      if (this.mediaGatewayService && camera.streams && camera.streams.length > 0) {
        const stream = camera.streams[0];
        const cleanEndpoint = stripCredentialsFromUrl(stream.urlOrHandle);

        if (cleanEndpoint && !this.mediaGatewayService.isInternalGatewayStream(cleanEndpoint)) {
          // Resolve current credentials directly from CredentialStore in RAM only
          let sourceUrl = cleanEndpoint;
          if (this.credentialStore) {
            try {
              const creds = await this.credentialStore.getDecryptedCredential(camera.id);
              if (creds && creds.username && creds.password) {
                const parsed = new URL(cleanEndpoint);
                parsed.username = encodeURIComponent(creds.username);
                parsed.password = encodeURIComponent(creds.password);
                sourceUrl = parsed.toString();
              }
            } catch (credErr: any) {
              this.logger.error(
                `[HealthPoller] Failed to decrypt credentials for camera [${camera.id}] during reconnect: ${credErr.message}`,
              );
              await this.transitionToError(camera, runtime, pathName, 'Credential decryption failure during reconnect');
              return;
            }
          }

          // Register or refresh path in MediaMTX
          const regResult = await this.mediaGatewayService.registerPath(pathName, sourceUrl);
          if (!regResult.success) {
            this.metrics.reconnectFailures += 1;
            this.logger.warn(
              `[HealthPoller] Reconnect path registration for [${pathName}] rejected by gateway: ${regResult.error}`,
            );

            // If gateway rejected with auth error, transition to ERROR
            if (regResult.error && (regResult.error.includes('401') || regResult.error.includes('403') || regResult.error.includes('Unauthorized'))) {
              await this.transitionToError(camera, runtime, pathName, 'Authentication failure from camera source');
              return;
            }
            return;
          }

          this.metrics.reconnectSuccesses += 1;
          this.logger.log(`[HealthPoller] Reconnected and updated MediaMTX path config for [${pathName}]`);
        }
      }
    } catch (err: any) {
      this.metrics.reconnectFailures += 1;
      this.logger.error(`[HealthPoller] Error during reconnect attempt for camera [${camera.id}]: ${err.message}`);
    } finally {
      runtime.isReconnecting = false;
    }
  }

  /**
   * Transition camera to ERROR state (due to configuration, authentication, or unrecoverable gateway failure)
   */
  async transitionToError(
    camera: any,
    runtime: CameraRuntimeHealth,
    pathName: string,
    reason: string,
  ): Promise<OperationalStatus> {
    const previousStatus = runtime.status;
    const now = new Date();

    runtime.status = OperationalStatus.ERROR;
    runtime.failureReason = reason;
    runtime.lastTransitionAt = now;
    runtime.lastDatabasePersistAt = Date.now();

    this.logger.error(`[HealthPoller] Camera [${camera.id}] transitioned to ERROR: ${reason}`);

    // 1. Persist ERROR state to DB
    await this.persistCameraState(
      camera.id,
      OperationalStatus.ERROR,
      null,
      now,
    );

    // 2. Sync to Redis
    await this.syncRedisStreamState(
      camera,
      pathName,
      OperationalStatus.ERROR,
    );

    // 3. Emit Audit Log
    await this.recordAuditLog(
      camera.id,
      'CAMERA_ERROR',
      { status: previousStatus },
      { status: OperationalStatus.ERROR, reason, pathName },
    );

    return OperationalStatus.ERROR;
  }

  /**
   * Persist camera operational status and CameraHealth record in database
   */
  private async persistCameraState(
    cameraId: string,
    status: OperationalStatus,
    packetLoss: number | null,
    now: Date,
  ): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.camera.update({
          where: { id: cameraId },
          data: { operationalStatus: status },
        }),
        this.prisma.cameraHealth.upsert({
          where: { cameraId },
          create: {
            cameraId,
            status,
            lastHeartbeat: now,
            fpsActual: status === OperationalStatus.ONLINE ? 15.0 : 0.0,
            packetLoss: packetLoss !== null ? packetLoss : undefined,
          },
          update: {
            status,
            lastHeartbeat: now,
            fpsActual: status === OperationalStatus.ONLINE ? 15.0 : 0.0,
            packetLoss: packetLoss !== null ? packetLoss : undefined,
          },
        }),
      ]);
    } catch (dbErr: any) {
      this.logger.error(
        `[HealthPoller] Failed to persist camera state transition for [${cameraId}]: ${dbErr.message}`,
      );
    }
  }

  /**
   * Synchronize camera operational status into Redis active-streams hash and optionally publish event
   */
  private async syncRedisStreamState(
    camera: any,
    pathName: string,
    status: OperationalStatus,
    publishAction?: 'ACTIVATE' | 'DEACTIVATE',
  ): Promise<void> {
    if (!this.redisClient) return;

    try {
      const stream = camera.streams?.[0];
      const cleanUrl = stream?.urlOrHandle
        ? sanitizeStreamUrl(stream.urlOrHandle)
        : `rtsp://video-gateway:8554/${pathName}`;

      const registryPayload = JSON.stringify({
        id: camera.id,
        name: camera.name,
        internal_url: cleanUrl,
        path_name: pathName,
        status,
      });

      await this.redisClient.hset('gujcamera:registry:active-streams', camera.id, registryPayload);

      if (publishAction) {
        await this.redisClient.pubsubPublish(
          'gujcamera:control:camera-events',
          JSON.stringify({
            action: publishAction,
            camera_id: camera.id,
            internal_url: cleanUrl,
            path_name: pathName,
          }),
        );
      }
    } catch (redisErr: any) {
      this.logger.warn(
        `[HealthPoller] Redis stream sync deferred for camera [${camera.id}]: ${redisErr.message}`,
      );
    }
  }

  /**
   * Helper to write structured audit logs for health state transitions
   */
  private async recordAuditLog(
    cameraId: string,
    action: string,
    before: any,
    after: any,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          resource: 'CameraHealth',
          before,
          after,
        },
      });
    } catch (auditErr: any) {
      this.logger.warn(`[HealthPoller] Audit log creation deferred: ${auditErr.message}`);
    }
  }

  /**
   * Retrieve or initialize in-memory runtime health tracker
   */
  private getOrCreateRuntimeState(camera: any, pathName: string): CameraRuntimeHealth {
    let state = this.runtimeStates.get(camera.id);
    if (!state) {
      state = {
        cameraId: camera.id,
        cameraName: camera.name,
        pathName,
        status: camera.operationalStatus || OperationalStatus.OFFLINE,
        consecutiveFailures: 0,
        reconnectAttempts: 0,
        nextReconnectAt: 0,
        lastSeenAt: camera.health?.lastHeartbeat ? new Date(camera.health.lastHeartbeat) : null,
        lastSuccessAt: camera.operationalStatus === OperationalStatus.ONLINE ? new Date() : null,
        lastTransitionAt: new Date(),
        failureReason: null,
        recoveryAt: null,
        isReconnecting: false,
        lastDatabasePersistAt: 0,
      };
      this.runtimeStates.set(camera.id, state);
    }
    return state;
  }

  /**
   * Decommission Safety: Remove camera from in-memory tracking.
   * Ensures decommissioned camera will never be polled or resurrected.
   */
  forgetCamera(cameraId: string): void {
    if (this.runtimeStates.has(cameraId)) {
      this.runtimeStates.delete(cameraId);
      this.logger.log(`[HealthPoller] Camera [${cameraId}] removed from health monitoring`);
    }
  }

  /**
   * Credential Rotation Safety: Reset failure state on credential rotation
   * so the poller reconciles fresh credentials without stale backoff.
   */
  notifyCredentialRotated(cameraId: string): void {
    const state = this.runtimeStates.get(cameraId);
    if (state) {
      state.consecutiveFailures = 0;
      state.reconnectAttempts = 0;
      state.nextReconnectAt = 0;
      state.failureReason = null;
      this.logger.log(
        `[HealthPoller] Reconnect state reset for camera [${cameraId}] following credential rotation`,
      );
    }
  }

  /**
   * Expose runtime telemetry for a specific camera (used by getCameraHealth API)
   */
  getRuntimeState(cameraId: string): CameraRuntimeHealth | undefined {
    return this.runtimeStates.get(cameraId);
  }

  /**
   * Expose structured observability metrics
   */
  getMetrics(): HealthPollerMetrics {
    return { ...this.metrics };
  }
}
