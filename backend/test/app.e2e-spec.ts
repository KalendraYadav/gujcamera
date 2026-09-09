import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('NestJS Foundation & Core Infrastructure (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Replicate global configuration from main.ts
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
  });

  afterAll(async () => {
    await app.close();
  });

  // ----------------------------------------------------------------------------
  // 1. APPLICATION & HEALTH
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/health', () => {
    it('1. Application starts and GET /api/v1/health returns 200 OK with database connectivity', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'HEALTHY');
      expect(res.body).toHaveProperty('version', '0.1.0');
      expect(res.body.services).toHaveProperty('application', 'UP');
      expect(res.body.services).toHaveProperty('database', 'CONNECTED');
      expect(res.body.services).toHaveProperty('postgis', 'OPERATIONAL');
      expect(res.body.services.database_details).toContain('PostGIS');
      expect(res.body).toHaveProperty('note');
    });

    it('2. Database connectivity is live and can query existing Phase 1 seeded records', async () => {
      const userCount = await prisma.user.count();
      const cameraCount = await prisma.camera.count();

      expect(userCount).toBeGreaterThanOrEqual(3);
      expect(cameraCount).toBeGreaterThanOrEqual(5);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. INPUT VALIDATION & NON-WHITELISTED FIELD REJECTION
  // ----------------------------------------------------------------------------
  describe('Validation & Security Pipeline', () => {
    it('3. Invalid request validation is rejected with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: '123', // too short
        })
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'BAD_REQUEST');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('4. Unknown/non-whitelisted request fields are rejected (Mass-Assignment Protection)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'operator.demo@gujcamera.local',
          password: 'PoliceDemo@2026!',
          injected_admin_role: 'SUPER_ADMIN', // Forbidden non-whitelisted property
        })
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'BAD_REQUEST');
      expect(res.body.message).toContain('property injected_admin_role should not exist');
    });

    it('5. Error responses strictly follow the canonical error envelope', async () => {
      const testReqId = '11111111-2222-3333-4444-555555555555';
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('x-request-id', testReqId)
        .send({
          email: 'invalid-email',
        })
        .expect(400);

      // Verify canonical fields
      expect(res.body).toHaveProperty('error_code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('request_id', testReqId);
      expect(res.body).toHaveProperty('timestamp');

      // Verify no sensitive internal traces leaked
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('database');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. AUTHENTICATION & RBAC INFRASTRUCTURE
  // ----------------------------------------------------------------------------
  describe('Auth & Protected Routes (RBAC)', () => {
    let operatorAccessToken: string;

    it('6. Protected route rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);

      expect(res.body).toHaveProperty('error_code', 'UNAUTHORIZED');
      expect(res.body).toHaveProperty('request_id');
    });

    it('7. Login succeeds with demo operator identity and returns access and refresh tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'operator.demo@gujcamera.local',
          password: 'PoliceDemo@2026!',
        })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).toHaveProperty('refresh_token');
      expect(res.body).toHaveProperty('token_type', 'Bearer');
      expect(res.body.user).toHaveProperty('email', 'operator.demo@gujcamera.local');
      expect(res.body.user).toHaveProperty('role', 'OPERATOR');
      expect(res.body.user).not.toHaveProperty('passwordHash');

      operatorAccessToken = res.body.access_token;
    });

    it('8. Authenticated user with valid JWT can access protected profile (/api/v1/auth/me)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.user).toHaveProperty('email', 'operator.demo@gujcamera.local');
      expect(res.body.user).toHaveProperty('role', 'OPERATOR');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('9. Login fails with incorrect password and returns 401 with standard error envelope', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'operator.demo@gujcamera.local',
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(res.body).toHaveProperty('error_code', 'INVALID_CREDENTIALS');
      expect(res.body).toHaveProperty('message', 'Invalid email or password');
    });
  });
});
