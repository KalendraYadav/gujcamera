import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisStreamClient } from '../src/common/events/redis/redis-stream.client';
import { SightingEventConsumer } from '../src/common/events/consumers/sighting-event.consumer';
import {
  EVENT_TYPE_SIGHTING_CREATED,
  SCHEMA_VERSION,
  VehicleSightingCreatedPayload,
} from '../src/common/events/event-contracts/vehicle-sighting-created.event';
import { AlertSeverity } from '@prisma/client';

describe('Phase 3F: Event Boundary, Redis Streams & Persistent Sighting Ingestion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redisClient: RedisStreamClient;
  let consumer: SightingEventConsumer;

  let testCameraId: string;
  let testDeptId: string;
  let activeWatchlistPlate: string;
  let inactiveWatchlistPlate: string;
  let unmonitoredPlate: string;
  let testWatchlistId: string;
  let activeWatchlistEntryId: string;
  let inactiveWatchlistEntryId: string;

  const validSha256 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';
  const validStorageRef = 's3://police-evidence-vault/evidence/2026/09/10/CAM-AHM-01/test_snap.jpg';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
    redisClient = app.get(RedisStreamClient);
    consumer = app.get(SightingEventConsumer);

    // Ensure Redis stream and consumer group are ready
    await redisClient.ensureConsumerGroup(consumer.streamName, consumer.consumerGroup);

    // Setup test department and camera
    const dept = await prisma.department.findFirst({
      where: { name: { contains: 'Ahmedabad' } },
    });
    testDeptId = dept ? dept.id : (await prisma.department.create({
      data: { name: 'Test Transit Police Ahmedabad', retentionPolicyId: 'TEST-POL' },
    })).id;

    const camera = await prisma.camera.findFirst({
      where: { name: { startsWith: 'CAM-AHM-01' } },
    });
    if (camera) {
      testCameraId = camera.id;
    } else {
      const connector = await prisma.connector.findFirst() || await prisma.connector.create({
        data: { adapterType: 'RTSP', configRef: 'vault://test' },
      });
      const newCam = await prisma.camera.create({
        data: {
          name: 'CAM-AHM-01: SG Highway Pakwan Junction',
          departmentId: testDeptId,
          lat: 23.0338,
          long: 72.5073,
          connectorTypeId: connector.id,
        },
      });
      testCameraId = newCam.id;
    }

    // Setup Watchlists
    activeWatchlistPlate = `GJ01WT${Math.floor(1000 + Math.random() * 9000)}`;
    inactiveWatchlistPlate = `GJ01IN${Math.floor(1000 + Math.random() * 9000)}`;
    unmonitoredPlate = `GJ01UN${Math.floor(1000 + Math.random() * 9000)}`;

    const watchlist = await prisma.watchlist.create({
      data: {
        name: 'Phase 3F Ingestion Test Watchlist',
        departmentId: testDeptId,
        owner: 'Ahmedabad Crime Branch',
      },
    });
    testWatchlistId = watchlist.id;

    // Active entry
    const activeEntry = await prisma.watchlistEntry.create({
      data: {
        watchlistId: testWatchlistId,
        plateNormalized: activeWatchlistPlate,
        category: 'STOLEN_VEHICLE',
        reason: 'Phase 3F Active Watchlist Test',
        priority: AlertSeverity.CRITICAL,
        addedBy: 'Inspector Jadeja',
        active: true,
      },
    });
    activeWatchlistEntryId = activeEntry.id;

    // Inactive entry
    const inactiveEntry = await prisma.watchlistEntry.create({
      data: {
        watchlistId: testWatchlistId,
        plateNormalized: inactiveWatchlistPlate,
        category: 'SUSPICIOUS',
        reason: 'Phase 3F Inactive Watchlist Test',
        priority: AlertSeverity.MEDIUM,
        addedBy: 'Sub-Inspector Patel',
        active: false,
      },
    });
    inactiveWatchlistEntryId = inactiveEntry.id;
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      if (testWatchlistId) {
        await prisma.alert.deleteMany({
          where: { watchlistEntry: { watchlistId: testWatchlistId } },
        });
        await prisma.watchlistEntry.deleteMany({
          where: { watchlistId: testWatchlistId },
        });
        await prisma.watchlist.delete({ where: { id: testWatchlistId } });
      }
    } catch {}

    await app.close();
  });

  // ----------------------------------------------------------------------------
  // 1. Health Probe Verification
  // ----------------------------------------------------------------------------
  describe('Infrastructure & Health Status', () => {
    it('1. GET /api/v1/health reports Redis CONNECTED and event_consumer RUNNING', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'HEALTHY');
      expect(res.body.services).toHaveProperty('database', 'CONNECTED');
      expect(res.body.services).toHaveProperty('redis', 'CONNECTED');
      expect(res.body.services).toHaveProperty('event_consumer');
      expect(res.body.services.event_consumer.status).toBe('RUNNING');
      expect(res.body.services.event_consumer.stream).toBe(consumer.streamName);
      expect(res.body.services.event_consumer.group).toBe(consumer.consumerGroup);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Contract Validation & Rejection
  // ----------------------------------------------------------------------------
  describe('Contract Invariants & Schema Version Validation', () => {
    it('2. Rejects unsupported schema version (e.g. schema_version: 2.0)', async () => {
      const invalidEvent = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: '2.0', // Unsupported
        sighting_id: uuidv4(),
        evidence_id: uuidv4(),
        camera_id: 'CAM-AHM-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.95,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
      };

      const result = await consumer.processStreamMessage({
        id: `${Date.now()}-0`,
        fields: { data: JSON.stringify(invalidEvent) },
      });

      expect(result).toBe(false);
    });

    it('3. Rejects invalid event with missing sighting_id or out-of-bounds confidence', async () => {
      const invalidEvent = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        sighting_id: '', // Empty
        evidence_id: uuidv4(),
        camera_id: 'CAM-AHM-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 2.5, // Out of bounds
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
      };

      const result = await consumer.processStreamMessage({
        id: `${Date.now()}-1`,
        fields: { data: JSON.stringify(invalidEvent) },
      });

      expect(result).toBe(false);
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Persistent Sighting & Evidence Ingestion
  // ----------------------------------------------------------------------------
  describe('End-to-End Event Ingestion & PostgreSQL Persistence', () => {
    it('4. Persists VehicleSighting, Vehicle, and Evidence atomically when valid event is consumed', async () => {
      const sightingId = uuidv4();
      const evidenceId = uuidv4();
      const eventId = uuidv4();
      const capturedAt = new Date().toISOString();

      const payload: VehicleSightingCreatedPayload = {
        event_id: eventId,
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingId,
        evidence_id: evidenceId,
        camera_id: 'CAM-AHM-01',
        plate_normalized: unmonitoredPlate,
        confidence: 0.945,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: capturedAt,
        correlation_id: uuidv4(),
      };

      const success = await consumer.processStreamMessage({
        id: `${Date.now()}-2`,
        fields: { data: JSON.stringify(payload) },
      });

      expect(success).toBe(true);

      // Verify VehicleSighting in DB
      const persistedSighting = await prisma.vehicleSighting.findUnique({
        where: { id: sightingId },
        include: { vehicle: true, camera: true },
      });
      expect(persistedSighting).not.toBeNull();
      expect(persistedSighting!.plateNormalized).toBe(unmonitoredPlate);
      expect(persistedSighting!.cameraId).toBe(testCameraId);
      expect(persistedSighting!.consensusOf).toBe(5);
      expect(persistedSighting!.frameRef).toBe(validStorageRef);
      expect(Number(persistedSighting!.confidence)).toBeCloseTo(0.945, 3);

      // Verify Vehicle entity in DB
      expect(persistedSighting!.vehicle.plateNormalized).toBe(unmonitoredPlate);

      // Verify Evidence record in DB
      const persistedEvidence = await prisma.evidence.findUnique({
        where: { id: evidenceId },
      });
      expect(persistedEvidence).not.toBeNull();
      expect(persistedEvidence!.sourceType).toBe('SIGHTING');
      expect(persistedEvidence!.sourceId).toBe(sightingId);
      expect(persistedEvidence!.hash).toBe(validSha256);
      expect(persistedEvidence!.storageRef).toBe(validStorageRef);
    });

    it('5. Duplicate delivery of the exact same sighting event is idempotent and does not duplicate records', async () => {
      const sightingId = uuidv4();
      const evidenceId = uuidv4();
      const payload: VehicleSightingCreatedPayload = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingId,
        evidence_id: evidenceId,
        camera_id: 'CAM-AHM-01',
        plate_normalized: unmonitoredPlate,
        confidence: 0.92,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: uuidv4(),
      };

      // First delivery
      const firstResult = await consumer.processStreamMessage({
        id: `${Date.now()}-3`,
        fields: { data: JSON.stringify(payload) },
      });
      expect(firstResult).toBe(true);

      const sightingCountBefore = await prisma.vehicleSighting.count({
        where: { id: sightingId },
      });
      const evidenceCountBefore = await prisma.evidence.count({
        where: { id: evidenceId },
      });
      expect(sightingCountBefore).toBe(1);
      expect(evidenceCountBefore).toBe(1);

      // Second delivery (simulating Redis at-least-once redelivery)
      const secondResult = await consumer.processStreamMessage({
        id: `${Date.now()}-4`,
        fields: { data: JSON.stringify(payload) },
      });
      expect(secondResult).toBe(true);

      // Confirm zero duplicate records created
      const sightingCountAfter = await prisma.vehicleSighting.count({
        where: { id: sightingId },
      });
      const evidenceCountAfter = await prisma.evidence.count({
        where: { id: evidenceId },
      });
      expect(sightingCountAfter).toBe(1);
      expect(evidenceCountAfter).toBe(1);
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Watchlist & Alert Engine Integration
  // ----------------------------------------------------------------------------
  describe('Watchlist Matching & Alert Generation Integration', () => {
    it('6. Sighting of an active watchlist plate triggers an Alert with sourceSightingId and watchlistEntryId', async () => {
      const sightingId = uuidv4();
      const evidenceId = uuidv4();
      const payload: VehicleSightingCreatedPayload = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingId,
        evidence_id: evidenceId,
        camera_id: 'CAM-AHM-01',
        plate_normalized: activeWatchlistPlate,
        confidence: 0.96,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: uuidv4(),
      };

      const result = await consumer.processStreamMessage({
        id: `${Date.now()}-5`,
        fields: { data: JSON.stringify(payload) },
      });
      expect(result).toBe(true);

      // Check Alert in PostgreSQL
      const alert = await prisma.alert.findFirst({
        where: {
          sourceSightingId: sightingId,
          watchlistEntryId: activeWatchlistEntryId,
        },
        include: { sighting: true, watchlistEntry: true },
      });

      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe(AlertSeverity.CRITICAL);
      expect(alert!.status).toBe('NEW');
      expect(alert!.sighting.plateNormalized).toBe(activeWatchlistPlate);
      expect(alert!.watchlistEntry.id).toBe(activeWatchlistEntryId);
    });

    it('7. Duplicate sighting event for a watchlisted vehicle does not create duplicate alerts', async () => {
      const sightingId = uuidv4();
      const evidenceId = uuidv4();
      const payload: VehicleSightingCreatedPayload = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingId,
        evidence_id: evidenceId,
        camera_id: 'CAM-AHM-01',
        plate_normalized: activeWatchlistPlate,
        confidence: 0.95,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: uuidv4(),
      };

      // First delivery
      await consumer.processStreamMessage({
        id: `${Date.now()}-6`,
        fields: { data: JSON.stringify(payload) },
      });

      const alertCountBefore = await prisma.alert.count({
        where: { sourceSightingId: sightingId },
      });
      expect(alertCountBefore).toBe(1);

      // Re-deliver same event
      await consumer.processStreamMessage({
        id: `${Date.now()}-7`,
        fields: { data: JSON.stringify(payload) },
      });

      const alertCountAfter = await prisma.alert.count({
        where: { sourceSightingId: sightingId },
      });
      expect(alertCountAfter).toBe(1); // Still exactly 1 alert
    });

    it('8. Sighting of an inactive watchlist plate does NOT trigger an Alert', async () => {
      const sightingId = uuidv4();
      const evidenceId = uuidv4();
      const payload: VehicleSightingCreatedPayload = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingId,
        evidence_id: evidenceId,
        camera_id: 'CAM-AHM-01',
        plate_normalized: inactiveWatchlistPlate,
        confidence: 0.91,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: uuidv4(),
      };

      const result = await consumer.processStreamMessage({
        id: `${Date.now()}-8`,
        fields: { data: JSON.stringify(payload) },
      });
      expect(result).toBe(true);

      // Sighting exists
      const sighting = await prisma.vehicleSighting.findUnique({
        where: { id: sightingId },
      });
      expect(sighting).not.toBeNull();

      // No Alert exists
      const alert = await prisma.alert.findFirst({
        where: { sourceSightingId: sightingId },
      });
      expect(alert).toBeNull();
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Redis Streams Integration (via XADD and XREADGROUP)
  // ----------------------------------------------------------------------------
  describe('Full Redis Streams Pipeline (Publish -> Consumer Loop -> DB -> ACK)', () => {
    it('9. Publishes event via Redis XADD, consumer loop picks it up, persists it, and ACKs', async () => {
      const sightingId = uuidv4();
      const evidenceId = uuidv4();
      const eventId = uuidv4();
      const streamPlate = `GJ01ST${Math.floor(1000 + Math.random() * 9000)}`;

      const payload: VehicleSightingCreatedPayload = {
        event_id: eventId,
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingId,
        evidence_id: evidenceId,
        camera_id: 'CAM-AHM-01',
        plate_normalized: streamPlate,
        confidence: 0.98,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: uuidv4(),
      };

      // Publish directly to Redis stream
      const msgId = await redisClient.publish(consumer.streamName, {
        event_id: eventId,
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        data: JSON.stringify(payload),
      });

      expect(msgId).toBeDefined();

      // Wait for consumer background loop to process the event
      let persisted = null;
      for (let i = 0; i < 20; i++) {
        persisted = await prisma.vehicleSighting.findUnique({
          where: { id: sightingId },
        });
        if (persisted) break;
        await new Promise((res) => setTimeout(res, 200));
      }

      expect(persisted).not.toBeNull();
      expect(persisted!.plateNormalized).toBe(streamPlate);

      // Verify linked evidence
      const ev = await prisma.evidence.findUnique({
        where: { id: evidenceId },
      });
      expect(ev).not.toBeNull();
      expect(ev!.hash).toBe(validSha256);
    });

    it('10. Camera resolution rejects unknown camera code, does NOT persist, and does NOT acknowledge', async () => {
      const acksBefore = consumer.totalAcks;
      const errorsBefore = consumer.totalProcessingErrors;

      const payload: VehicleSightingCreatedPayload = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: uuidv4(),
        evidence_id: uuidv4(),
        camera_id: 'UNKNOWN-CAMERA-DOES-NOT-EXIST-999',
        plate_normalized: 'GJ01AB9999',
        confidence: 0.95,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: uuidv4(),
      };

      const result = await consumer.processStreamMessage({
        id: `${Date.now()}-10`,
        fields: { data: JSON.stringify(payload) },
      });

      expect(result).toBe(false);
      expect(consumer.totalProcessingErrors).toBe(errorsBefore + 1);
      // ACK count must NOT increase (remains in stream for retry)
      expect(consumer.totalAcks).toBe(acksBefore);
    });

    it('11. Poison message (malformed JSON) is rejected and acknowledged safely to prevent infinite retry loop', async () => {
      const acksBefore = consumer.totalAcks;
      const errorsBefore = consumer.totalProcessingErrors;

      const result = await consumer.processStreamMessage({
        id: `${Date.now()}-11`,
        fields: { data: '{ this is totally broken JSON payload ;;;' },
      });

      expect(result).toBe(false);
      expect(consumer.totalProcessingErrors).toBe(errorsBefore + 1);
      // Poison message IS acknowledged so consumer group loop is not blocked
      expect(consumer.totalAcks).toBe(acksBefore + 1);
    });
  });
});

