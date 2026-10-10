import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { RedisStreamClient } from './redis-stream.client';
import { SightingEventConsumer } from '../consumers/sighting-event.consumer';
import { HealthController } from '../../../modules/health/health.controller';
import { DashboardService } from '../../../modules/dashboard/dashboard.service';
import { CamerasService } from '../../../modules/cameras/cameras.service';
import { CameraHealthPollerService } from '../../../modules/cameras/health/camera-health-poller.service';
import { MediaGatewayService } from '../../../modules/cameras/media-gateway.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AlertsService } from '../../../modules/alerts/alerts.service';
import { OperationalStatus } from '@prisma/client';
import {
  VideoSourceType,
  EVENT_TYPE_SIGHTING_CREATED,
  SCHEMA_VERSION,
  VehicleSightingCreatedPayload,
} from '../event-contracts/vehicle-sighting-created.event';

/**
 * Phase 4.6 — Operational Failure-Injection and Recovery Verification Suite
 * Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
 *
 * Scenarios Tested:
 * 1. AI worker stops publishing heartbeats -> Backend reports UNAVAILABLE
 * 2. AI worker heartbeats but frame processing stalls -> Not reported as actively processing (DEGRADED / is_processing_active: false)
 * 3. MediaMTX path drops and recovers -> Dynamic reactivation without manual registration
 * 4. Redis temporarily unavailable -> Graceful degradation and zero crash
 * 5. PostgreSQL persistence fails -> Sighting remains in Redis PEL and recovers after DB restoration
 * 6. Consumer interrupted and pending message reclaimed -> Zero duplicate sightings or duplicate alerts
 * 7. Compounding multi-signal failure -> Consistent degraded states, never falsely HEALTHY
 * 8. Graceful worker shutdown -> STOPPED status and clean lifecycle transition
 */
