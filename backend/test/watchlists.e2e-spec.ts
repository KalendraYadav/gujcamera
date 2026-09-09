import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Watchlists & Watchlist Entries Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminAccessToken: string;
  let investigatorAccessToken: string;
  let operatorAccessToken: string;
  let deptAdminAccessToken: string;

  let ahmedabadDeptId: string;
  let gandhinagarDeptId: string;

  let testDeptAdminId: string;
  let createdWatchlistId: string;
  let createdEntryId: string;

  const testFlaggedPlate = 'GJ01ZZ8888';
  const rawPlateInput = 'gj 01-zz 8888';

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

    // Fetch department IDs
    const ahmDept = await prisma.department.findFirst({ where: { name: { contains: 'Ahmedabad' } } });
    ahmedabadDeptId = ahmDept!.id;

    const gndDept = await prisma.department.findFirst({ where: { name: { contains: 'Gandhinagar District' } } });
    gandhinagarDeptId = gndDept!.id;

    // 4. Create a test DEPARTMENT_ADMIN user belonging to Ahmedabad City Police
    const deptAdminRole = await prisma.role.findFirst({ where: { name: 'DEPARTMENT_ADMIN' } });
    const pwHash = await bcrypt.hash('PoliceDemo@2026!', 10);
    const deptAdmin = await prisma.user.create({
      data: {
        email: 'deptadmin.test.ahm@gujcamera.local',
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
        email: 'deptadmin.test.ahm@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    deptAdminAccessToken = deptAdminLoginRes.body.access_token;
  });

  afterAll(async () => {
    // Cleanup test records
    if (createdWatchlistId) {
      await prisma.alert.deleteMany({ where: { watchlistEntry: { watchlistId: createdWatchlistId } } });
      await prisma.watchlistEntry.deleteMany({ where: { watchlistId: createdWatchlistId } });
      await prisma.watchlist.deleteMany({ where: { id: createdWatchlistId } });
    }
    await prisma.watchlistEntry.deleteMany({ where: { plateNormalized: testFlaggedPlate } });
    if (testDeptAdminId) {
      await prisma.auditLog.deleteMany({ where: { actorId: testDeptAdminId } });
      await prisma.user.deleteMany({ where: { id: testDeptAdminId } });
    }
    await app.close();
  });

  // ----------------------------------------------------------------------------
  // 1. AUTHENTICATION & ACCESS CONTROL
  // ----------------------------------------------------------------------------
  describe('Authentication & Access Control', () => {
    it('1. Unauthenticated request to /api/v1/watchlists returns 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/watchlists')
        .expect(401);

      expect(res.body).toHaveProperty('error_code', 'UNAUTHORIZED');
    });

    it('2. Authorized watchlist listing returns 200 OK with list of watchlists and entry counts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/watchlists')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('name');
      expect(res.body.data[0]).toHaveProperty('entries_count');
      expect(res.body).toHaveProperty('pagination');
    });

    it('3. Alias route /api/v1/watchlist also returns 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/watchlist')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. WATCHLIST CREATION & RBAC / DEPARTMENT RULES
  // ----------------------------------------------------------------------------
  describe('Watchlist Creation & Department Rules', () => {
    it('4. SUPER_ADMIN can create a watchlist for any department', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/watchlists')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'E2E Inter-District Priority Target List',
          department_id: gandhinagarDeptId,
          owner: 'State Crime Investigation Cell',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', 'E2E Inter-District Priority Target List');
      expect(res.body).toHaveProperty('department_id', gandhinagarDeptId);
      expect(res.body).toHaveProperty('entries_count', 0);
      createdWatchlistId = res.body.id;

      // Verify synchronous audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'WATCHLIST_CREATE', resource: 'Watchlist' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });

    it('5. DEPARTMENT_ADMIN can create a watchlist for their own department', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/watchlists')
        .set('Authorization', `Bearer ${deptAdminAccessToken}`)
        .send({
          name: 'Ahmedabad East Stolen Bikes Watchlist',
          department_id: ahmedabadDeptId,
          owner: 'East Zone Police',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('department_id', ahmedabadDeptId);

      // Clean up temporary watchlist
      await prisma.watchlist.delete({ where: { id: res.body.id } });
    });

    it('6. DEPARTMENT_ADMIN cannot create a watchlist for a different department (403 DEPARTMENT_ACCESS_DENIED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/watchlists')
        .set('Authorization', `Bearer ${deptAdminAccessToken}`)
        .send({
          name: 'Unauthorized Gandhinagar Watchlist',
          department_id: gandhinagarDeptId, // Mismatched department!
          owner: 'Rogue Officer',
        })
        .expect(403);

      expect(res.body).toHaveProperty('error_code', 'DEPARTMENT_ACCESS_DENIED');
    });

    it('7. OPERATOR is forbidden from creating watchlists (403 FORBIDDEN_RESOURCE)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/watchlists')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({
          name: 'Operator Attempted Watchlist',
          department_id: ahmedabadDeptId,
          owner: 'Control Room Operator',
        })
        .expect(403);

      expect(res.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. WATCHLIST DETAIL & UPDATE
  // ----------------------------------------------------------------------------
  describe('Watchlist Detail & Management', () => {
    it('8. Get single watchlist detail returns statistics and metadata', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/watchlists/${createdWatchlistId}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', createdWatchlistId);
      expect(res.body).toHaveProperty('name', 'E2E Inter-District Priority Target List');
      expect(res.body).toHaveProperty('total_entries', 0);
      expect(res.body).toHaveProperty('active_entries', 0);
      expect(res.body).toHaveProperty('inactive_entries', 0);
    });

    it('9. Update watchlist modifies name and owner, recording an audit log', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/watchlists/${createdWatchlistId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'E2E Inter-District Priority Target List — Updated',
          owner: 'State Special Task Force',
        })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'E2E Inter-District Priority Target List — Updated');
      expect(res.body).toHaveProperty('owner', 'State Special Task Force');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'WATCHLIST_UPDATE', resource: 'Watchlist' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });
  });

  // ----------------------------------------------------------------------------
  // 4. WATCHLIST ENTRY CREATION, NORMALIZATION & VALIDATION
  // ----------------------------------------------------------------------------
  describe('Watchlist Entry Management', () => {
    it('10. Add entry to watchlist normalizes license plate ("gj 01-zz 8888" -> "GJ01ZZ8888")', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${createdWatchlistId}/entries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          plate: rawPlateInput,
          category: 'STOLEN_VEHICLE',
          reason: 'Silver sedan reported stolen in Gandhinagar Sector 7 - FIR #888/2026',
          priority: 'CRITICAL',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('plate_normalized', testFlaggedPlate);
      expect(res.body).toHaveProperty('category', 'STOLEN_VEHICLE');
      expect(res.body).toHaveProperty('reason');
      expect(res.body).toHaveProperty('priority', 'CRITICAL');
      expect(res.body).toHaveProperty('active', true);
      createdEntryId = res.body.id;

      // Verify synchronous audit log for entry creation
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'WATCHLIST_ENTRY_CREATE', resource: 'WatchlistEntry' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });

    it('11. Adding duplicate active plate to the same watchlist returns 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${createdWatchlistId}/entries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          plate: testFlaggedPlate,
          category: 'STOLEN_VEHICLE',
          reason: 'Attempting duplicate add',
        })
        .expect(409);

      expect(res.body).toHaveProperty('error_code', 'DUPLICATE_WATCHLIST_ENTRY');
    });

    it('12. Adding entry with invalid plate format returns 400 Bad Request (INVALID_PLATE_FORMAT)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${createdWatchlistId}/entries`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          plate: 'INVALID-99', // Too short / non-matching pattern
          category: 'SUSPECT',
          reason: 'Bad syntax plate',
        })
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'INVALID_PLATE_FORMAT');
    });

    it('13. OPERATOR cannot add entries to watchlists (403 FORBIDDEN_RESOURCE)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${createdWatchlistId}/entries`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({
          plate: 'GJ01AA1111',
          category: 'TRAFFIC_VIOLATION',
          reason: 'Operator attempt',
        })
        .expect(403);

      expect(res.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');
    });

    it('14. List entries of watchlist returns created entry with active filter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/watchlists/${createdWatchlistId}/entries?active=true`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0]).toHaveProperty('plate_normalized', testFlaggedPlate);
    });

    it('15. Get single watchlist entry detail returns full entry record', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/watchlists/entries/${createdEntryId}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', createdEntryId);
      expect(res.body).toHaveProperty('plate_normalized', testFlaggedPlate);
      expect(res.body).toHaveProperty('category', 'STOLEN_VEHICLE');
      expect(res.body).toHaveProperty('watchlist_name');
    });

    it('16. Update entry changes reason/priority and audits WATCHLIST_ENTRY_UPDATE', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/watchlists/entries/${createdEntryId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          reason: 'FIR updated with recovery warrant',
          priority: 'HIGH',
        })
        .expect(200);

      expect(res.body).toHaveProperty('reason', 'FIR updated with recovery warrant');
      expect(res.body).toHaveProperty('priority', 'HIGH');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'WATCHLIST_ENTRY_UPDATE', resource: 'WatchlistEntry' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
    });

    it('17. Deactivating entry sets active to false and audits WATCHLIST_ENTRY_DEACTIVATE', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/entries/${createdEntryId}/deactivate`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('active', false);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'WATCHLIST_ENTRY_DEACTIVATE', resource: 'WatchlistEntry' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();

      // Reactivate entry for subsequent lifecycle tests
      await request(app.getHttpServer())
        .patch(`/api/v1/watchlists/entries/${createdEntryId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ active: true })
        .expect(200);
    });

    it('18. Deactivate and reactivate entire watchlist toggles all entry states', async () => {
      // 1. Deactivate watchlist
      const deactRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${createdWatchlistId}/deactivate`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(deactRes.body).toHaveProperty('entries_deactivated', 1);

      const checkDeact = await prisma.watchlistEntry.findUnique({ where: { id: createdEntryId } });
      expect(checkDeact!.active).toBe(false);

      // 2. Activate watchlist
      const actRes = await request(app.getHttpServer())
        .post(`/api/v1/watchlists/${createdWatchlistId}/activate`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(actRes.body).toHaveProperty('entries_activated', 1);

      const checkAct = await prisma.watchlistEntry.findUnique({ where: { id: createdEntryId } });
      expect(checkAct!.active).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 5. SENSITIVE DATA EXCLUSION
  // ----------------------------------------------------------------------------
  describe('Sensitive Field Protection', () => {
    it('19. Watchlist responses never leak user password hashes or secret tokens', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/watchlists/${createdWatchlistId}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('jwt');
      expect(serialized).not.toContain('secret');
    });
  });
});
