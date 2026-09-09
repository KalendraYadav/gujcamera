import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AlertSeverity, AlertStatus } from '@prisma/client';

describe('Alert Engine, Lifecycle & Matching (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminAccessToken: string;
  let investigatorAccessToken: string;
  let operatorAccessToken: string;
  let deptAdminAccessToken: string;
  let testDeptAdminId: string;

  let ahmedabadCam1Id: string;
  let ahmedabadCam2Id: string;
  let ahmedabadDeptId: string;

  let testWatchlistId: string;
  let testEntryId: string;
  let inactiveEntryId: string;

  const testMatchPlate = 'GJ01AL9999';
  const testInactivePlate = 'GJ01INACT88';
  let testSighting1Id: string;
  let testSighting2Id: string;
  let createdAlert1Id: string;
  let createdAlert2Id: string;
  let createdAlert3Id: string;

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

    // 1. Obtain JWT tokens for SUPER_ADMIN
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin.demo@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    adminAccessToken = adminLoginRes.body.access_token;

    // 2. Obtain JWT tokens for INVESTIGATOR
    const invLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'investigator.demo@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    investigatorAccessToken = invLoginRes.body.access_token;

    // 3. Obtain JWT tokens for OPERATOR
    const opLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'operator.demo@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    operatorAccessToken = opLoginRes.body.access_token;

    // Fetch cameras and departments
    const cam1 = await prisma.camera.findFirst({ where: { name: { contains: 'Pakwan' } } });
    const cam2 = await prisma.camera.findFirst({ where: { name: { contains: 'Swastik' } } });
    ahmedabadCam1Id = cam1!.id;
    ahmedabadCam2Id = cam2!.id;

    const dept = await prisma.department.findFirst({ where: { name: { contains: 'Ahmedabad' } } });
    ahmedabadDeptId = dept!.id;

    // 4. Create a test DEPARTMENT_ADMIN user belonging to Ahmedabad City Police
    const deptAdminRole = await prisma.role.findFirst({ where: { name: 'DEPARTMENT_ADMIN' } });
    const pwHash = await bcrypt.hash('PoliceDemo@2026!', 10);
    const deptAdmin = await prisma.user.create({
      data: {
        email: 'deptadmin.alert.test@gujcamera.local',
        passwordHash: pwHash,
        roleId: deptAdminRole!.id,
        departmentId: ahmedabadDeptId,
        isActive: true,
      },
    });
    testDeptAdminId = deptAdmin.id;

    const deptAdminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'deptadmin.alert.test@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    deptAdminAccessToken = deptAdminLoginRes.body.access_token;

    // Create a dedicated test watchlist
    const wl = await prisma.watchlist.create({
      data: {
        name: 'Alert Engine Test Watchlist',
        departmentId: ahmedabadDeptId,
        owner: 'Anti-Theft Squad',
      },
    });
    testWatchlistId = wl.id;

    // Create an ACTIVE watchlist entry
    const entryActive = await prisma.watchlistEntry.create({
      data: {
        watchlistId: testWatchlistId,
        plateNormalized: testMatchPlate,
        category: 'ARMED_ROBBERY_SUSPECT',
        reason: 'Getaway vehicle in bank robbery - FIR #555/2026',
        priority: AlertSeverity.CRITICAL,
        addedBy: 'investigator.demo@gujcamera.local',
        active: true,
      },
    });
    testEntryId = entryActive.id;

    // Create an INACTIVE watchlist entry
    const entryInactive = await prisma.watchlistEntry.create({
      data: {
        watchlistId: testWatchlistId,
        plateNormalized: testInactivePlate,
        category: 'EXPIRED_FLAG',
        reason: 'Expired flag entry for testing inactive non-match',
        priority: AlertSeverity.LOW,
        addedBy: 'investigator.demo@gujcamera.local',
        active: false,
      },
    });
    inactiveEntryId = entryInactive.id;

    // Create test vehicle and sightings
    await prisma.vehicle.create({
      data: {
        plateNormalized: testMatchPlate,
        firstSeen: new Date('2026-09-09T02:00:00.000Z'),
        lastSeen: new Date('2026-09-09T02:10:00.000Z'),
        attributes: { make: 'Toyota', model: 'Innova', color: 'Grey' },
      },
    });

    const s1 = await prisma.vehicleSighting.create({
      data: {
        plateNormalized: testMatchPlate,
        cameraId: ahmedabadCam1Id,
        ts: new Date('2026-09-09T02:00:00.000Z'),
        confidence: 0.965,
        consensusOf: 6,
        frameRef: 's3://vault/frames/test-alert-s1.jpg',
      },
    });
    testSighting1Id = s1.id;

    const s2 = await prisma.vehicleSighting.create({
      data: {
        plateNormalized: testMatchPlate,
        cameraId: ahmedabadCam2Id,
        ts: new Date('2026-09-09T02:10:00.000Z'),
        confidence: 0.982,
        consensusOf: 7,
        frameRef: 's3://vault/frames/test-alert-s2.jpg',
      },
    });
    testSighting2Id = s2.id;
  });

  afterAll(async () => {
    // Clean up test alerts, sightings, vehicle, watchlist entries, and watchlist
    await prisma.alert.deleteMany({
      where: {
        OR: [
          { watchlistEntryId: testEntryId },
          { watchlistEntryId: inactiveEntryId },
        ],
      },
    });
    await prisma.vehicleSighting.deleteMany({ where: { plateNormalized: testMatchPlate } });
    await prisma.vehicle.deleteMany({ where: { plateNormalized: testMatchPlate } });
    await prisma.watchlistEntry.deleteMany({ where: { watchlistId: testWatchlistId } });
    await prisma.watchlist.deleteMany({ where: { id: testWatchlistId } });
    if (testDeptAdminId) {
      await prisma.auditLog.deleteMany({ where: { actorId: testDeptAdminId } });
      await prisma.user.deleteMany({ where: { id: testDeptAdminId } });
    }
    await app.close();
  });

  // ----------------------------------------------------------------------------
  // 1. WATCHLIST MATCHING & ALERT GENERATION
  // ----------------------------------------------------------------------------
  describe('Matching & Alert Creation', () => {
    it('1. Matching active watchlist against sighting generates new Alert in status NEW', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/alerts/match-sighting')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({ sighting_id: testSighting1Id })
        .expect(201);

      expect(res.body).toHaveProperty('matched', true);
      expect(res.body).toHaveProperty('alerts_generated', 1);
      expect(res.body.alerts.length).toBe(1);

      const alert = res.body.alerts[0];
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('status', 'NEW');
      expect(alert).toHaveProperty('severity', 'CRITICAL');
      expect(alert.watchlist_match).toHaveProperty('entry_id', testEntryId);
      expect(alert.watchlist_match).toHaveProperty('plate_normalized', testMatchPlate);
      expect(alert.watchlist_match).toHaveProperty('category', 'ARMED_ROBBERY_SUSPECT');
      expect(alert.source_sighting).toHaveProperty('id', testSighting1Id);
      expect(alert.source_sighting.camera).toHaveProperty('id', ahmedabadCam1Id);

      createdAlert1Id = alert.id;

      // Verify synchronous audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'ALERT_CREATE', resource: 'Alert' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });

    it('2. Deduplication: Evaluating same sighting again returns existing alert without duplicate creation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/alerts/match-sighting')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({ sighting_id: testSighting1Id })
        .expect(201);

      expect(res.body.matched).toBe(true);
      expect(res.body.alerts.length).toBe(1);
      expect(res.body.alerts[0].id).toBe(createdAlert1Id);

      // Verify total alerts for this sighting in DB is strictly 1
      const totalAlertsForSighting = await prisma.alert.count({
        where: { sourceSightingId: testSighting1Id },
      });
      expect(totalAlertsForSighting).toBe(1);
    });

    it('3. Inactive watchlist entry does NOT generate an alert', async () => {
      // Create a sighting for the inactive plate
      await prisma.vehicle.create({
        data: {
          plateNormalized: testInactivePlate,
          firstSeen: new Date(),
          lastSeen: new Date(),
        },
      });
      const inactiveSighting = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testInactivePlate,
          cameraId: ahmedabadCam1Id,
          ts: new Date(),
          confidence: 0.95,
          consensusOf: 5,
          frameRef: 's3://vault/inactive-test.jpg',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/alerts/match-sighting')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({ sighting_id: inactiveSighting.id })
        .expect(201);

      expect(res.body).toHaveProperty('matched', false);
      expect(res.body).toHaveProperty('alerts_generated', 0);

      // Clean up
      await prisma.vehicleSighting.delete({ where: { id: inactiveSighting.id } });
      await prisma.vehicle.delete({ where: { plateNormalized: testInactivePlate } });
    });
  });

  // ----------------------------------------------------------------------------
  // 2. ALERT LISTING, FILTERING & DEEP-DIVE
  // ----------------------------------------------------------------------------
  describe('Alert Listing, Filtering & Detail', () => {
    it('4. List alerts returns paginated alerts with linked sighting and camera details', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty('pagination');

      const found = res.body.data.find((a: any) => a.id === createdAlert1Id);
      expect(found).toBeDefined();
      expect(found.source_sighting).toHaveProperty('camera');
      expect(found.source_sighting).toHaveProperty('vehicle');
    });

    it('5. Filter alerts by status (status=NEW) returns matching alerts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts?status=NEW')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.every((a: any) => a.status === 'NEW')).toBe(true);
    });

    it('6. Filter alerts by severity (severity=CRITICAL)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts?severity=CRITICAL')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.every((a: any) => a.severity === 'CRITICAL')).toBe(true);
    });

    it('7. Filter alerts by plate (plate=gj-01-al 9999 normalizes and finds match)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts?plate=gj-01-al 9999')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].source_sighting.vehicle.plate_normalized).toBe(testMatchPlate);
    });

    it('8. Get single alert deep-dive returns complete evidence and legal disclaimer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${createdAlert1Id}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', createdAlert1Id);
      expect(res.body).toHaveProperty('severity', 'CRITICAL');
      expect(res.body).toHaveProperty('status', 'NEW');
      expect(res.body.source_sighting.camera).toHaveProperty('coordinates');
      expect(res.body.source_sighting.camera).toHaveProperty('location');
      expect(res.body.watchlist_match).toHaveProperty('category', 'ARMED_ROBBERY_SUSPECT');
      expect(res.body).toHaveProperty('disclaimer');
      expect(res.body.disclaimer).toContain('does not confirm human identity');
    });

    it('9. Non-existent alert ID returns 404 ALERT_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts/00000000-0000-0000-0000-000000000999')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(404);

      expect(res.body).toHaveProperty('error_code', 'ALERT_NOT_FOUND');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. ALERT LIFECYCLE STATE MACHINE (CANONICAL HAPPY PATH)
  // ----------------------------------------------------------------------------
  describe('Alert Lifecycle State Machine: NEW -> ACK -> INVESTIGATING -> RESOLVED', () => {
    it('10. Transition NEW -> ACKNOWLEDGED by OPERATOR succeeds and stores acknowledged_by', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert1Id}/acknowledge`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'ACKNOWLEDGED');
      expect(res.body.acknowledged_by).toHaveProperty('email', 'operator.demo@gujcamera.local');

      // Verify synchronous audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'ALERT_ACKNOWLEDGE', resource: 'Alert' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });

    it('11. Transition ACKNOWLEDGED -> INVESTIGATING by INVESTIGATOR succeeds', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert1Id}/investigate`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'INVESTIGATING');

      // Verify synchronous audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'ALERT_INVESTIGATE', resource: 'Alert' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });

    it('12. Transition INVESTIGATING -> RESOLVED by INVESTIGATOR succeeds with resolution notes', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert1Id}/resolve`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({ reason: 'Suspect vehicle intercepted at Pakwan junction; occupants detained' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'RESOLVED');
      expect(res.body.resolved_by).toHaveProperty('email', 'investigator.demo@gujcamera.local');

      // Verify synchronous audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'ALERT_RESOLVE', resource: 'Alert' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });

    it('13. Terminal State: Transitioning from RESOLVED to any other state is rejected (409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${createdAlert1Id}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({ status: 'NEW' })
        .expect(409);

      expect(res.body).toHaveProperty('error_code', 'INVALID_STATE_TRANSITION');
      expect(res.body.message).toContain('terminal status');
    });
  });

  // ----------------------------------------------------------------------------
  // 4. DISMISSAL FLOWS & STATE MACHINE JUMP REJECTIONS
  // ----------------------------------------------------------------------------
  describe('Alert Dismissal & State Jump Rejection', () => {
    beforeAll(async () => {
      // Generate two additional alerts using Sighting 2
      const matchRes = await request(app.getHttpServer())
        .post('/api/v1/alerts/match-sighting')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ sighting_id: testSighting2Id });

      createdAlert2Id = matchRes.body.alerts[0].id;

      // Create a separate sighting for Alert 3 to test ACK -> DISMISSED
      const s3 = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testMatchPlate,
          cameraId: ahmedabadCam2Id,
          ts: new Date('2026-09-09T02:20:00.000Z'),
          confidence: 0.97,
          consensusOf: 6,
          frameRef: 's3://vault/frames/test-alert-s3.jpg',
        },
      });

      const matchRes3 = await request(app.getHttpServer())
        .post('/api/v1/alerts/match-sighting')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ sighting_id: s3.id });

      createdAlert3Id = matchRes3.body.alerts[0].id;
    });

    it('14. Invalid state jump: NEW -> RESOLVED is rejected (409 INVALID_STATE_TRANSITION)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${createdAlert2Id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ status: 'RESOLVED' })
        .expect(409);

      expect(res.body).toHaveProperty('error_code', 'INVALID_STATE_TRANSITION');
    });

    it('15. Invalid state jump: NEW -> INVESTIGATING is rejected (409 INVALID_STATE_TRANSITION)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${createdAlert2Id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ status: 'INVESTIGATING' })
        .expect(409);

      expect(res.body).toHaveProperty('error_code', 'INVALID_STATE_TRANSITION');
    });

    it('16. NEW -> DISMISSED by OPERATOR succeeds with dismissal reason (false positive)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert2Id}/dismiss`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({ reason: 'False positive: plate read misidentified character O as 0' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'DISMISSED');
      expect(res.body).toHaveProperty('dismissal_reason', 'False positive: plate read misidentified character O as 0');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'ALERT_DISMISS', resource: 'Alert' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });

    it('17. ACKNOWLEDGED -> DISMISSED by INVESTIGATOR succeeds', async () => {
      // 1. Acknowledge Alert 3
      await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert3Id}/acknowledge`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      // 2. Investigator dismisses
      const res = await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert3Id}/dismiss`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .send({ reason: 'Vehicle confirmed to belong to unrelated third party' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'DISMISSED');
    });
  });

  // ----------------------------------------------------------------------------
  // 5. RBAC ENFORCEMENT & SENSITIVE DATA EXCLUSION
  // ----------------------------------------------------------------------------
  describe('RBAC Enforcement & Sensitive Data Protection', () => {
    it('18. OPERATOR cannot transition an alert to RESOLVED (403 FORBIDDEN_RESOURCE)', async () => {
      // Create an alert in INVESTIGATING state
      const s4 = await prisma.vehicleSighting.create({
        data: {
          plateNormalized: testMatchPlate,
          cameraId: ahmedabadCam1Id,
          ts: new Date('2026-09-09T02:30:00.000Z'),
          confidence: 0.95,
          consensusOf: 5,
          frameRef: 's3://vault/frames/test-alert-s4.jpg',
        },
      });
      const alert4 = await prisma.alert.create({
        data: {
          sourceSightingId: s4.id,
          watchlistEntryId: testEntryId,
          severity: AlertSeverity.CRITICAL,
          status: AlertStatus.INVESTIGATING,
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${alert4.id}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({ status: 'RESOLVED' })
        .expect(403);

      expect(res.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');
    });

    it('19. Unauthenticated request to /api/v1/alerts returns 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alerts')
        .expect(401);

      expect(res.body).toHaveProperty('error_code', 'UNAUTHORIZED');
    });

    it('20. Alert payloads never expose password hashes or sensitive internal tokens', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${createdAlert1Id}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('jwt');
    });

    it('21. DEPARTMENT_ADMIN cannot transition alert to ACKNOWLEDGED (403 FORBIDDEN_RESOURCE)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert1Id}/acknowledge`)
        .set('Authorization', `Bearer ${deptAdminAccessToken}`)
        .expect(403);

      expect(res.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');
    });

    it('22. DEPARTMENT_ADMIN cannot transition alert via generic PATCH status (403 FORBIDDEN_RESOURCE)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/alerts/${createdAlert1Id}`)
        .set('Authorization', `Bearer ${deptAdminAccessToken}`)
        .send({ status: 'ACKNOWLEDGED' })
        .expect(403);

      expect(res.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');
    });

    it('23. DEPARTMENT_ADMIN cannot transition alert to INVESTIGATING or RESOLVED (403 FORBIDDEN_RESOURCE)', async () => {
      const resInv = await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert1Id}/investigate`)
        .set('Authorization', `Bearer ${deptAdminAccessToken}`)
        .expect(403);

      expect(resInv.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');

      const resRes = await request(app.getHttpServer())
        .post(`/api/v1/alerts/${createdAlert1Id}/resolve`)
        .set('Authorization', `Bearer ${deptAdminAccessToken}`)
        .send({ reason: 'Admin attempt' })
        .expect(403);

      expect(resRes.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');
    });

    it('24. DEPARTMENT_ADMIN can view alert deep-dive (200 OK read oversight permitted)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/alerts/${createdAlert1Id}`)
        .set('Authorization', `Bearer ${deptAdminAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', createdAlert1Id);
    });
  });
});
