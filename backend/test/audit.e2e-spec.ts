// ==============================================================================
// Audit Log REST API & Compliance Verification E2E Test Suite (Phase 5A)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.2, Section 8.2, FR-015)
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Audit Log Compliance API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let auditorToken: string;
  let superAdminToken: string;
  let investigatorToken: string;
  let operatorToken: string;

  let auditorUserId: string;

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
    const server = app.getHttpServer();

    // Ensure auditor user exists in DB for testing
    const auditorRole = await prisma.role.findFirst({ where: { name: 'SYSTEM_AUDITOR' } });
    const dept = await prisma.department.findFirst();
    const passwordHash = await bcrypt.hash('PoliceDemo@2026!', 10);

    const auditorUser = await prisma.user.upsert({
      where: { email: 'auditor.demo@gujcamera.local' },
      update: {
        passwordHash,
        roleId: auditorRole!.id,
        departmentId: dept!.id,
        isActive: true,
      },
      create: {
        email: 'auditor.demo@gujcamera.local',
        passwordHash,
        roleId: auditorRole!.id,
        departmentId: dept!.id,
        isActive: true,
      },
    });
    auditorUserId = auditorUser.id;

    // Login users to acquire real JWTs
    // 1. System Auditor
    const auditorRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'auditor.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    auditorToken = auditorRes.body.access_token;

    // 2. Super Admin
    const adminRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    superAdminToken = adminRes.body.access_token;

    // 3. Investigator
    const invRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'investigator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    investigatorToken = invRes.body.access_token;

    // 4. Operator
    const opRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'operator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    operatorToken = opRes.body.access_token;

    // Ensure at least one test audit record with sensitive fields exists
    await prisma.auditLog.create({
      data: {
        actorId: auditorUserId,
        action: 'TEST_SENSITIVE_AUDIT_ACTION',
        resource: 'test_security',
        before: { token: 'secret-token-12345', normal: 'safe-value' },
        after: { passwordHash: 'bcrypt-hash-to-redact', status: 'COMPLETED' },
        correlationId: '550e8400-e29b-41d4-a716-446655440099',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ----------------------------------------------------------------------------
  // 1. RBAC & Access Control Tests
  // ----------------------------------------------------------------------------
  describe('RBAC & Security Enforcement', () => {
    it('1. Rejects unauthenticated request with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit')
        .expect(401);
    });

    it('2. Rejects OPERATOR role with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);
    });

    it('3. Rejects INVESTIGATOR role with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(403);
    });

    it('4. Authorizes SYSTEM_AUDITOR role with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('5. Authorizes SUPER_ADMIN role with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Query Filtering & Data Sanitization
  // ----------------------------------------------------------------------------
  describe('Audit Query Filtering & Sanitization', () => {
    it('6. Filters audit records by action', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit?action=TEST_SENSITIVE_AUDIT_ACTION')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      for (const rec of res.body.data) {
        expect(rec.action).toBe('TEST_SENSITIVE_AUDIT_ACTION');
      }
    });

    it('7. Filters audit records by resource', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit?resource=test_security')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      for (const rec of res.body.data) {
        expect(rec.resource).toBe('test_security');
      }
    });

    it('8. Redacts sensitive credentials (password, token) from before/after JSON blobs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit?action=TEST_SENSITIVE_AUDIT_ACTION')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      const record = res.body.data[0];
      expect(record.before.token).toBe('[REDACTED]');
      expect(record.before.normal).toBe('safe-value');
      expect(record.after.passwordHash).toBe('[REDACTED]');
      expect(record.after.status).toBe('COMPLETED');
    });

    it('9. Supports bounded pagination (page, limit, total_pages)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit?page=1&limit=5')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('total_pages');
    });

    it('10. Prevents recursive log pollution: AUDIT_LOG_ACCESSED is excluded by default', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      const hasReadLogs = res.body.data.some((r: any) => r.action === 'AUDIT_LOG_ACCESSED');
      expect(hasReadLogs).toBe(false);
    });

    it('11. Rejects non-whitelisted query parameters (e.g. sort_order) with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit?sort_order=desc')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(400);

      expect(res.body.message).toContain('property sort_order should not exist');
    });
  });
});


