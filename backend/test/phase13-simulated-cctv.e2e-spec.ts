// ==============================================================================
// NETRAVAHA — Phase 13 Simulated Live CCTV Acceptance Test Suite (e2e)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: docs/PHASE_12_DATASET_READINESS_AUDIT.md & Phase 13 Prompt
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SightingEventConsumer } from '../src/common/events/consumers/sighting-event.consumer';
import {
  EVENT_TYPE_SIGHTING_CREATED,
  SCHEMA_VERSION,
  VehicleSightingCreatedPayload,
} from '../src/common/events/event-contracts/vehicle-sighting-created.event';

describe('Phase 13: Simulated Live CCTV Ingestion & Investigation (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let consumer: SightingEventConsumer;

  let adminToken: string;
  let investigatorToken: string;

  let camAhm01Id: string;
  let camAhm02Id: string;
  const targetPlate = 'GJ01AB1234';

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
    consumer = app.get(SightingEventConsumer);

    // 1. Obtain JWT tokens
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    adminToken = adminLoginRes.body.access_token;

    const invLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'investigator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    investigatorToken = invLoginRes.body.access_token;

    // 2. Fetch or identify cameras
    const cam1 = await prisma.camera.findFirst({
      where: { name: { contains: 'CAM-AHM-01' } },
    });
    const cam2 = await prisma.camera.findFirst({
      where: { name: { contains: 'CAM-AHM-02' } },
    });

    camAhm01Id = cam1?.id || 'CAM-AHM-01';
    camAhm02Id = cam2?.id || 'CAM-AHM-02';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Manifest & Demonstration Media Endpoints', () => {
    it('GET /api/v1/cameras/simulated-cctv/manifest should return validated demonstration manifest', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/simulated-cctv/manifest')
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body.manifestVersion).toBe('1.0.0');
      expect(res.body.cameras.length).toBe(10);
      expect(res.body.disclaimer).toContain('simulated live RTSP');

      // Verify no secrets or credentials leaked in manifest
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('secret');
    });

    it('GET /api/v1/cameras/simulated-cctv/validate should perform disk integrity audit', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/simulated-cctv/validate')
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.validCameras).toBe(10);
      expect(res.body.invalidCameras).toBe(0);
      expect(res.body.unverifiedLicenseCount).toBe(3);
    });

    it('GET /api/v1/cameras/simulated-cctv/status should return replay statuses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/simulated-cctv/status')
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(10);
      expect(res.body[0].isSimulatedLive).toBe(true);
      expect(res.body[0].targetRtspUrl).toContain('8554');
    });
  });

  describe('2. Camera Registry Source Type Preservation', () => {
    it('GET /api/v1/cameras should expose source_type for all cameras', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras?limit=20')
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      const cameras = res.body.data;
      expect(cameras.length).toBeGreaterThanOrEqual(10);

      const ahm01 = cameras.find((c: any) => c.name.includes('CAM-AHM-01'));
      expect(ahm01).toBeDefined();
      expect(ahm01.source_type).toBe('SYNTHETIC_STREAM');

      const demoHwy = cameras.find((c: any) => c.name.includes('RESEARCH') || c.name.includes('CAM-DEMO-01'));
      expect(demoHwy).toBeDefined();
      expect(demoHwy.source_type).toBe('RESEARCH_VIDEO');
    });
  });

  describe('3. End-to-End Multi-Camera Runtime Pipeline Simulation', () => {
    const validSha256A = '3333333333333333333333333333333333333333333333333333333333333333';
    const validSha256B = '4444444444444444444444444444444444444444444444444444444444444444';
    const sightingAId = uuidv4();
    const sightingBId = uuidv4();
    const evidenceAId = uuidv4();
    const evidenceBId = uuidv4();

    it('processes real runtime sighting event from CAM-AHM-01 (Pakwan Junction)', async () => {
      const payload: VehicleSightingCreatedPayload = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingAId,
        evidence_id: evidenceAId,
        camera_id: 'CAM-AHM-01',
        plate_normalized: targetPlate,
        confidence: 0.952,
        consensus_of: 6,
        total_observations: 6,
        storage_ref: 's3://police-evidence-vault/evidence/simulated/cam-ahm-01-sighting.jpg',
        evidence_hash: validSha256A,
        captured_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        correlation_id: uuidv4(),
      };

      const processed = await consumer.processStreamMessage({
        id: `sim-msg-${Date.now()}-1`,
        fields: { data: JSON.stringify(payload) },
      });
      expect(processed).toBe(true);

      const sighting = await prisma.vehicleSighting.findUnique({
        where: { id: sightingAId },
      });
      expect(sighting).not.toBeNull();
      expect(sighting?.plateNormalized).toBe(targetPlate);
    });

    it('processes consecutive sighting event from CAM-AHM-02 (Swastik Char Rasta, 8 mins later)', async () => {
      const payload: VehicleSightingCreatedPayload = {
        event_id: uuidv4(),
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        producer: 'ai-worker',
        sighting_id: sightingBId,
        evidence_id: evidenceBId,
        camera_id: 'CAM-AHM-02',
        plate_normalized: targetPlate,
        confidence: 0.968,
        consensus_of: 7,
        total_observations: 7,
        storage_ref: 's3://police-evidence-vault/evidence/simulated/cam-ahm-02-sighting.jpg',
        evidence_hash: validSha256B,
        captured_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        correlation_id: uuidv4(),
      };

      const processed = await consumer.processStreamMessage({
        id: `sim-msg-${Date.now()}-2`,
        fields: { data: JSON.stringify(payload) },
      });
      expect(processed).toBe(true);

      const sighting = await prisma.vehicleSighting.findUnique({
        where: { id: sightingBId },
      });
      expect(sighting).not.toBeNull();
      expect(sighting?.plateNormalized).toBe(targetPlate);
    });

    it('investigator searches vehicle plate and receives multi-camera sightings', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/search?q=${targetPlate}`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      const vehicle = res.body.data.find((v: any) => v.plate_normalized === targetPlate);
      expect(vehicle).toBeDefined();
      expect(vehicle.plate_normalized).toBe(targetPlate);
    });

    it('investigator views vehicle journey timeline across camera hops', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${targetPlate}/timeline`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body.sightings).toBeDefined();
      expect(res.body.sightings.length).toBeGreaterThanOrEqual(2);

      const sightings = res.body.sightings;
      const cameraIds = sightings.map((s: any) => s.camera_id || s.cameraId);
      expect(cameraIds).toContain(camAhm01Id);
      expect(cameraIds).toContain(camAhm02Id);
    });

    it('investigator inspects correlation candidates for the vehicle', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${targetPlate}/correlation-candidates?limit=10`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body.queryPlate).toBe(targetPlate);
      expect(Array.isArray(res.body.candidates)).toBe(true);
    });

    it('investigator inspects evidence record in database', async () => {
      const evidence = await prisma.evidence.findFirst({
        where: { hash: validSha256A },
      });
      expect(evidence).toBeDefined();
      expect(evidence?.sourceType).toBe('SIGHTING');
      expect(evidence?.hash).toBe(validSha256A);
    });

    it('verifies alert engine fired critical alert for target vehicle on watchlist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts?limit=20')
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      const alerts = res.body.data;
      const matchingAlert = alerts.find(
        (a: any) => a.watchlist_match?.plate_normalized === targetPlate,
      );
      expect(matchingAlert).toBeDefined();
      expect(matchingAlert.severity).toBe('CRITICAL');
    });
  });
});
