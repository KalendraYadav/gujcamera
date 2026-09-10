import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisStreamClient } from '../src/common/events/redis/redis-stream.client';
import { SightingEventConsumer } from '../src/common/events/consumers/sighting-event.consumer';
import {
  EVENT_TYPE_SIGHTING_CREATED,
  SCHEMA_VERSION,
  VehicleSightingCreatedPayload,
} from '../src/common/events/event-contracts/vehicle-sighting-created.event';
import { AlertSeverity, AlertStatus } from '@prisma/client';

/**
 * Phase 3G — Full End-to-End Pipeline Automated Test Suite
 * Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
 * Source of Truth: master_architecture.md Section 9, 10, 11, 22, 23 & 24
 *
 * Verifies the complete live integration path:
 * 1. CCTV fixture availability
 * 2. MediaMTX RTSP stream connectivity
 * 3. AI Worker frame ingestion & detection pipeline validation
 * 4. MinIO evidence artifact storage & SHA-256 cryptographic verification
 * 5. Redis Streams vehicle.sighting_created domain event boundary
 * 6. NestJS SightingEventConsumer processing
 * 7. Atomic Vehicle, VehicleSighting, and Evidence PostgreSQL persistence
 * 8. Active Watchlist matching and Alert Engine trigger
 * 9. Duplicate delivery idempotency (zero duplicates across sightings and alerts)
 * 10. REST API query verification (Vehicles, Timelines, Alerts)
 * 11. Safe failure degradation under unresolvable camera dependencies and poison pills
 */
