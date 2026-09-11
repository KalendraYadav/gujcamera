import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OnvifProtocolTestFixture } from './fixtures/onvif-protocol-fixture';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Camera Protocol Adapters & Onboarding Probes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let operatorToken: string;
  let onvifFixture: OnvifProtocolTestFixture;
  let onvifPort: number;

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

    await app.init();
    prisma = app.get(PrismaService);


    // Start ONVIF Protocol Test Fixture on an OS-assigned dynamic port
    onvifFixture = new OnvifProtocolTestFixture({
      requireAuth: true,
      expectedUsername: 'admin',
      expectedPassword: 'GujaratPolice@2026',
      manufacturer: 'Gujarat-Police-Surveillance',
      model: 'GP-CCTV-4K-PRO',
      streamUri: 'rtsp://127.0.0.1:8554/live/cam-ahm-01',
    });
    onvifPort = await onvifFixture.start();

    // Login SUPER_ADMIN
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin.demo@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    adminToken = adminLogin.body.access_token;

    // Login OPERATOR
    const opLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'operator.demo@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    operatorToken = opLogin.body.access_token;
  });

  afterAll(async () => {
    await onvifFixture.stop();
    await app.close();
  });

  describe('GET /api/v1/cameras/connectors/list', () => {
    it('returns available connectors and supported protocols', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/connectors/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.connectors).toBeDefined();
      expect(Array.isArray(res.body.connectors)).toBe(true);
      expect(res.body.supported_protocols).toContain('RTSP');
      expect(res.body.supported_protocols).toContain('ONVIF');
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/cameras/connectors/list')
        .expect(401);
    });
  });

  describe('GET /api/v1/cameras/departments', () => {
    it('returns canonical departments with valid UUIDs and names', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const ahmDept = res.body.find((d: any) => d.name.includes('Ahmedabad'));
      expect(ahmDept).toBeDefined();
      expect(ahmDept.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/cameras/departments')
        .expect(401);
    });
  });

  describe('POST /api/v1/cameras/test-connection', () => {
    it('rejects unauthenticated probe requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cameras/test-connection')
        .send({
          protocol: 'RTSP',
          url_or_handle: 'rtsp://127.0.0.1:8554/live/cam-ahm-01',
        })
        .expect(401);
    });

    it('executes a real RTSP RFC 2326 probe against live MediaMTX stream', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras/test-connection')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          protocol: 'RTSP',
          url_or_handle: 'rtsp://127.0.0.1:8554/live/cam-ahm-01',
          timeoutMs: 4000,
        })
        .expect(200);

      expect(res.body.status).toBe('CONNECTED');
      expect(res.body.reachable).toBe(true);
      expect(res.body.protocol).toBe('RTSP');
      expect(typeof res.body.latencyMs).toBe('number');
      expect(res.body.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.body.streamMetadata).toBeDefined();
      expect(res.body.streamMetadata.codec).toBe('H264');
      expect(res.body.streamMetadata.streamUri).toContain('rtsp://127.0.0.1:8554/live/cam-ahm-01');
    });

    it('reports OFFLINE when RTSP stream does not exist (404)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras/test-connection')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          protocol: 'RTSP',
          url_or_handle: 'rtsp://127.0.0.1:8554/live/nonexistent-stream-xyz',
          timeoutMs: 4000,
        })
        .expect(200);

      expect(res.body.status).toBe('OFFLINE');
      expect(res.body.reachable).toBe(true);
      expect(res.body.errorMessage).toContain('404');
    });

    it('executes a real ONVIF SOAP 1.2 probe with WS-Security against test fixture', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras/test-connection')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          protocol: 'ONVIF',
          url_or_handle: `http://127.0.0.1:${onvifPort}/onvif/device_service`,
          username: 'admin',
          password: 'GujaratPolice@2026',
          timeoutMs: 4000,
        })
        .expect(200);

      expect(res.body.status).toBe('CONNECTED');
      expect(res.body.reachable).toBe(true);
      expect(res.body.protocol).toBe('ONVIF');
      expect(res.body.streamMetadata).toBeDefined();
      expect(res.body.streamMetadata.deviceInfo?.manufacturer).toBe('Gujarat-Police-Surveillance');
      expect(res.body.streamMetadata.deviceInfo?.model).toBe('GP-CCTV-4K-PRO');
      expect(res.body.streamMetadata.streamUri).toBe('rtsp://127.0.0.1:8554/live/cam-ahm-01');

      // Security requirement: Passwords must never be returned
      expect(JSON.stringify(res.body)).not.toContain('GujaratPolice@2026');
    });

    it('reports DEGRADED when ONVIF credentials fail authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras/test-connection')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          protocol: 'ONVIF',
          url_or_handle: `http://127.0.0.1:${onvifPort}/onvif/device_service`,
          username: 'admin',
          password: 'BadPassword@123',
          timeoutMs: 4000,
        })
        .expect(200);

      expect(res.body.status).toBe('DEGRADED');
      expect(res.body.reachable).toBe(true);
      expect(res.body.errorMessage).toContain('ONVIF Authentication Failed');
    });

    it('rejects unsupported protocols without silent fallback', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras/test-connection')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          protocol: 'MOCK_VENDOR',
          url_or_handle: 'mock://vendor/cam-01',
        })
        .expect(400);

      expect(res.body.error_code).toBe('UNSUPPORTED_CAMERA_PROTOCOL');
    });

    it('rejects invalid request payloads with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cameras/test-connection')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          protocol: 'INVALID_PROTO',
        })
        .expect(400);
    });
  });

  describe('Camera Registration Duplicate Endpoint Integrity (POST /api/v1/cameras)', () => {
    it('rejects registration with 409 Conflict when stream endpoint is already registered and returns existing camera identity', async () => {
      const existing = await prisma.cameraStream.findFirst({
        include: { camera: { select: { id: true, name: true, departmentId: true } } },
      });
      expect(existing).toBeDefined();

      const connector = await prisma.connector.findFirst();
      expect(connector).toBeDefined();

      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'CAM-DUPLICATE-TEST: Collision Attempt',
          department_id: existing!.camera.departmentId,
          lat: 23.0312,
          long: 72.5123,
          protocol: 'RTSP',
          connector_type_id: connector!.id,
          operational_status: 'ONLINE',
          location: {
            address: 'Collision Test Point',
            zone: 'West Zone',
            district: 'Ahmedabad',
          },
          stream: {
            codec: 'h264',
            resolution: '1920x1080',
            fps: 25,
            url_or_handle: existing!.urlOrHandle,
          },
        })
        .expect(409);

      expect(res.body.error_code).toBe('DUPLICATE_STREAM_ENDPOINT');
      expect(res.body.message).toContain('already registered to another camera');
      expect(res.body.existing_camera).toBeDefined();
      expect(res.body.existing_camera.id).toBe(existing!.camera.id);
      expect(res.body.existing_camera.name).toBe(existing!.camera.name);
    });
  });
});
