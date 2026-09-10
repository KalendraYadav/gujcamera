// ==============================================================================
// Real-Time Alert WebSocket Gateway E2E Test Suite (Phase 4E)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.1, Section 8.2: WS /ws/alerts)
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import WebSocket from 'ws';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AlertsService } from '../src/modules/alerts/alerts.service';
import { AlertSeverity, AlertStatus } from '@prisma/client';

describe('Alerts WebSocket Gateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let alertsService: AlertsService;
  let wsPort: number;

  let operatorToken: string;
  let operatorUserId: string;
  let operatorDeptId: string;
  let investigatorToken: string;
  let adminToken: string;

  let testCameraId: string;
  let testWatchlistId: string;
  let testEntryId: string;
  const testPlate = 'GJ01WS7777';
  let testSightingId: string;

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
    app.useWebSocketAdapter(new WsAdapter(app));

    // Listen on dynamic ephemeral port for WebSocket testing
    await app.listen(0);
    const server = app.getHttpServer();
    wsPort = server.address().port;

    prisma = app.get(PrismaService);
    alertsService = app.get(AlertsService);

    // Login users to acquire real JWTs
    const opRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'operator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    operatorToken = opRes.body.access_token;

    const opUser = await prisma.user.findFirst({ where: { email: 'operator.demo@gujcamera.local' } });
    operatorUserId = opUser!.id;
    operatorDeptId = opUser!.departmentId;

    const invRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'investigator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    investigatorToken = invRes.body.access_token;

    const admRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    adminToken = admRes.body.access_token;

    // Get existing camera
    const camera = await prisma.camera.findFirst();
    testCameraId = camera!.id;

    // Get or create department & watchlist
    const dept = await prisma.department.findFirst();
    const watchlist = await prisma.watchlist.create({
      data: {
        name: 'WS E2E Test Watchlist',
        departmentId: dept!.id,
        owner: 'WS Test Unit',
      },
    });
    testWatchlistId = watchlist.id;

    const entry = await prisma.watchlistEntry.create({
      data: {
        watchlistId: testWatchlistId,
        plateNormalized: testPlate,
        category: 'STOLEN_VEHICLE',
        reason: 'Phase 4E WebSocket Broadcast Validation Plate',
        priority: AlertSeverity.CRITICAL,
        addedBy: 'ws.test@gujcamera.local',
        active: true,
      },
    });
    testEntryId = entry.id;

    // Create a vehicle and sighting for testing
    await prisma.vehicle.upsert({
      where: { plateNormalized: testPlate },
      create: { plateNormalized: testPlate },
      update: {},
    });

    const sighting = await prisma.vehicleSighting.create({
      data: {
        plateNormalized: testPlate,
        cameraId: testCameraId,
        ts: new Date(),
        confidence: 0.985,
        consensusOf: 6,
        frameRef: 's3://evidence-vault/ws-test.jpg',
      },
    });
    testSightingId = sighting.id;
  });

  afterAll(async () => {
    // Clean up test fixtures
    try {
      await prisma.alert.deleteMany({
        where: { sourceSightingId: testSightingId },
      });
      await prisma.vehicleSighting.deleteMany({
        where: { id: testSightingId },
      });
      await prisma.watchlistEntry.deleteMany({
        where: { id: testEntryId },
      });
      await prisma.watchlist.deleteMany({
        where: { id: testWatchlistId },
      });
      await prisma.vehicle.deleteMany({
        where: { plateNormalized: testPlate },
      });
    } catch {
      // Ignore cleanup error
    }

    await app.close();
  });

  it('1. Rejects unauthenticated client with invalid token', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/alerts`);

    ws.on('open', () => {
      // Send invalid token
      ws.send(JSON.stringify({ type: 'auth', token: 'invalid.jwt.token' }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'error') {
        expect(msg.data.error_code).toBe('UNAUTHORIZED');
      }
    });

    ws.on('close', (code) => {
      expect(code).toBe(4401);
      done();
    });
  });

  it('2. Authenticates authorized OPERATOR and receives connection_ack', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/alerts`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: operatorToken }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'connection_ack') {
        expect(msg.data.status).toBe('AUTHENTICATED');
        expect(msg.data.role).toBe('OPERATOR');
        expect(msg.data.email).toBe('operator.demo@gujcamera.local');
        ws.close();
        done();
      }
    });
  });

  it('3. Authenticates via Authorization HTTP header', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/alerts`, {
      headers: {
        Authorization: `Bearer ${investigatorToken}`,
      },
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'connection_ack') {
        expect(msg.data.status).toBe('AUTHENTICATED');
        expect(msg.data.role).toBe('INVESTIGATOR');
        ws.close();
        done();
      }
    });
  });

  it('4. Real-time alert broadcast when sighting matches active watchlist', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/alerts`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: operatorToken }));
    });

    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.event === 'connection_ack') {
        // Once connected & authenticated, trigger real sighting match in backend
        await alertsService.processSightingMatch(testSightingId, 'test-corr-ws-01');
      }

      if (msg.event === 'alert.created') {
        expect(msg.data).toBeDefined();
        expect(msg.data.severity).toBe('CRITICAL');
        expect(msg.data.status).toBe('NEW');
        expect(msg.data.watchlist_match.plate_normalized).toBe(testPlate);
        expect(msg.data.source_sighting.camera.id).toBe(testCameraId);

        // Security check: No raw video, JPEG, or secret in payload
        expect(JSON.stringify(msg)).not.toContain('password');
        expect(JSON.stringify(msg)).not.toContain('token');
        expect(msg.data.jpeg_bytes).toBeUndefined();

        ws.close();
        done();
      }
    });
  });

  it('5. Broadcasts alert.updated when alert lifecycle status changes', (done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/ws/alerts`);

    let alertId: string;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: operatorToken }));
    });

    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.event === 'connection_ack') {
        // Find the alert created in previous test
        const alert = await prisma.alert.findFirst({
          where: { sourceSightingId: testSightingId },
        });
        expect(alert).toBeDefined();
        alertId = alert!.id;

        // Transition status: Acknowledge alert as Operator
        await alertsService.transitionAlertStatus(
          alertId,
          { status: AlertStatus.ACKNOWLEDGED },
          { id: operatorUserId, email: 'operator.demo@gujcamera.local', role: 'OPERATOR', departmentId: operatorDeptId },
          'test-req-ack',
        );
      }

      if (msg.event === 'alert.updated') {
        expect(msg.data.id).toBe(alertId);
        expect(msg.data.status).toBe('ACKNOWLEDGED');
        ws.close();
        done();
      }
    });
  });

  afterAll(async () => {
    try {
      if (testEntryId) {
        await prisma.watchlistEntry.deleteMany({ where: { id: testEntryId } });
      }
      if (testWatchlistId) {
        await prisma.watchlist.deleteMany({ where: { id: testWatchlistId } });
      }
      if (testSightingId) {
        await prisma.alert.deleteMany({ where: { sourceSightingId: testSightingId } });
        await prisma.vehicleSighting.deleteMany({ where: { id: testSightingId } });
      }
      await app.close();
    } catch {
      // Ignore cleanup error on teardown
    }
  });
});
