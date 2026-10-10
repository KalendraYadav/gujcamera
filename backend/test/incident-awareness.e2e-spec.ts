// ==============================================================================
// Incident-Time Awareness Integration & Verification Suite (Phase 3)
// Project: NETRAVA — Unified CCTV Intelligence Platform
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AlertSeverity } from '@prisma/client';

describe('Incident-Time Awareness for Historical Vehicle Sightings (Phase 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminAccessToken: string;
  let investigatorAccessToken: string;
  let operatorAccessToken: string;

  let testCameraId: string;
  let testDepartmentId: string;
  let testWatchlistId: string;

  // Track created test records for isolated teardown
  const createdAlertIds: string[] = [];
  const createdSightingIds: string[] = [];
  const createdEntryIds: string[] = [];
  const createdWatchlistIds: string[] = [];
  const createdVehiclePlates: string[] = [];

  const rand4 = Math.floor(1000 + Math.random() * 8999).toString();
  const validPlate1 = `GJ01IA${rand4}`;
  const validPlate2 = `GJ01IB${rand4}`;
  const validPlate3 = `GJ01IC${rand4}`;
  const legacyPlate = `GJ01LG${rand4}`;
  const tzPlate1 = `GJ01TZ${rand4}`;
  const tzPlate2 = `GJ01TX${rand4}`;

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

    // 2. Fetch test camera
    const cam = await prisma.camera.findFirst({
      where: { name: { contains: 'Pakwan' } },
    });
    if (!cam) throw new Error('Demo camera not found');
    testCameraId = cam.id;
    testDepartmentId = cam.departmentId;

    // 3. Create dedicated test watchlist
    const wl = await prisma.watchlist.create({
      data: {
        name: `Phase 3 Incident Test Watchlist ${rand4}`,
        departmentId: testDepartmentId,
        owner: 'Anti-Theft Squad Verification',
      },
    });
    testWatchlistId = wl.id;
    createdWatchlistIds.push(wl.id);
  });

  afterAll(async () => {
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
      await prisma.auditLog.deleteMany({
        where: {
          action: { in: ['WATCHLIST_ENTRY_CREATE', 'WATCHLIST_ENTRY_UPDATE', 'ALERT_CREATE_HISTORICAL'] },
          ts: { gte: new Date(Date.now() - 300000) },
        },
      });
    } catch (err) {
      console.warn('Cleanup error:', err);
    } finally {
      await app.close();
    }
  });

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
    throw new Error(`Timeout waiting for alert for sighting ${sightingId}`);
  }

  // ============================================================================
  // 1 & 2. CREATING ENTRIES WITH AND WITHOUT INCIDENT TIMESTAMPS
  // ============================================================================
  describe('Entry Creation and Validation', () => {
    it('1. Creates an entry without incident timestamps (null defaults, unknown timing)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: validPlate1,
          category: 'STOLEN_VEHICLE',
          reason: 'FIR #101/2026 - Timing unknown at initial report',
          priority: 'HIGH',
        })
        .expect(201);

      createdEntryIds.push(res.body.id);
      expect(res.body.plate_normalized).toBe(validPlate1);
      expect(res.body.incident_start).toBeNull();
      expect(res.body.incident_end).toBeNull();
    });

    it('2. Creates an entry with a valid reported incident time range', async () => {
      const start = '2026-10-08T10:00:00.000Z';
      const end = '2026-10-08T12:00:00.000Z';

      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: validPlate2,
          category: 'ARMED_ROBBERY',
          reason: 'FIR #102/2026 - Bank robbery getaway vehicle',
          priority: 'CRITICAL',
          incident_start: start,
          incident_end: end,
        })
        .expect(201);

      createdEntryIds.push(res.body.id);
      expect(res.body.plate_normalized).toBe(validPlate2);
      expect(new Date(res.body.incident_start).toISOString()).toBe(start);
      expect(new Date(res.body.incident_end).toISOString()).toBe(end);
    });

    it('3. Rejects an end time earlier than start time with 400 INVALID_INCIDENT_TIME_RANGE', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: validPlate3,
          category: 'STOLEN_VEHICLE',
          reason: 'Invalid chronology input',
          incident_start: '2026-10-08T14:00:00.000Z',
          incident_end: '2026-10-08T10:00:00.000Z', // 4 hours earlier!
        })
        .expect(400);

      expect(res.body.error_code).toBe('INVALID_INCIDENT_TIME_RANGE');
      expect(res.body.message).toContain('Reported incident end time cannot be earlier than incident start time');
    });

    it('3a. Accepts valid incident timestamps with an explicit +05:30 offset and serializes to canonical UTC', async () => {
      // 15:30:00+05:30 normalized to UTC is 10:00:00.000Z. End is 12:00:00.000Z (2 hours later).
      const startIST = '2026-10-08T15:30:00+05:30';
      const endUTC = '2026-10-08T12:00:00.000Z';

      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: tzPlate1,
          category: 'KIDNAPPING',
          reason: 'FIR #103/2026 - Cross-timezone incident report',
          incident_start: startIST,
          incident_end: endUTC,
        })
        .expect(201);

      createdEntryIds.push(res.body.id);
      expect(res.body.plate_normalized).toBe(tzPlate1);
      // Response must represent the exact same instant normalized to canonical UTC
      expect(new Date(res.body.incident_start).toISOString()).toBe('2026-10-08T10:00:00.000Z');
      expect(new Date(res.body.incident_end).toISOString()).toBe('2026-10-08T12:00:00.000Z');
    });

    it('3b. Rejects a genuinely inverted incident window across offsets (18:00+05:30 [12:30Z] vs 12:00Z)', async () => {
      // 18:00:00+05:30 is 12:30:00.000Z. End is 12:00:00.000Z (30 minutes earlier).
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: `GJ01TY${rand4}`,
          category: 'STOLEN_VEHICLE',
          reason: 'Inverted instant across offsets',
          incident_start: '2026-10-08T18:00:00+05:30', // 12:30Z
          incident_end: '2026-10-08T12:00:00.000Z',   // 12:00Z (earlier than start!)
        })
        .expect(400);

      expect(res.body.error_code).toBe('INVALID_INCIDENT_TIME_RANGE');
      expect(res.body.message).toContain('Reported incident end time cannot be earlier than incident start time');
    });

    it('3c. Compares instants across mixed non-UTC offsets (-04:00 and +05:30) rather than text characters', async () => {
      // 06:00:00-04:00 is 10:00:00.000Z. 16:30:00+05:30 is 11:00:00.000Z (1 hour later).
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: tzPlate2,
          category: 'HIJACKING',
          reason: 'FIR #104/2026 - Multi-offset temporal window',
          incident_start: '2026-10-08T06:00:00-04:00', // 10:00Z
          incident_end: '2026-10-08T16:30:00+05:30',   // 11:00Z
        })
        .expect(201);

      createdEntryIds.push(res.body.id);
      expect(res.body.plate_normalized).toBe(tzPlate2);
      expect(new Date(res.body.incident_start).toISOString()).toBe('2026-10-08T10:00:00.000Z');
      expect(new Date(res.body.incident_end).toISOString()).toBe('2026-10-08T11:00:00.000Z');
    });
  });

  // ============================================================================
  // 4, 5, 6, 7, 8, 9. HISTORICAL SIGHTING CLASSIFICATION CATEGORIES
  // ============================================================================
  describe('Historical Sighting Classification Categories', () => {
    const classificationPlate = `GJ01CL${rand4}`;
    let entryId: string;
    let sBeforeId: string;
    let sWithinId: string;
    let sAfterId: string;

    const incidentStart = new Date(Date.now() - 5 * 3600 * 1000); // 5h ago
    const incidentEnd = new Date(Date.now() - 3 * 3600 * 1000);   // 3h ago

    beforeAll(async () => {
      await prisma.vehicle.upsert({
        where: { plateNormalized: classificationPlate },
        create: { plateNormalized: classificationPlate },
        update: {},
      });
      createdVehiclePlates.push(classificationPlate);

      // Sighting BEFORE incident start (6h ago)
      const sBefore = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: classificationPlate,
          cameraId: testCameraId,
          ts: new Date(incidentStart.getTime() - 3600 * 1000), // 1h before start
          confidence: 0.95,
          frameRef: 'frame_before.jpg',
        },
      });
      sBeforeId = sBefore.id;
      createdSightingIds.push(sBefore.id);

      // Sighting WITHIN incident window (4h ago)
      const sWithin = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: classificationPlate,
          cameraId: testCameraId,
          ts: new Date(incidentStart.getTime() + 3600 * 1000), // inside window
          confidence: 0.96,
          frameRef: 'frame_within.jpg',
        },
      });
      sWithinId = sWithin.id;
      createdSightingIds.push(sWithin.id);

      // Sighting AFTER incident end but before entry creation (2h ago)
      const sAfter = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: classificationPlate,
          cameraId: testCameraId,
          ts: new Date(incidentEnd.getTime() + 3600 * 1000), // 1h after end
          confidence: 0.97,
          frameRef: 'frame_after.jpg',
        },
      });
      sAfterId = sAfter.id;
      createdSightingIds.push(sAfter.id);

      // Create watchlist entry with incident range
      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: classificationPlate,
          category: 'STOLEN_VEHICLE',
          reason: 'FIR #777/2026 - Gold transport theft',
          priority: 'CRITICAL',
          incident_start: incidentStart.toISOString(),
          incident_end: incidentEnd.toISOString(),
        })
        .expect(201);

      entryId = entryRes.body.id;
      createdEntryIds.push(entryId);
    });

    it('4. Classifies sighting before incident start as BEFORE_REPORTED_INCIDENT', async () => {
      const alert = await waitForAlertForSighting(sBeforeId);
      createdAlertIds.push(alert.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.match_type).toBe('HISTORICAL_BACKFILL');
      expect(res.body.incident_classification).toBe('BEFORE_REPORTED_INCIDENT');
      expect(res.body.incident_time_relevance).toBe('BEFORE_REPORTED_INCIDENT');
    });

    it('5. Classifies sighting within incident window as WITHIN_REPORTED_INCIDENT_WINDOW', async () => {
      const alert = await waitForAlertForSighting(sWithinId);
      createdAlertIds.push(alert.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.match_type).toBe('HISTORICAL_BACKFILL');
      expect(res.body.incident_classification).toBe('WITHIN_REPORTED_INCIDENT_WINDOW');
      expect(res.body.incident_time_relevance).toBe('WITHIN_REPORTED_INCIDENT_WINDOW');
      // Severity must remain unaltered (investigative context, not automated guilt)
      expect(res.body.severity).toBe('CRITICAL');
    });

    it('6. Classifies sighting after incident end as AFTER_REPORTED_INCIDENT', async () => {
      const alert = await waitForAlertForSighting(sAfterId);
      createdAlertIds.push(alert.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.match_type).toBe('HISTORICAL_BACKFILL');
      expect(res.body.incident_classification).toBe('AFTER_REPORTED_INCIDENT');
      expect(res.body.incident_time_relevance).toBe('AFTER_REPORTED_INCIDENT');
    });

    it('9. Preserves original sighting timestamps without alteration', async () => {
      const alertBefore = await prisma.alert.findFirst({
        where: { sourceSightingId: sBeforeId },
        include: { sighting: true },
      });
      const alertWithin = await prisma.alert.findFirst({
        where: { sourceSightingId: sWithinId },
        include: { sighting: true },
      });
      const alertAfter = await prisma.alert.findFirst({
        where: { sourceSightingId: sAfterId },
        include: { sighting: true },
      });

      expect(new Date(alertBefore!.sighting.ts).getTime()).toBe(
        new Date(incidentStart.getTime() - 3600 * 1000).getTime(),
      );
      expect(new Date(alertWithin!.sighting.ts).getTime()).toBe(
        new Date(incidentStart.getTime() + 3600 * 1000).getTime(),
      );
      expect(new Date(alertAfter!.sighting.ts).getTime()).toBe(
        new Date(incidentEnd.getTime() + 3600 * 1000).getTime(),
      );
    });

    it('7 & 8. Handles unknown and incomplete incident ranges accurately', async () => {
      const partialPlate = `GJ01PR${rand4}`;
      await prisma.vehicle.upsert({
        where: { plateNormalized: partialPlate },
        create: { plateNormalized: partialPlate },
        update: {},
      });
      createdVehiclePlates.push(partialPlate);

      // Sighting 4h ago
      const s = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: partialPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 4 * 3600 * 1000),
          confidence: 0.94,
          frameRef: 'frame_partial.jpg',
        },
      });
      createdSightingIds.push(s.id);

      // Create entry with ONLY incident_start (occurrence start known, ongoing or point)
      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: partialPlate,
          category: 'SMUGGLING',
          reason: 'Partial range test',
          incident_start: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // 3h ago (sighting was 4h ago)
        })
        .expect(201);
      createdEntryIds.push(entryRes.body.id);

      const alert = await waitForAlertForSighting(s.id);
      createdAlertIds.push(alert.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      // Since sighting (4h ago) was before known incident start (3h ago):
      expect(res.body.incident_classification).toBe('BEFORE_REPORTED_INCIDENT');
    });
  });

  // ============================================================================
  // 10. UPDATING INCIDENT METADATA WITHOUT DUPLICATING ALERTS
  // ============================================================================
  describe('Incident Metadata Updates and Idempotency', () => {
    it('10. Updates incident time range on an entry without duplicating alerts and immediately reflects new classification', async () => {
      const updatePlate = `GJ01UP${rand4}`;
      await prisma.vehicle.upsert({
        where: { plateNormalized: updatePlate },
        create: { plateNormalized: updatePlate },
        update: {},
      });
      createdVehiclePlates.push(updatePlate);

      // Sighting occurred 6h ago
      const s = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: updatePlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 6 * 3600 * 1000),
          confidence: 0.92,
          frameRef: 'frame_up.jpg',
        },
      });
      createdSightingIds.push(s.id);

      // Create entry initially with incident start = 4h ago (sighting is BEFORE)
      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: updatePlate,
          category: 'STOLEN_VEHICLE',
          reason: 'Initial report',
          incident_start: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          incident_end: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        })
        .expect(201);
      const entryId = entryRes.body.id;
      createdEntryIds.push(entryId);

      const alert = await waitForAlertForSighting(s.id);
      createdAlertIds.push(alert.id);

      // Initial read: sighting is BEFORE_REPORTED_INCIDENT
      const initialAlertRes = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);
      expect(initialAlertRes.body.incident_classification).toBe('BEFORE_REPORTED_INCIDENT');

      // Investigator discovers vehicle was actually stolen 8 hours ago, so sighting at 6h ago was WITHIN
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/watchlists/entries/${entryId}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          incident_start: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
          incident_end: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        })
        .expect(200);
      expect(patchRes.body.incident_start).toBeDefined();

      // Verify DB still contains exactly ONE alert for this sighting + entry pair
      const alertsInDb = await prisma.alert.findMany({
        where: { sourceSightingId: s.id, watchlistEntryId: entryId },
      });
      expect(alertsInDb.length).toBe(1);

      // Dynamic evaluation: GET /alerts/:id reflects updated classification WITHIN_REPORTED_INCIDENT_WINDOW
      const updatedAlertRes = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);
      expect(updatedAlertRes.body.incident_classification).toBe('WITHIN_REPORTED_INCIDENT_WINDOW');
      expect(updatedAlertRes.body.incident_time_relevance).toBe('WITHIN_REPORTED_INCIDENT_WINDOW');
    });
  });

  // ============================================================================
  // 11, 12. MAINTAINING EXISTING LIVE AND HISTORICAL BEHAVIOR
  // ============================================================================
  describe('Maintaining Existing Alert Behaviors', () => {
    it('11 & 12. Maintains existing LIVE and HISTORICAL_BACKFILL contracts intact', async () => {
      const livePlate = `GJ01LV${rand4}`;
      await prisma.vehicle.upsert({
        where: { plateNormalized: livePlate },
        create: { plateNormalized: livePlate },
        update: {},
      });
      createdVehiclePlates.push(livePlate);

      // Create entry
      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: livePlate,
          category: 'STOLEN_VEHICLE',
          reason: 'Live stream alert verification',
          incident_start: new Date(Date.now() - 3600 * 1000).toISOString(),
        })
        .expect(201);
      createdEntryIds.push(entryRes.body.id);

      // Live sighting arriving NOW (after entry)
      const liveSighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: livePlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() + 1000),
          confidence: 0.98,
          frameRef: 'frame_live.jpg',
        },
      });
      createdSightingIds.push(liveSighting.id);

      // Ingest live match
      const matchRes = await request(app.getHttpServer())
        .post('/api/v1/alerts/match-sighting')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({ sighting_id: liveSighting.id })
        .expect(201);

      expect(matchRes.body.matched).toBe(true);
      const liveAlert = matchRes.body.alerts[0];
      createdAlertIds.push(liveAlert.id);

      // Live alert preserves match_type LIVE and REAL_TIME_MONITORING relevance
      expect(liveAlert.match_type).toBe('LIVE');
      expect(liveAlert.is_historical).toBe(false);
      expect(liveAlert.incident_time_relevance).toBe('REAL_TIME_MONITORING');
      expect(liveAlert.incident_classification).toBe('AFTER_REPORTED_INCIDENT');
    });
  });

  // ============================================================================
  // 13. RBAC AND AUDIT TRAIL PRESERVATION
  // ============================================================================
  describe('RBAC and Audit Trail Preservation', () => {
    it('13. OPERATOR role is forbidden from updating incident metadata (403 FORBIDDEN_RESOURCE)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/watchlists/entries/${createdEntryIds[0]}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({ incident_start: '2026-10-08T12:00:00.000Z' })
        .expect(403);

      expect(res.body.error_code).toBe('FORBIDDEN_RESOURCE');
    });

    it('13. Audit logs record incident timing updates with before and after diffs', async () => {
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'WATCHLIST_ENTRY_UPDATE',
          resource: 'WatchlistEntry',
        },
        orderBy: { ts: 'desc' },
      });

      expect(audit).toBeDefined();
      expect(audit!.before).toHaveProperty('incident_start');
      expect(audit!.after).toHaveProperty('incident_start');
    });
  });

  // ============================================================================
  // 14. LEGACY RECORDS WITH NO INCIDENT TIMESTAMP
  // ============================================================================
  describe('Legacy Record Compatibility', () => {
    it('14. Legacy records with null incident timestamps return INCIDENT_TIME_UNKNOWN without errors', async () => {
      await prisma.vehicle.upsert({
        where: { plateNormalized: legacyPlate },
        create: { plateNormalized: legacyPlate },
        update: {},
      });
      createdVehiclePlates.push(legacyPlate);

      const sighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: legacyPlate,
          cameraId: testCameraId,
          ts: new Date(Date.now() - 2 * 3600 * 1000),
          confidence: 0.93,
          frameRef: 'frame_legacy.jpg',
        },
      });
      createdSightingIds.push(sighting.id);

      // Legacy entry created without incident fields
      const entryRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${testWatchlistId}/entries`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({
          plate: legacyPlate,
          category: 'WANTED_SUSPECT',
          reason: 'Legacy entry compatibility check',
        })
        .expect(201);
      createdEntryIds.push(entryRes.body.id);

      const alert = await waitForAlertForSighting(sighting.id);
      createdAlertIds.push(alert.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.match_type).toBe('HISTORICAL_BACKFILL');
      expect(res.body.incident_classification).toBe('INCIDENT_TIME_UNKNOWN');
      expect(res.body.incident_time_relevance).toBe('UNESTABLISHED_NO_INCIDENT_TIMESTAMP');
      expect(res.body.incident_start).toBeNull();
      expect(res.body.incident_end).toBeNull();
    });
  });
});