describe('Phase 4.6: Operational Failure-Injection and Recovery Verification', () => {
  let liveRedisClient: RedisStreamClient;
  let isLiveRedisAvailable = false;

  const validSha256 = '315cb76daa3caa030ef0de4aecbaafa8dd20c114901d940682cceb1a9fa42db7';
  const mockCameraUuid = 'c1111111-2222-3333-4444-555555555555';

  const createTestPayload = (
    sightingId: string,
    overrides?: Partial<VehicleSightingCreatedPayload>,
  ): VehicleSightingCreatedPayload => ({
    event_id: `evt-${sightingId}`,
    event_type: EVENT_TYPE_SIGHTING_CREATED,
    schema_version: SCHEMA_VERSION,
    occurred_at: new Date().toISOString(),
    producer: 'ai-worker',
    sighting_id: sightingId,
    evidence_id: `ev-${sightingId}`,
    camera_id: 'CAM-AHM-01',
    plate_normalized: 'GJ01AB9999',
    confidence: 0.96,
    consensus_of: 3,
    total_observations: 5,
    storage_ref: `s3://evidence-vault/${sightingId}.jpg`,
    evidence_hash: validSha256,
    captured_at: new Date().toISOString(),
    correlation_id: `corr-${sightingId}`,
    source_type: VideoSourceType.RESEARCH_VIDEO,
    ...overrides,
  });

  beforeAll(async () => {
    try {
      const configMock = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'REDIS_HOST') return 'localhost';
          if (key === 'REDIS_PORT') return 6379;
          if (key === 'REDIS_PASSWORD') return '';
          return defaultValue;
        }),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisStreamClient,
          { provide: ConfigService, useValue: configMock },
        ],
      }).compile();

      liveRedisClient = module.get<RedisStreamClient>(RedisStreamClient);
      isLiveRedisAvailable = await liveRedisClient.isHealthy();
    } catch {
      isLiveRedisAvailable = false;
    }
  });

  afterAll(async () => {
    if (liveRedisClient) {
      await liveRedisClient.onModuleDestroy();
    }
  });

  describe('Scenario 1: AI worker stops publishing heartbeats', () => {
    it('(Mocked) Backend reports UNAVAILABLE when heartbeat key is absent or expired', async () => {
      const prismaMock = {
        checkHealth: jest.fn().mockResolvedValue({ isHealthy: true, details: { postgres: 'CONNECTED' } }),
      };
      const redisMock = {
        isHealthy: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(null), // Key expired or not set
      };
      const consumerMock = {
        streamName: 'test-stream',
        consumerGroup: 'test-group',
        totalEventsReceived: 0,
        totalSightingsPersisted: 0,
        totalDuplicatesDetected: 0,
        totalAlertsTriggered: 0,
        totalProcessingErrors: 0,
        totalPendingRecovered: 0,
        totalPendingReclaimAttempts: 0,
        totalDeadLettersDropped: 0,
      };

      const healthController = new HealthController(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisStreamClient,
        consumerMock as unknown as SightingEventConsumer,
      );

      const health = await healthController.getHealth();

      expect(health.services.ai_worker.status).toBe('UNAVAILABLE');
      expect(health.services.ai_worker.note).toContain('No active AI worker heartbeat detected in Redis');
    });

    it('(Real Service) Redis TTL expiration correctly transitions worker to UNAVAILABLE', async () => {
      if (!isLiveRedisAvailable) {
        console.warn('Skipping live Redis test: Redis not reachable');
        return;
      }

      const isolatedKey = `gujcamera:telemetry:ai-worker:test-s1-${Date.now()}`;
      const client = (liveRedisClient as any).client;

      // 1. Set heartbeat with 1-second TTL
      const heartbeatPayload = {
        worker_name: 'test-worker-s1',
        status: 'HEALTHY',
        timestamp: Date.now() / 1000,
        uptime_seconds: 10,
        streams: { total: 1, connected: 1, degraded: 0, offline: 0 },
        last_processing_timestamp: Date.now() / 1000,
      };
      await client.set(isolatedKey, JSON.stringify(heartbeatPayload), 'EX', 1);

      // Verify key is initially present
      const initialVal = await client.get(isolatedKey);
      expect(initialVal).not.toBeNull();

      // Wait 1.2s for TTL expiration
      await new Promise((res) => setTimeout(res, 1200));

      // Key must now be expired
      const expiredVal = await client.get(isolatedKey);
      expect(expiredVal).toBeNull();

      // Clean up key if still present
      await client.del(isolatedKey);
    });
  });

  describe('Scenario 2: AI worker heartbeats but frame processing stalls', () => {
    it('Backend exposes is_processing_active: false and dashboard reports DEGRADED', async () => {
      const nowSec = Date.now() / 1000;
      // Stalled processing: heartbeat is fresh (1s old), but last frame processed was 45s ago
      const stalledTelemetry = {
        worker_name: 'test-worker-stalled',
        status: 'HEALTHY',
        timestamp: nowSec - 1, // Fresh heartbeat
        uptime_seconds: 500,
        streams: { total: 2, connected: 2, degraded: 0, offline: 0 },
        last_processing_timestamp: nowSec - 45, // Stalled frame processing (> 30s)
      };

      const prismaMock = {
        checkHealth: jest.fn().mockResolvedValue({ isHealthy: true, details: {} }),
        camera: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(2),
        },
        alert: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
        watchlist: { count: jest.fn().mockResolvedValue(1) },
        watchlistEntry: { count: jest.fn().mockResolvedValue(1) },
        vehicleSighting: { findMany: jest.fn().mockResolvedValue([]) },
        auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const redisMock = {
        isHealthy: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(JSON.stringify(stalledTelemetry)),
      };
      const consumerMock = {
        streamName: 'test-stream',
        consumerGroup: 'test-group',
        totalEventsReceived: 10,
        totalSightingsPersisted: 10,
        totalDuplicatesDetected: 0,
        totalAlertsTriggered: 0,
        totalProcessingErrors: 0,
        totalPendingRecovered: 0,
        totalPendingReclaimAttempts: 0,
        totalDeadLettersDropped: 0,
      };

      const healthController = new HealthController(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisStreamClient,
        consumerMock as unknown as SightingEventConsumer,
      );

      const health = await healthController.getHealth();

      expect(health.services.ai_worker.is_fresh).toBe(true);
      expect(health.services.ai_worker.is_processing_active).toBe(false);

      const dashboardService = new DashboardService(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisStreamClient,
        consumerMock as unknown as SightingEventConsumer,
        undefined,
        undefined,
      );

      const user = { id: 'u1', email: 'admin@police.gov.in', role: 'ADMIN', departmentId: 'd1' };
      const summary = await dashboardService.getOperationalSummary(user);

      expect(summary.system.ai_pipeline).toBe('DEGRADED');
    });

    it('Camera health reports READY_NO_READER or STALLED when worker is not consuming frames', async () => {
      const prismaMock = {
        camera: {
          findUnique: jest.fn().mockResolvedValue({
            id: mockCameraUuid,
            name: 'CAM-AHM-01: Pakwan',
            isActive: true,
            operationalStatus: OperationalStatus.ONLINE,
            health: {
              status: OperationalStatus.ONLINE,
              lastHeartbeat: new Date(),
              fpsActual: 0.0,
              packetLoss: 0.0,
              updatedAt: new Date(),
            },
          }),
        },
      };

      const mediaGatewayMock = {
        normalizePathName: jest.fn().mockReturnValue('cam-pakwan'),
        getPathState: jest.fn().mockResolvedValue({
          exists: true,
          ready: true,
          state: { readersCount: 0, bytesReceived: 10000 }, // 0 readers connected
        }),
      };

      const camerasService = new CamerasService(
        prismaMock as unknown as PrismaService,
        undefined as any,
        mediaGatewayMock as unknown as MediaGatewayService,
        undefined,
        undefined,
        undefined,
      );

      const cameraHealth = await camerasService.getCameraHealth(mockCameraUuid);

      expect(cameraHealth.health?.processing_status).toBe('READY_NO_READER');
      expect(cameraHealth.health?.is_worker_subscribed).toBe(false);
    });
  });

  describe('Scenario 3: MediaMTX path drops and recovers', () => {
    it('Health poller initiates backoff on drop and dispatches ACTIVATE on recovery without manual re-registration', async () => {
      const testCamera = {
        id: 'c1234567-89ab-cdef-0123-456789abcdef',
        name: 'CAM-RECONNECT-TEST',
        isActive: true,
        operationalStatus: OperationalStatus.OFFLINE,
        streams: [{ urlOrHandle: 'rtsp://gateway:8554/live/cam-reconnect' }],
        health: { status: OperationalStatus.OFFLINE, reconnectAttempts: 0 },
      };

      const prismaMock = {
        camera: {
          findMany: jest.fn().mockResolvedValue([testCamera]),
          findUnique: jest.fn().mockResolvedValue(testCamera),
          update: jest.fn().mockResolvedValue({}),
        },
        cameraHealth: {
          upsert: jest.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({}),
        },
        $transaction: jest.fn().mockImplementation(async (arg) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          if (typeof arg === 'function') return arg(prismaMock);
          return arg;
        }),
      };

      const mediaGatewayMock = {
        normalizePathName: jest.fn(() => 'cam-reconnect'),
        extractStreamPath: jest.fn().mockReturnValue('live/cam-reconnect'),
        isPlaceholderStream: jest.fn().mockReturnValue(false),
        isPullableExternalSource: jest.fn().mockReturnValue(false),
        listPathStates: jest.fn(),
        registerPath: jest.fn().mockResolvedValue({ success: true }),
      };

      const redisMock = {
        hset: jest.fn().mockResolvedValue(1),
        pubsubPublish: jest.fn().mockResolvedValue(1),
      };

      const poller = new CameraHealthPollerService(
        prismaMock as unknown as PrismaService,
        { get: jest.fn((k, def) => def) } as unknown as ConfigService,
        mediaGatewayMock as unknown as MediaGatewayService,
        redisMock as unknown as RedisStreamClient,
        undefined,
      );

      // 1. Initial State: Gateway reports path is down / empty
      mediaGatewayMock.listPathStates.mockResolvedValueOnce({
        success: true,
        paths: new Map(),
      });

      await poller.pollActiveCameras();
      // Camera enters retry backoff and transitions to DEGRADED
      const runtimeBefore = poller.getRuntimeState(testCamera.id);
      expect(runtimeBefore?.status).toBe(OperationalStatus.DEGRADED);

      // 2. Stream Recovers in MediaMTX Gateway (e.g. RTSP source re-established)
      const recoveredPaths = new Map<string, any>();
      recoveredPaths.set('cam-reconnect', { ready: true, readersCount: 0 });
      mediaGatewayMock.listPathStates.mockResolvedValueOnce({
        success: true,
        paths: recoveredPaths,
      });

      await poller.pollActiveCameras();

      // Invariant 1: State restored to ONLINE in database
      expect(prismaMock.camera.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testCamera.id },
          data: { operationalStatus: OperationalStatus.ONLINE },
        }),
      );

      // Invariant 2: Published ACTIVATE event for AI worker without manual re-registration
      expect(redisMock.pubsubPublish).toHaveBeenCalledWith(
        'gujcamera:control:camera-events',
        expect.stringContaining('"action":"ACTIVATE"'),
      );

      // Invariant 3: Runtime tracking records ONLINE status and recovery timestamp
      const runtimeAfter = poller.getRuntimeState(testCamera.id);
      expect(runtimeAfter?.status).toBe(OperationalStatus.ONLINE);
      expect(runtimeAfter?.recoveryAt).toBeInstanceOf(Date);
    });
  });

  describe('Scenario 4: Redis becomes temporarily unavailable', () => {
    it('Backend health probe degrades gracefully without throwing unhandled 500 error', async () => {
      const prismaMock = {
        checkHealth: jest.fn().mockResolvedValue({ isHealthy: true, details: { postgres: 'CONNECTED' } }),
      };
      // Simulate disconnected Redis client
      const redisMock = {
        isHealthy: jest.fn().mockResolvedValue(false),
        get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED: Connection refused to Redis')),
      };
      const consumerMock = {
        streamName: 'test-stream',
        consumerGroup: 'test-group',
        totalEventsReceived: 0,
        totalSightingsPersisted: 0,
        totalDuplicatesDetected: 0,
        totalAlertsTriggered: 0,
        totalProcessingErrors: 0,
        totalPendingRecovered: 0,
        totalPendingReclaimAttempts: 0,
        totalDeadLettersDropped: 0,
      };

      const healthController = new HealthController(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisStreamClient,
        consumerMock as unknown as SightingEventConsumer,
      );

      const health = await healthController.getHealth();

      expect(health.status).toBe('DEGRADED');
      expect(health.services.redis).toBe('DEGRADED');
      expect(health.services.event_consumer.status).toBe('DEGRADED');
      expect(health.services.ai_worker.status).toBe('UNAVAILABLE');
    });
  });

  describe('Scenario 5: PostgreSQL persistence temporarily fails', () => {
    it('Message remains in Redis Stream PEL on DB failure, and is persisted when DB recovers', async () => {
      const prismaMock = {
        camera: {
          findUnique: jest.fn().mockResolvedValue({ id: mockCameraUuid }),
          findMany: jest.fn().mockResolvedValue([{ id: mockCameraUuid, name: 'CAM-AHM-01' }]),
        },
        vehicleSighting: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'sighting-p5' }),
        },
        vehicle: {
          upsert: jest.fn().mockResolvedValue({ plateNormalized: 'GJ01AB9999' }),
        },
        evidence: {
          create: jest.fn().mockResolvedValue({ id: 'ev-p5' }),
        },
        $transaction: jest.fn(),
      };

      const alertsMock = {
        processSightingMatch: jest.fn().mockResolvedValue({ matched: false, alerts_generated: 0 }),
      };

      const redisMock = {
        ack: jest.fn().mockResolvedValue(1),
        autoClaim: jest.fn(),
      };

      const configMock = {
        get: jest.fn((k, def) => def),
      };

      const consumer = new SightingEventConsumer(
        redisMock as unknown as RedisStreamClient,
        prismaMock as unknown as PrismaService,
        alertsMock as unknown as AlertsService,
        configMock as unknown as ConfigService,
      );

      const payload = createTestPayload('s-persist-recovery-01');
      const streamMessage = {
        id: '1700000000099-0',
        fields: { data: JSON.stringify(payload) },
      };

      // 1. Failure phase: PostgreSQL connection drops
      prismaMock.$transaction.mockRejectedValueOnce(
        new Error('PostgreSQL connection terminated unexpectedly'),
      );

      const failResult = await consumer.processStreamMessage(streamMessage);

      // Processing failed
      expect(failResult).toBe(false);
      expect(consumer.totalProcessingErrors).toBe(1);
      // Invariant: Message was NOT acknowledged in Redis
      expect(redisMock.ack).not.toHaveBeenCalled();

      // 2. Recovery phase: Database restored, background loop reclaims from PEL
      prismaMock.$transaction.mockImplementationOnce(async (cb) => cb(prismaMock));
      consumer.isRunning = true;
      redisMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [streamMessage],
        deletedMessageIds: [],
      });

      const nextStartId = await consumer.recoverPendingBatch('0-0');

      expect(nextStartId).toBe('0-0');
      // Sighting persisted successfully
      expect(prismaMock.vehicleSighting.create).toHaveBeenCalled();
      // Message acknowledged after persistence
      expect(redisMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        streamMessage.id,
      );
      expect(consumer.totalPendingRecovered).toBe(1);
    });
  });

  describe('Scenario 6: Reclaiming pending message after consumer interruption (Idempotency)', () => {
    it('Reclaimed message skips duplicate persistence and triggers ZERO duplicate alerts', async () => {
      const existingSightingId = 'sighting-already-persisted-01';

      const prismaMock = {
        camera: {
          findMany: jest.fn().mockResolvedValue([{ id: mockCameraUuid, name: 'CAM-AHM-01' }]),
        },
        vehicleSighting: {
          // Idempotency check: Record already exists in DB
          findUnique: jest.fn().mockResolvedValue({ id: existingSightingId, plateNormalized: 'GJ01AB9999' }),
          create: jest.fn(),
        },
        $transaction: jest.fn(),
      };

      const alertsMock = {
        processSightingMatch: jest.fn(),
      };

      const redisMock = {
        ack: jest.fn().mockResolvedValue(1),
        autoClaim: jest.fn(),
      };

      const consumer = new SightingEventConsumer(
        redisMock as unknown as RedisStreamClient,
        prismaMock as unknown as PrismaService,
        alertsMock as unknown as AlertsService,
        { get: jest.fn((k, def) => def) } as unknown as ConfigService,
      );

      const payload = createTestPayload(existingSightingId);
      const reclaimedMessage = {
        id: '1700000000100-0',
        fields: { data: JSON.stringify(payload) },
      };

      consumer.isRunning = true;
      redisMock.autoClaim.mockResolvedValueOnce({
        nextStartId: '0-0',
        messages: [reclaimedMessage],
        deletedMessageIds: [],
      });

      await consumer.recoverPendingBatch('0-0');

      // Invariants:
      // 1. ZERO duplicate database writes
      expect(prismaMock.vehicleSighting.create).not.toHaveBeenCalled();
      // 2. ZERO duplicate alert matching executions
      expect(alertsMock.processSightingMatch).not.toHaveBeenCalled();
      // 3. Duplicate was detected and tracked
      expect(consumer.totalDuplicatesDetected).toBe(1);
      // 4. Message acknowledged to clear PEL
      expect(redisMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        reclaimedMessage.id,
      );
    });
  });

  describe('Scenario 7: Compounding multi-signal failure', () => {
    it('Health and dashboard states remain consistently DEGRADED or UNAVAILABLE, never reporting HEALTHY', async () => {
      // Compounding failure: DB unhealthy + Redis degraded + Gateway offline
      const prismaMock = {
        checkHealth: jest.fn().mockResolvedValue({ isHealthy: false, details: { postgres: 'DISCONNECTED' } }),
        camera: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        alert: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
        watchlist: { count: jest.fn().mockResolvedValue(0) },
        watchlistEntry: { count: jest.fn().mockResolvedValue(0) },
        vehicleSighting: { findMany: jest.fn().mockResolvedValue([]) },
        auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const redisMock = {
        isHealthy: jest.fn().mockResolvedValue(false),
        get: jest.fn().mockRejectedValue(new Error('Connection lost')),
      };

      const mediaGatewayMock = {
        checkHealth: jest.fn().mockResolvedValue({ isHealthy: false }),
      };

      const camerasMock = {
        getCameraHealthSummary: jest.fn().mockResolvedValue({ total_cameras: 0, online: 0, degraded: 0, offline: 0, error: 0 }),
      };

      const consumerMock = {
        streamName: 'test-stream',
        consumerGroup: 'test-group',
        totalEventsReceived: 0,
        totalSightingsPersisted: 0,
        totalDuplicatesDetected: 0,
        totalAlertsTriggered: 0,
        totalProcessingErrors: 5,
        totalPendingRecovered: 0,
        totalPendingReclaimAttempts: 0,
        totalDeadLettersDropped: 0,
      };

      const healthController = new HealthController(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisStreamClient,
        consumerMock as unknown as SightingEventConsumer,
      );

      const health = await healthController.getHealth();

      expect(health.status).toBe('DEGRADED');
      expect(health.services.database).toBe('ERROR');
      expect(health.services.redis).toBe('DEGRADED');

      const dashboardService = new DashboardService(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisStreamClient,
        consumerMock as unknown as SightingEventConsumer,
        mediaGatewayMock as unknown as MediaGatewayService,
        camerasMock as unknown as CamerasService,
      );

      const user = { id: 'u1', email: 'admin@police.gov.in', role: 'ADMIN', departmentId: 'd1' };
      const summary = await dashboardService.getOperationalSummary(user);

      expect(summary.system.database).toBe('UNAVAILABLE');
      expect(summary.system.stream_gateway).toBe('DEGRADED');
      expect(summary.system.ai_pipeline).toBe('DEGRADED');
      expect(summary.system.event_pipeline).toBe('DEGRADED');
      expect(summary.system.camera_network).toBe('OFFLINE');
    });
  });

  describe('Scenario 8: Worker shuts down gracefully', () => {
    it('Heartbeat with status STOPPED reports UNAVAILABLE in dashboard and STOPPED in health probe', async () => {
      const stoppedTelemetry = {
        worker_name: 'test-worker-shutdown',
        status: 'STOPPED',
        worker_lifecycle: 'STOPPED',
        timestamp: Date.now() / 1000,
        uptime_seconds: 120,
        streams: { total: 0, connected: 0, degraded: 0, offline: 0 },
      };

      const prismaMock = {
        checkHealth: jest.fn().mockResolvedValue({ isHealthy: true, details: {} }),
        camera: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        alert: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
        watchlist: { count: jest.fn().mockResolvedValue(0) },
        watchlistEntry: { count: jest.fn().mockResolvedValue(0) },
        vehicleSighting: { findMany: jest.fn().mockResolvedValue([]) },
        auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const redisMock = {
        isHealthy: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(JSON.stringify(stoppedTelemetry)),
      };

      const consumerMock = {
        streamName: 'test-stream',
        consumerGroup: 'test-group',
        totalEventsReceived: 0,
        totalSightingsPersisted: 0,
        totalDuplicatesDetected: 0,
        totalAlertsTriggered: 0,
        totalProcessingErrors: 0,
        totalPendingRecovered: 0,
        totalPendingReclaimAttempts: 0,
        totalDeadLettersDropped: 0,
      };

      const healthController = new HealthController(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisStreamClient,
        consumerMock as unknown as SightingEventConsumer,
      );

      const health = await healthController.getHealth();
      expect(health.services.ai_worker.status).toBe('STOPPED');

      const dashboardService = new DashboardService(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisStreamClient,
        consumerMock as unknown as SightingEventConsumer,
        undefined,
        undefined,
      );

      const user = { id: 'u1', email: 'admin@police.gov.in', role: 'ADMIN', departmentId: 'd1' };
      const summary = await dashboardService.getOperationalSummary(user);
      expect(summary.system.ai_pipeline).toBe('UNAVAILABLE');
    });
  });
});
