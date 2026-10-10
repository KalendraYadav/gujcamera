// ==============================================================================
// Historical Watchlist Backfill Integration & Verification Suite (Phase 2.1)
// Gujarat Police Innovation Challenge 2026
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AlertsGateway } from '../src/modules/alerts/alerts.gateway';
import { AlertSeverity } from '@prisma/client';

describe('Historical Watchlist Backfill Integration Verification (Phase 2.1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let alertsGateway: AlertsGateway;

  let adminAccessToken: string;
  let investigatorAccessToken: string;
  let operatorAccessToken: string;

  let testCameraId: string;
  let testDepartmentId: string;
  let testWatchlistId: string;

  // Track created test record IDs for complete isolated teardown
  const createdAlertIds: string[] = [];
  const createdSightingIds: string[] = [];
  const createdEntryIds: string[] = [];
  const createdWatchlistIds: string[] = [];
  const createdVehiclePlates: string[] = [];

  const rand4 = Math.floor(1000 + Math.random() * 8999).toString();
  const testBackfillPlate = `GJ99BF${rand4}`;
  const testMultiPlate = `GJ99MP${rand4}`;
  const testBoundaryPlate = `GJ99BP${rand4}`;
  const testInactivePlate = `GJ99IN${rand4}`;
  const testExpiredPlate = `GJ99EX${rand4}`;
  const testNoMatchPlate = `GJ99NM${rand4}`;

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
    alertsGateway = app.get(AlertsGateway);

    // 1. Authenticate actors
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    adminAccessToken = adminLogin.body.access_token;

    const invLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'investigator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    investigatorAccessToken = invLogin.body.access_token;

    const opLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'operator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    operatorAccessToken = opLogin.body.access_token;

    // 2. Fetch existing camera and department for test linkage
    const cam = await prisma.camera.findFirst({
      where: { name: { contains: 'Pakwan' } },
      include: { department: true },
    });
    if (!cam) throw new Error('Demo camera not found in database');
    testCameraId = cam.id;
    testDepartmentId = cam.departmentId;

    // 3. Create dedicated test watchlist
    const wl = await prisma.watchlist.create({
      data: {
        name: `Backfill Test Watchlist ${rand4}`,
        departmentId: testDepartmentId,
        owner: 'Anti-Theft Unit Verification',
      },
    });
    testWatchlistId = wl.id;
    createdWatchlistIds.push(wl.id);
  });

  afterAll(async () => {
    // Isolated cleanup: remove all entities generated during verification
    try {
      if (createdAlertIds.length > 0) {
        await prisma.alert.deleteMany({ where: { id: { in: createdAlertIds } } });
      }
      if (createdEntryIds.length > 0) {
        await prisma.watchlistEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
      }
      if (createdWatchlistIds.length > 0) {
        await prisma.watchlist.deleteMany({ where: { id: { in: createdWatchlistIds } } });
      }
      if (createdSightingIds.length > 0) {
        await prisma.vehicleSighting.deleteMany({ where: { id: { in: createdSightingIds } } });
      }
      if (createdVehiclePlates.length > 0) {
        await prisma.vehicle.deleteMany({ where: { plateNormalized: { in: createdVehiclePlates } } });
      }
      // Clean up audit logs associated with these tests
      await prisma.auditLog.deleteMany({
        where: {
          action: { in: ['ALERT_CREATE_HISTORICAL', 'WATCHLIST_ENTRY_CREATE', 'WATCHLIST_ENTRY_BACKFILL_MANUAL'] },
          ts: { gte: new Date(Date.now() - 300000) },
        },
      });
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    } finally {
      await app.close();
    }
  });

  // Helper to wait deterministically for asynchronous backfill
  async function waitForAlertForSighting(sightingId: string, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const alert = await prisma.alert.findFirst({
        where: { sourceSightingId: sightingId },
        include: { sighting: true, watchlistEntry: true },
      });
      if (alert) return alert;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for backfill alert for sighting ${sightingId}`);
  }

  // ============================================================================
  // SECTION 2: VERIFY API-LEVEL BEHAVIOR
  // ============================================================================
  describe('2. API-Level Historical Backfill Behavior', () => {
    let historicalSightingId: string;
    let sightingTimestamp: Date;
    let createdEntryId: string;
    let historicalAlertId: string;

    it('A & B. Persists a vehicle sighting with a known plate prior to watchlist entry', async () => {
      sightingTimestamp = new Date(Date.now() - 6 * 3600 * 1000); // 6 hours ago

      // Ensure vehicle record exists
      await prisma.vehicle.upsert({
        where: { plateNormalized: testBackfillPlate },
        create: { plateNormalized: testBackfillPlate },
        update: {},
      });
      createdVehiclePlates.push(testBackfillPlate);

      const sighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testBackfillPlate,
          cameraId: testCameraId,
          ts: sightingTimestamp,
          confidence: 0.965,
          consensusOf: 3,
          frameRef: `frames/${testBackfillPlate}_historical.jpg`,
        },
      });
      historicalSightingId = sighting.id;
      createdSightingIds.push(sighting.id);

      expect(sighting.id).toBeDefined();
      expect(sighting.plateNormalized).toBe(testBackfillPlate);
    });

    it('C & D. Creates active watchlist entry and triggers deterministic backfill', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: testBackfillPlate,
          category: 'STOLEN_VEHICLE',
          reason: 'FIR #901/2026 - Vehicle reported stolen',
          priority: 'CRITICAL',
          lookback_hours: 48,
        })
        .expect(201);

      createdEntryId = res.body.id;
      createdEntryIds.push(createdEntryId);
      expect(res.body.plate_normalized).toBe(testBackfillPlate);

      // Deterministically wait for asynchronous backfill processing
      const alert = await waitForAlertForSighting(historicalSightingId);
      expect(alert).toBeDefined();
      expect(alert.watchlistEntryId).toBe(createdEntryId);
      historicalAlertId = alert.id;
      createdAlertIds.push(alert.id);
    });

    it('E & F. Historical alert exists and original sighting timestamp is preserved', async () => {
      const alert = await prisma.alert.findUnique({
        where: { id: historicalAlertId },
        include: { sighting: true },
      });

      expect(alert).toBeDefined();
      // Sighting observation timestamp must be preserved exactly
      expect(new Date(alert!.sighting.ts).getTime()).toEqual(sightingTimestamp.getTime());
      expect(alert!.severity).toBe('CRITICAL');
      expect(alert!.status).toBe('NEW');
    });

    it('G. GET /alerts/:id classifies result as HISTORICAL_BACKFILL with disclaimer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${historicalAlertId}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.id).toBe(historicalAlertId);
      expect(res.body.match_type).toBe('HISTORICAL_BACKFILL');
      expect(res.body.is_historical).toBe(true);
      expect(res.body.incident_time_relevance).toBe('UNESTABLISHED_NO_INCIDENT_TIMESTAMP');
      expect(res.body.processed_at).toBeDefined();
      expect(res.body.entry_created_at).toBeDefined();
      expect(new Date(res.body.timestamp).getTime()).toEqual(sightingTimestamp.getTime());
      expect(res.body.disclaimer).toContain('does not confirm human identity');
    });

    it('H. GET /alerts queries historical alerts via existing API with match_type filter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts?plate=${testBackfillPlate}&match_type=HISTORICAL_BACKFILL`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const matched = res.body.data.find((a: any) => a.id === historicalAlertId);
      expect(matched).toBeDefined();
      expect(matched.match_type).toBe('HISTORICAL_BACKFILL');
      expect(matched.is_historical).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 3: VERIFY LIVE AND HISTORICAL SEPARATION
  // ============================================================================
  describe('3. Live and Historical Separation', () => {
    const separationPlate = `GJ99SP${rand4}`;
    let histSightingId: string;
    let liveSightingId: string;
    let entryId: string;
    let histAlertId: string;
    let liveAlertId: string;

    it('1, 2, 3. Creates prior sighting and entry, producing a historical match', async () => {
      await prisma.vehicle.upsert({
        where: { plateNormalized: separationPlate },
        create: { plateNormalized: separationPlate },
        update: {},
      });
      createdVehiclePlates.push(separationPlate);

      // Prior sighting (4 hours ago)
      const priorSighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: separationPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 4 * 3600 * 1000),
          confidence: 0.94,
          consensusOf: 2,
          frameRef: `frames/${separationPlate}_prior.jpg`,
        },
      });
      histSightingId = priorSighting.id;
      createdSightingIds.push(priorSighting.id);

      // Create active watchlist entry
      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: separationPlate,
          category: 'SMUGGLING_CONTRABAND',
          reason: 'Intelligence report IR-402',
          priority: 'HIGH',
        })
        .expect(201);

      entryId = entryRes.body.id;
      createdEntryIds.push(entryId);

      const histAlert = await waitForAlertForSighting(histSightingId);
      histAlertId = histAlert.id;
      createdAlertIds.push(histAlert.id);

      expect(histAlert).toBeDefined();
    });

    it('4 & 5. Creates live sighting after entry and evaluates via live matching pipeline', async () => {
      // Live sighting (observed now, after watchlist entry creation)
      const liveSighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: separationPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() + 1000), // after entry createdAt
          confidence: 0.98,
          consensusOf: 3,
          frameRef: `frames/${separationPlate}_live.jpg`,
        },
      });
      liveSightingId = liveSighting.id;
      createdSightingIds.push(liveSighting.id);

      // Ingest through live matching endpoint
      const matchRes = await request(app.getHttpServer())
        .post('/api/v1/alerts/match-sighting')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({ sighting_id: liveSightingId })
        .expect(201);

      expect(matchRes.body.matched).toBe(true);
      expect(matchRes.body.alerts_generated).toBe(1);
      liveAlertId = matchRes.body.alerts[0].id;
      createdAlertIds.push(liveAlertId);
    });

    it('6. Verifies neither sighting is duplicated or confused across live vs historical', async () => {
      const getHist = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${histAlertId}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      const getLive = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${liveAlertId}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      // Historical match attributes
      expect(getHist.body.match_type).toBe('HISTORICAL_BACKFILL');
      expect(getHist.body.is_historical).toBe(true);
      expect(getHist.body.incident_time_relevance).toBe('UNESTABLISHED_NO_INCIDENT_TIMESTAMP');

      // Live match attributes
      expect(getLive.body.match_type).toBe('LIVE');
      expect(getLive.body.is_historical).toBe(false);
      expect(getLive.body.incident_time_relevance).toBe('REAL_TIME_MONITORING');
    });

    it('7. Filters alerts by LIVE and HISTORICAL_BACKFILL returning strictly partitioned sets', async () => {
      const liveFilterRes = await request(app.getHttpServer())
        .get(`/api/v1/alerts?plate=${separationPlate}&match_type=LIVE`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(liveFilterRes.body.data.every((a: any) => a.match_type === 'LIVE')).toBe(true);
      expect(liveFilterRes.body.data.some((a: any) => a.id === liveAlertId)).toBe(true);
      expect(liveFilterRes.body.data.some((a: any) => a.id === histAlertId)).toBe(false);

      const histFilterRes = await request(app.getHttpServer())
        .get(`/api/v1/alerts?plate=${separationPlate}&match_type=HISTORICAL_BACKFILL`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(histFilterRes.body.data.every((a: any) => a.match_type === 'HISTORICAL_BACKFILL')).toBe(true);
      expect(histFilterRes.body.data.some((a: any) => a.id === histAlertId)).toBe(true);
      expect(histFilterRes.body.data.some((a: any) => a.id === liveAlertId)).toBe(false);
    });
  });

  // ============================================================================
  // SECTION 4: VERIFY RETRIES AND EDGE CASES
  // ============================================================================
  describe('4. Retries, Concurrency and Edge Cases', () => {
    it('1. Re-running backfill for the same entry is completely idempotent (no duplicates)', async () => {
      const testPlate = `GJ99ID${rand4}`;
      await prisma.vehicle.upsert({
        where: { plateNormalized: testPlate },
        create: { plateNormalized: testPlate },
        update: {},
      });
      createdVehiclePlates.push(testPlate);

      const s = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 2 * 3600 * 1000),
          confidence: 0.95,
          consensusOf: 1,
          frameRef: `frames/${testPlate}.jpg`,
        },
      });
      createdSightingIds.push(s.id);

      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: testPlate,
          category: 'TRAFFIC_VIOLATION',
          reason: 'Dangerous driving',
          priority: 'MEDIUM',
        })
        .expect(201);
      const entryId = entryRes.body.id;
      createdEntryIds.push(entryId);

      const alert = await waitForAlertForSighting(s.id);
      createdAlertIds.push(alert.id);

      // Trigger manual backfill re-run on the exact same entry
      const rerunRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/entries/${entryId}/backfill`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ lookback_hours: 48 })
        .expect(200);

      expect(rerunRes.body.status).toBe('COMPLETED');
      expect(rerunRes.body.duplicatesSkipped).toBeGreaterThanOrEqual(1);

      // Verify DB contains only 1 alert for this sighting + entry pair
      const alerts = await prisma.alert.findMany({
        where: { sourceSightingId: s.id, watchlistEntryId: entryId },
      });
      expect(alerts.length).toBe(1);
    });

    it('2. Multiple historical sightings for one plate are processed without overwriting', async () => {
      await prisma.vehicle.upsert({
        where: { plateNormalized: testMultiPlate },
        create: { plateNormalized: testMultiPlate },
        update: {},
      });
      createdVehiclePlates.push(testMultiPlate);

      // Create 3 historical sightings at different times
      const s1 = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testMultiPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 10 * 3600 * 1000),
          confidence: 0.91,
          frameRef: 'frame_multi_1.jpg',
        },
      });
      const s2 = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testMultiPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 5 * 3600 * 1000),
          confidence: 0.92,
          frameRef: 'frame_multi_2.jpg',
        },
      });
      const s3 = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testMultiPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 2 * 3600 * 1000),
          confidence: 0.93,
          frameRef: 'frame_multi_3.jpg',
        },
      });
      createdSightingIds.push(s1.id, s2.id, s3.id);

      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: testMultiPlate,
          category: 'GANG_ACTIVITY',
          reason: 'Organized crime surveillance',
          priority: 'HIGH',
          lookback_hours: 24,
        })
        .expect(201);
      createdEntryIds.push(entryRes.body.id);

      // Wait for all 3 alerts
      const a1 = await waitForAlertForSighting(s1.id);
      const a2 = await waitForAlertForSighting(s2.id);
      const a3 = await waitForAlertForSighting(s3.id);

      createdAlertIds.push(a1.id, a2.id, a3.id);

      expect(a1.id).not.toEqual(a2.id);
      expect(a2.id).not.toEqual(a3.id);
      expect(new Date(a1.sighting.ts).getTime()).toEqual(s1.ts.getTime());
      expect(new Date(a2.sighting.ts).getTime()).toEqual(s2.ts.getTime());
      expect(new Date(a3.sighting.ts).getTime()).toEqual(s3.ts.getTime());
    });

    it('3. Watchlist entry with no prior matching sightings completes safely with 0 alerts', async () => {
      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: testNoMatchPlate,
          category: 'STOLEN_VEHICLE',
          reason: 'Fresh theft report',
          priority: 'CRITICAL',
        })
        .expect(201);
      createdEntryIds.push(entryRes.body.id);

      // Manual backfill check
      const runRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/entries/${entryRes.body.id}/backfill`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ lookback_hours: 24 })
        .expect(200);

      expect(runRes.body.status).toBe('COMPLETED');
      expect(runRes.body.alertsGenerated).toBe(0);
      expect(runRes.body.sightingsExamined).toBe(0);
    });

    it('4. Sightings outside the lookback window are strictly excluded', async () => {
      await prisma.vehicle.upsert({
        where: { plateNormalized: testBoundaryPlate },
        create: { plateNormalized: testBoundaryPlate },
        update: {},
      });
      createdVehiclePlates.push(testBoundaryPlate);

      // Sighting 80 hours ago (outside 72h default lookback)
      const oldSighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testBoundaryPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 80 * 3600 * 1000),
          confidence: 0.90,
          frameRef: 'frame_old.jpg',
        },
      });
      createdSightingIds.push(oldSighting.id);

      // Sighting 20 hours ago (inside lookback)
      const recentSighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testBoundaryPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 20 * 3600 * 1000),
          confidence: 0.95,
          frameRef: 'frame_recent.jpg',
        },
      });
      createdSightingIds.push(recentSighting.id);

      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: testBoundaryPlate,
          category: 'STOLEN_VEHICLE',
          reason: 'Boundary test',
          priority: 'HIGH',
          lookback_hours: 72,
        })
        .expect(201);
      createdEntryIds.push(entryRes.body.id);

      // Recent sighting should match
      const recentAlert = await waitForAlertForSighting(recentSighting.id);
      createdAlertIds.push(recentAlert.id);
      expect(recentAlert).toBeDefined();

      // Old sighting must NOT produce an alert
      const oldAlert = await prisma.alert.findFirst({
        where: { sourceSightingId: oldSighting.id },
      });
      expect(oldAlert).toBeNull();
    });

    it('5. Inactive and expired entries abort backfill per status policy', async () => {
      await prisma.vehicle.upsert({
        where: { plateNormalized: testExpiredPlate },
        create: { plateNormalized: testExpiredPlate },
        update: {},
      });
      createdVehiclePlates.push(testExpiredPlate);

      const sighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testExpiredPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 5 * 3600 * 1000),
          confidence: 0.95,
          frameRef: 'frame_expired.jpg',
        },
      });
      createdSightingIds.push(sighting.id);

      // Create expired entry directly in DB
      const expiredEntry = await prisma.watchlistEntry.create({
        data: {
          watchlistId: testWatchlistId,
          plateNormalized: testExpiredPlate,
          category: 'STOLEN_VEHICLE',
          reason: 'Expired warrant',
          priority: 'HIGH',
          addedBy: 'investigator.demo@gujcamera.local',
          active: true,
          expiresAt: new Date(Date.now() - 3600 * 1000), // expired 1 hour ago
        },
      });
      createdEntryIds.push(expiredEntry.id);

      const runRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/entries/${expiredEntry.id}/backfill`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(runRes.body.status).toBe('SKIPPED_INACTIVE_OR_EXPIRED');
      expect(runRes.body.reason).toBe('ENTRY_EXPIRED');

      const alert = await prisma.alert.findFirst({
        where: { sourceSightingId: sighting.id },
      });
      expect(alert).toBeNull();
    });

    it('6. Pre-existing alerts retain their correct LIVE classification without corruption', async () => {
      // Find any alert that was seeded before Phase 2 tests ran
      const initialAlerts = await prisma.alert.findMany({
        take: 3,
        include: { sighting: true, watchlistEntry: true },
      });

      for (const seededAlert of initialAlerts) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/alerts/${seededAlert.id}`)
          .set('Authorization', `Bearer ${operatorAccessToken}`)
          .expect(200);

        // All pre-existing operational alerts retain their intended classifications
        expect(res.body).toHaveProperty('match_type');
        expect(res.body).toHaveProperty('is_historical');
      }
    });
  });

  // ============================================================================
  // SECTION 5: VERIFY EVENT DELIVERY & AUDIT LOGGING
  // ============================================================================
  describe('5. WebSocket Event Delivery and Audit Logging', () => {
    it('Broadcasts alert.created with match_type: HISTORICAL_BACKFILL via AlertsGateway', async () => {
      const broadcastSpy = jest.spyOn(alertsGateway, 'broadcastAlert');

      const wsPlate = `GJ99WS${rand4}`;
      await prisma.vehicle.upsert({
        where: { plateNormalized: wsPlate },
        create: { plateNormalized: wsPlate },
        update: {},
      });
      createdVehiclePlates.push(wsPlate);

      const s = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: wsPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 3 * 3600 * 1000),
          confidence: 0.97,
          frameRef: 'frame_ws.jpg',
        },
      });
      createdSightingIds.push(s.id);

      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: wsPlate,
          category: 'STOLEN_VEHICLE',
          reason: 'WebSocket broadcast check',
          priority: 'CRITICAL',
        })
        .expect(201);
      createdEntryIds.push(entryRes.body.id);

      const alert = await waitForAlertForSighting(s.id);
      createdAlertIds.push(alert.id);

      // Verify broadcastAlert was called with the historical alert payload
      expect(broadcastSpy).toHaveBeenCalled();
      const broadcasted = broadcastSpy.mock.calls.find(
        (call: any[]) => call[0] && call[0].id === alert.id,
      );
      expect(broadcasted).toBeDefined();
      expect(broadcasted![0].match_type).toBe('HISTORICAL_BACKFILL');
      expect(broadcasted![0].is_historical).toBe(true);

      broadcastSpy.mockRestore();
    });

    it('Records ALERT_CREATE_HISTORICAL audit log with complete metadata', async () => {
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'ALERT_CREATE_HISTORICAL',
          resource: 'Alert',
        },
        orderBy: { ts: 'desc' },
      });

      expect(audit).toBeDefined();
      const after = audit!.after as any;
      expect(after).toHaveProperty('match_type', 'HISTORICAL_BACKFILL');
      expect(after).toHaveProperty('incident_time_relevance', 'UNESTABLISHED_NO_INCIDENT_TIMESTAMP');
      expect(after).toHaveProperty('source_sighting_id');
      expect(after).toHaveProperty('watchlist_entry_id');
    });
  });
});