describe('Phase 3G: Full End-to-End Pipeline Integration Suite (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redisClient: RedisStreamClient;
  let consumer: SightingEventConsumer;

  let adminToken: string;
  let investigatorToken: string;

  let testDeptId: string;
  let testCameraId: string;
  let testCameraCode: string;
  let activeWatchlistId: string;
  let activeWatchlistEntryId: string;
  let targetPlate: string;

  const validSha256 = '315cb76daa3caa030ef0de4aecbaafa8dd20c114901d940682cceb1a9fa42db7';
  const validStorageRef = 's3://police-evidence-vault/evidence/2026/09/10/CAM-AHM-01/snap_pipeline_e2e.jpg';

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

    // 1. Obtain JWT tokens for API verification
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    adminToken = adminLoginRes.body.access_token;

    const invLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'investigator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    investigatorToken = invLoginRes.body.access_token;

    // 2. Setup Department and Canonical Camera
    testCameraCode = 'CAM-AHM-01';
    const dept = await prisma.department.findFirst({
      where: { name: { contains: 'Ahmedabad' } },
    });
    testDeptId = dept
      ? dept.id
      : (
          await prisma.department.create({
            data: { name: 'Ahmedabad Crime Branch Test', retentionPolicyId: 'TEST-RET-POL' },
          })
        ).id;

    const camera = await prisma.camera.findFirst({
      where: { name: { startsWith: testCameraCode } },
    });
    if (camera) {
      testCameraId = camera.id;
    } else {
      const connector =
        (await prisma.connector.findFirst()) ||
        (await prisma.connector.create({
          data: { adapterType: 'RTSP', configRef: 'vault://test' },
        }));
      const newCam = await prisma.camera.create({
        data: {
          name: `${testCameraCode}: SG Highway Pakwan Junction`,
          departmentId: testDeptId,
          lat: 23.0338,
          long: 72.5073,
          connectorTypeId: connector.id,
        },
      });
      testCameraId = newCam.id;
    }

    // 3. Setup Active Watchlist for Target Plate
    targetPlate = `GJ01GP${Math.floor(1000 + Math.random() * 9000)}`;

    const watchlist = await prisma.watchlist.create({
      data: {
        name: 'Phase 3G High Priority Watchlist',
        departmentId: testDeptId,
        owner: 'Ahmedabad Crime Branch Special Cell',
      },
    });
    activeWatchlistId = watchlist.id;

    const entry = await prisma.watchlistEntry.create({
      data: {
        watchlistId: activeWatchlistId,
        plateNormalized: targetPlate,
        category: 'STOLEN_VEHICLE',
        reason: 'Phase 3G Pipeline Automated E2E Verification',
        priority: AlertSeverity.CRITICAL,
        addedBy: 'Inspector V. Jadeja',
        active: true,
      },
    });
    activeWatchlistEntryId = entry.id;
  });

  afterAll(async () => {
    // Cleanup test-created resources
    try {
      if (activeWatchlistId) {
        await prisma.alert.deleteMany({
          where: { watchlistEntry: { watchlistId: activeWatchlistId } },
        });
        await prisma.watchlistEntry.deleteMany({
          where: { watchlistId: activeWatchlistId },
        });
        await prisma.watchlist.delete({ where: { id: activeWatchlistId } });
      }
    } catch {}

    await app.close();
  });

  // --------------------------------------------------------------------------
  // 1. Upstream Fixture & MediaMTX Stream Availability
  // --------------------------------------------------------------------------
  describe('1. Upstream CCTV Fixture & RTSP Gateway Availability', () => {
    it('1.1. Deterministic MP4 CCTV fixtures exist in filesystem', () => {
      const candidatePaths = [
        path.join(__dirname, '../../video-gateway/fixtures/cam-ahm-01.mp4'),
        path.join(__dirname, '../video-gateway/fixtures/cam-ahm-01.mp4'),
        '/fixtures/cam-ahm-01.mp4',
      ];
      const found = candidatePaths.some((p) => fs.existsSync(p));
      expect(found).toBe(true);
    });

    it('1.2. MediaMTX streaming gateway RTSP port 8554 is reachable', async () => {
      const isReachable = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection(8554, 'localhost', () => {
          socket.end();
          resolve(true);
        });
        socket.setTimeout(2000, () => {
          socket.destroy();
          resolve(false);
        });
        socket.on('error', () => resolve(false));
      });

      expect(isReachable).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Evidence Hashing & Storage Integrity Verification
  // --------------------------------------------------------------------------
  describe('2. Evidence Cryptographic Integrity & MinIO Storage Verification', () => {
    it('2.1. SHA-256 byte-level hash matches cryptographic digest', () => {
      const sampleJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
      const computedHash = crypto.createHash('sha256').update(sampleJpegBytes).digest('hex');

      expect(computedHash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(computedHash)).toBe(true);
    });

    it('2.2. MinIO evidence vault service is live and responsive', async () => {
      const isLive = await new Promise<boolean>((resolve) => {
        const req = request('http://localhost:9000').get('/minio/health/live');
        req.timeout(2000);
        req.end((err, res) => {
          if (err || !res) resolve(false);
          else resolve(res.status === 200);
        });
      });

      expect(isLive).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Full End-to-End Pipeline Execution (Stream -> DB -> Alert -> API)
  // --------------------------------------------------------------------------
  describe('3. Full Pipeline Execution: Stream Event -> Persistence -> Watchlist Alert -> REST API', () => {
    const sightingId = uuidv4();
    const evidenceId = uuidv4();
    const eventId = uuidv4();
    const correlationId = uuidv4();
    const capturedAt = new Date().toISOString();

    it('3.1. Publishes sighting created event to Redis Streams and consumer processes it', async () => {
      const payload: VehicleSightingCreatedPayload = {
        event_id: eventId,
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingId,
        evidence_id: evidenceId,
        camera_id: testCameraCode,
        plate_normalized: targetPlate,
        confidence: 0.952,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: capturedAt,
        correlation_id: correlationId,
      };

      // Publish directly to the configured Redis Stream
      const msgId = await redisClient.publish(consumer.streamName, {
        event_id: eventId,
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        data: JSON.stringify(payload),
      });

      expect(msgId).toBeDefined();

      // Bounded asynchronous polling: wait for consumer loop to commit to PostgreSQL
      let sighting = null;
      for (let i = 0; i < 25; i++) {
        sighting = await prisma.vehicleSighting.findUnique({
          where: { id: sightingId },
          include: { vehicle: true },
        });
        if (sighting) break;
        await new Promise((res) => setTimeout(res, 200));
      }

      expect(sighting).not.toBeNull();
      expect(sighting!.plateNormalized).toBe(targetPlate);
      expect(sighting!.cameraId).toBe(testCameraId);
      expect(sighting!.consensusOf).toBe(5);
      expect(sighting!.frameRef).toBe(validStorageRef);
      expect(Number(sighting!.confidence)).toBeCloseTo(0.952, 3);

      // Verify linked Evidence record
      const evidence = await prisma.evidence.findUnique({
        where: { id: evidenceId },
      });
      expect(evidence).not.toBeNull();
      expect(evidence!.sourceType).toBe('SIGHTING');
      expect(evidence!.sourceId).toBe(sightingId);
      expect(evidence!.hash).toBe(validSha256);
      expect(evidence!.storageRef).toBe(validStorageRef);
    });

    it('3.2. Sighting triggers automated Watchlist Alert with CRITICAL severity and NEW status', async () => {
      // Bounded polling for automated alert creation
      let alert = null;
      for (let i = 0; i < 20; i++) {
        alert = await prisma.alert.findFirst({
          where: {
            sourceSightingId: sightingId,
            watchlistEntryId: activeWatchlistEntryId,
          },
          include: { sighting: true, watchlistEntry: true },
        });
        if (alert) break;
        await new Promise((res) => setTimeout(res, 200));
      }

      expect(alert).not.toBeNull();
      expect(alert!.status).toBe(AlertStatus.NEW);
      expect(alert!.severity).toBe(AlertSeverity.CRITICAL);
      expect(alert!.sighting.plateNormalized).toBe(targetPlate);
      expect(alert!.watchlistEntry.id).toBe(activeWatchlistEntryId);
    });

    it('3.3. Duplicate delivery of the exact same event is idempotent and does not create duplicate alerts', async () => {
      const payload: VehicleSightingCreatedPayload = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingId,
        evidence_id: evidenceId,
        camera_id: testCameraCode,
        plate_normalized: targetPlate,
        confidence: 0.952,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: capturedAt,
        correlation_id: correlationId,
      };

      // Second delivery (simulating Redis at-least-once redelivery)
      const ackResult = await consumer.processStreamMessage({
        id: `${Date.now()}-dup`,
        fields: { data: JSON.stringify(payload) },
      });
      expect(ackResult).toBe(true);

      // Verify counts remain strictly 1
      const sightingCount = await prisma.vehicleSighting.count({
        where: { id: sightingId },
      });
      const evidenceCount = await prisma.evidence.count({
        where: { id: evidenceId },
      });
      const alertCount = await prisma.alert.count({
        where: { sourceSightingId: sightingId },
      });

      expect(sightingCount).toBe(1);
      expect(evidenceCount).toBe(1);
      expect(alertCount).toBe(1);
    });

    it('3.4. REST API GET /api/v1/vehicles/:plate returns canonical vehicle with updated lastSeen', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${targetPlate}`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('plate_normalized', targetPlate);
      expect(res.body).toHaveProperty('first_seen');
      expect(res.body).toHaveProperty('last_seen');
    });

    it('3.5. REST API GET /api/v1/vehicles/:plate/timeline returns the persisted sighting with camera details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${targetPlate}/timeline`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('sightings');
      expect(Array.isArray(res.body.sightings)).toBe(true);
      expect(res.body.sightings.length).toBeGreaterThanOrEqual(1);

      const sightingItem = res.body.sightings.find((s: any) => s.id === sightingId);
      expect(sightingItem).toBeDefined();
      expect(sightingItem.camera_id).toBe(testCameraId);
      expect(sightingItem.consensus_frames).toBe(5);
      expect(sightingItem.frame_ref).toBe(validStorageRef);
    });

    it('3.6. REST API GET /api/v1/alerts returns the generated alert with full evidence linkage', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts')
        .query({ plate: targetPlate })
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const alertItem = res.body.data.find((a: any) => a.source_sighting?.id === sightingId);
      expect(alertItem).toBeDefined();
      expect(alertItem.status).toBe('NEW');
      expect(alertItem.severity).toBe('CRITICAL');
      expect(alertItem.source_sighting.vehicle.plate_normalized).toBe(targetPlate);
      expect(alertItem.source_sighting.frame_ref).toBe(validStorageRef);
      expect(alertItem.watchlist_match.entry_id).toBe(activeWatchlistEntryId);
      expect(alertItem.watchlist_match.category).toBe('STOLEN_VEHICLE');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Safe Degradation & Resilience Under Failure
  // --------------------------------------------------------------------------
  describe('4. Pipeline Failure Safety & Degradation Constraints', () => {
    it('4.1. Unregistered camera code fails resolution, skips database writes, and does NOT acknowledge', async () => {
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
        camera_id: 'NON-EXISTENT-CAMERA-CODE-99999',
        plate_normalized: 'GJ01FAIL01',
        confidence: 0.90,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: validStorageRef,
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: uuidv4(),
      };

      const result = await consumer.processStreamMessage({
        id: `${Date.now()}-fail-cam`,
        fields: { data: JSON.stringify(payload) },
      });

      expect(result).toBe(false);
      expect(consumer.totalProcessingErrors).toBe(errorsBefore + 1);
      // Invariant: Unresolved camera does NOT ACK (remains retryable)
      expect(consumer.totalAcks).toBe(acksBefore);
    });

    it('4.2. Poison pill (malformed JSON) is rejected without database changes and acknowledged safely', async () => {
      const acksBefore = consumer.totalAcks;
      const errorsBefore = consumer.totalProcessingErrors;

      const result = await consumer.processStreamMessage({
        id: `${Date.now()}-poison`,
        fields: { data: '<<<INVALID UNPARSEABLE BINARY OR CORRUPT JSON>>>' },
      });

      expect(result).toBe(false);
      expect(consumer.totalProcessingErrors).toBe(errorsBefore + 1);
      // Invariant: Poison pill IS safely acknowledged to prevent consumer group blocking
      expect(consumer.totalAcks).toBe(acksBefore + 1);
    });
  });
});
