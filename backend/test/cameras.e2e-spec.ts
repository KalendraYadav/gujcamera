import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Camera Registry & GIS Spatial APIs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminAccessToken: string;
  let operatorAccessToken: string;
  let ahmedabadDeptId: string;
  let gandhinagarDeptId: string;
  let connectorId: string;
  let createdCameraId: string;

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

    // Obtain JWT tokens for SUPER_ADMIN
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin.demo@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    adminAccessToken = adminLoginRes.body.access_token;

    // Obtain JWT token for OPERATOR
    const operatorLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'operator.demo@gujcamera.local',
        password: 'PoliceDemo@2026!',
      });
    operatorAccessToken = operatorLoginRes.body.access_token;

    // Fetch department IDs from database fixtures
    const ahmedabadDept = await prisma.department.findFirst({
      where: { name: { contains: 'Ahmedabad' } },
    });
    ahmedabadDeptId = ahmedabadDept!.id;

    const gandhinagarDept = await prisma.department.findFirst({
      where: { name: { contains: 'Gandhinagar District' } },
    });
    gandhinagarDeptId = gandhinagarDept!.id;

    // Fetch a connector ID
    const connector = await prisma.connector.findFirst();
    connectorId = connector!.id;
  });

  afterAll(async () => {
    // Clean up only the newly created test camera if it exists
    if (createdCameraId) {
      await prisma.cameraStream.deleteMany({ where: { cameraId: createdCameraId } });
      await prisma.cameraHealth.deleteMany({ where: { cameraId: createdCameraId } });
      await prisma.location.deleteMany({ where: { cameraId: createdCameraId } });
      await prisma.camera.deleteMany({ where: { id: createdCameraId } });
    }
    await app.close();
  });

  // ----------------------------------------------------------------------------
  // 1. AUTHENTICATED & UNAUTHORIZED CAMERA LISTING
  // ----------------------------------------------------------------------------
  describe('Camera Access Control & Listing', () => {
    it('1. Authenticated camera listing returns 200 OK with list of cameras and pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('limit', 20);
      expect(res.body.pagination).toHaveProperty('total');

      const firstCam = res.body.data[0];
      expect(firstCam).toHaveProperty('id');
      expect(firstCam).toHaveProperty('name');
      expect(firstCam).toHaveProperty('lat');
      expect(firstCam).toHaveProperty('long');
      expect(firstCam).toHaveProperty('protocol');
      expect(firstCam).toHaveProperty('operational_status');
    });

    it('2. Unauthorized camera access without token returns 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras')
        .expect(401);

      expect(res.body).toHaveProperty('error_code', 'UNAUTHORIZED');
      expect(res.body).toHaveProperty('request_id');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. CAMERA CREATION & RBAC ENFORCEMENT
  // ----------------------------------------------------------------------------
  describe('POST /api/v1/cameras (Camera Onboarding)', () => {
    it('3. Camera creation by SUPER_ADMIN succeeds with 201 Created and creates location, stream, and health', async () => {
      const newCameraPayload = {
        name: 'CAM-AHM-99: Test E2E Junction Camera',
        department_id: ahmedabadDeptId,
        lat: 23.03125,
        long: 72.51245,
        protocol: 'RTSP',
        connector_type_id: connectorId,
        operational_status: 'ONLINE',
        location: {
          address: 'Test Junction, E2E Boulevard',
          zone: 'West Zone',
          district: 'Ahmedabad',
        },
        stream: {
          codec: 'h264',
          resolution: '1920x1080',
          fps: 25,
          url_or_handle: 'rtsp://simulator:8554/live/cam-ahm-e2e-test-99',
        },
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newCameraPayload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', newCameraPayload.name);
      expect(res.body).toHaveProperty('lat', 23.03125);
      expect(res.body).toHaveProperty('long', 72.51245);
      expect(res.body).toHaveProperty('protocol', 'RTSP');
      expect(res.body).toHaveProperty('operational_status', 'ONLINE');
      expect(res.body).toHaveProperty('is_active', true);
      expect(res.body.location).toHaveProperty('address', 'Test Junction, E2E Boulevard');
      expect(res.body.streams.length).toBe(1);
      expect(res.body.streams[0]).toHaveProperty('url_or_handle', 'rtsp://simulator:8554/live/cam-ahm-e2e-test-99');
      expect(res.body.health).toHaveProperty('status', 'ONLINE');

      createdCameraId = res.body.id;

      // Verify Audit Log was written synchronously
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'CAMERA_ONBOARDED' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
      expect(audit!.resource).toBe('Camera');
    });

    it('4. Camera creation fails with 400 Bad Request on validation failure (invalid coordinates)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Invalid Lat Camera',
          department_id: ahmedabadDeptId,
          lat: 150.0, // Invalid: exceeds 90
          long: 72.5,
          connector_type_id: connectorId,
        })
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'BAD_REQUEST');
      expect(res.body.message).toBeDefined();
    });

    it('5. RBAC: OPERATOR cannot onboard cameras (returns 403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cameras')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .send({
          name: 'Unauthorized Operator Camera',
          department_id: ahmedabadDeptId,
          lat: 23.0,
          long: 72.5,
          connector_type_id: connectorId,
        })
        .expect(403);

      expect(res.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. CAMERA DETAIL & HEALTH
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/cameras/:id (Detail & Telemetry)', () => {
    it('6. Camera detail returns full record with location, stream, and health telemetry', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cameras/${createdCameraId}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', createdCameraId);
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('lat');
      expect(res.body).toHaveProperty('long');
      expect(res.body).toHaveProperty('location');
      expect(res.body).toHaveProperty('streams');
      expect(res.body).toHaveProperty('health');
    });

    it('7. Camera detail returns 404 CAMERA_NOT_FOUND for non-existent camera ID', async () => {
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cameras/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(404);

      expect(res.body).toHaveProperty('error_code', 'CAMERA_NOT_FOUND');
    });

    it('8. Dedicated camera health endpoint (/api/v1/cameras/:id/health) returns operational health', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cameras/${createdCameraId}/health`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('camera_id', createdCameraId);
      expect(res.body).toHaveProperty('operational_status');
      expect(res.body).toHaveProperty('health');
      expect(res.body.health).toHaveProperty('status');
      expect(res.body.health).toHaveProperty('last_heartbeat');
    });

    it('9. Global camera health summary returns distinct operational fleet telemetry', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/health/summary')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('total_cameras');
      expect(res.body).toHaveProperty('online');
      expect(res.body).toHaveProperty('degraded');
      expect(res.body).toHaveProperty('offline');
      expect(res.body).toHaveProperty('note');
      expect(res.body.note).toContain('independent of API/database infrastructure health');
    });
  });

  // ----------------------------------------------------------------------------
  // 4. CAMERA UPDATE & AUDIT TRAIL
  // ----------------------------------------------------------------------------
  describe('PATCH /api/v1/cameras/:id (Update & Audit)', () => {
    it('10. Camera update succeeds, updates fields, and writes audit record', async () => {
      const updatePayload = {
        name: 'CAM-AHM-99: Updated Junction Title',
        operational_status: 'DEGRADED',
      };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/cameras/${createdCameraId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updatePayload)
        .expect(200);

      expect(res.body).toHaveProperty('name', 'CAM-AHM-99: Updated Junction Title');
      expect(res.body).toHaveProperty('operational_status', 'DEGRADED');

      // Verify Audit Log diff
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'CAMERA_UPDATED' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
      expect((audit!.after as any).name).toBe('CAM-AHM-99: Updated Junction Title');
    });
  });

  // ----------------------------------------------------------------------------
  // 5. POSTGIS SPATIAL BOUNDING BOX (BBOX) QUERIES
  // ----------------------------------------------------------------------------
  describe('GIS Viewport Bounding Box Filtering (PostGIS GiST)', () => {
    it('11. Bounding box query filters cameras spatially inside Ahmedabad and excludes Gandhinagar', async () => {
      // Ahmedabad bounding box: minLong,minLat,maxLong,maxLat
      // Covers Pakwan (72.507, 23.033), Swastik (72.559, 23.035), Sabarmati (72.574, 23.041)
      const ahmBbox = '72.45,22.98,72.60,23.08';

      const res = await request(app.getHttpServer())
        .get(`/api/v1/cameras?bbox=${ahmBbox}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(3);

      // Verify every returned camera falls within the spatial envelope
      for (const cam of res.body.data) {
        expect(cam.long).toBeGreaterThanOrEqual(72.45);
        expect(cam.long).toBeLessThanOrEqual(72.60);
        expect(cam.lat).toBeGreaterThanOrEqual(22.98);
        expect(cam.lat).toBeLessThanOrEqual(23.08);
      }

      // Assert that Gandhinagar cameras (lat ~23.2, long ~72.63) are NOT returned
      const hasGandhinagar = res.body.data.some((c: any) => c.name.includes('GND'));
      expect(hasGandhinagar).toBe(false);
    });

    it('12. Bounding box query around Gandhinagar returns only Gandhinagar cameras', async () => {
      // Gandhinagar bounding box: minLong: 72.60, minLat: 23.18, maxLong: 72.66, maxLat: 23.23
      const gndBbox = '72.60,23.18,72.66,23.23';

      const res = await request(app.getHttpServer())
        .get(`/api/v1/cameras?bbox=${gndBbox}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      for (const cam of res.body.data) {
        expect(cam.long).toBeGreaterThanOrEqual(72.60);
        expect(cam.long).toBeLessThanOrEqual(72.66);
        expect(cam.lat).toBeGreaterThanOrEqual(23.18);
        expect(cam.lat).toBeLessThanOrEqual(23.23);
      }

      // Ahmedabad cameras must be excluded
      const hasAhmedabad = res.body.data.some((c: any) => c.name.includes('AHM'));
      expect(hasAhmedabad).toBe(false);
    });

    it('13. Malformed bbox syntax returns 400 Bad Request with INVALID_BBOX', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras?bbox=invalid,bbox,values')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'INVALID_BBOX');
      expect(res.body.message).toContain('Bounding box must contain 4 comma-separated numeric coordinates');
    });

    it('14. Inverted bbox coordinates (min > max) returns 400 Bad Request with INVALID_BBOX', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras?bbox=73.0,23.5,72.0,22.0') // Inverted min > max
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'INVALID_BBOX');
    });
  });

  // ----------------------------------------------------------------------------
  // 6. POSTGIS GEODESIC PROXIMITY (NEARBY) QUERIES
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/cameras/nearby (PostGIS Geography Geodesic Proximity)', () => {
    it('15. Nearby query within 10,000 meters of Ahmedabad center returns ordered results with distance_meters', async () => {
      // Ahmedabad Center: 23.0225° N, 72.5714° E, search radius: 10,000 meters (10 km)
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/nearby?lat=23.0225&lng=72.5714&radius=10000')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('query');
      expect(res.body.query).toHaveProperty('unit', 'meters');
      expect(res.body.query).toHaveProperty('radius_meters', 10000);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);

      // Verify each result has numeric distance_meters <= 10000
      let previousDistance = 0;
      for (const cam of res.body.data) {
        expect(cam).toHaveProperty('distance_meters');
        expect(typeof cam.distance_meters).toBe('number');
        expect(cam.distance_meters).toBeLessThanOrEqual(10000);
        expect(cam.distance_meters).toBeGreaterThanOrEqual(previousDistance); // Strictly ordered ASC
        previousDistance = cam.distance_meters;
      }

      // Nearest camera should be Swastik Char Rasta (~1.8km to ~1.9km)
      expect(res.body.data[0].name).toContain('Swastik');
      expect(res.body.data[0].distance_meters).toBeGreaterThan(1500);
      expect(res.body.data[0].distance_meters).toBeLessThan(2500);

      // Gandhinagar cameras (~20km away) must NOT be included in a 10km radius
      const hasGandhinagar = res.body.data.some((c: any) => c.name.includes('GND'));
      expect(hasGandhinagar).toBe(false);
    });

    it('16. Narrow 2,000m radius returns only the single closest camera', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/nearby?lat=23.0225&lng=72.5714&radius=2000')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toContain('Swastik');
      expect(res.body.data[0].distance_meters).toBeLessThanOrEqual(2000);
    });

    it('17. Invalid coordinates on nearby query return 400 INVALID_COORDINATES', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/nearby?lat=120.5&lng=72.5&radius=5000')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'INVALID_COORDINATES');
    });

    it('18. Negative or zero radius returns 400 INVALID_RADIUS', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/nearby?lat=23.0&lng=72.5&radius=-500')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'INVALID_RADIUS');
    });

    it('19. Radius exceeding max limit (500,000m) returns 400 INVALID_RADIUS', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras/nearby?lat=23.0&lng=72.5&radius=1000000')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'INVALID_RADIUS');
    });
  });

  // ----------------------------------------------------------------------------
  // 7. FILTERS, PAGINATION & SENSITIVE FIELD EXCLUSION
  // ----------------------------------------------------------------------------
  describe('Camera Filtering, Pagination & Security Sanitization', () => {
    it('20. Pagination limits results and returns next_cursor', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras?limit=2')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination).toHaveProperty('limit', 2);
      expect(res.body.pagination).toHaveProperty('next_cursor');
      expect(res.body.pagination.next_cursor).not.toBeNull();
    });

    it('21. Department filtering returns only cameras belonging to specified department', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cameras?department_id=${gandhinagarDeptId}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      for (const cam of res.body.data) {
        expect(cam.department_id).toBe(gandhinagarDeptId);
      }
    });

    it('22. Operational status filtering returns only matching status cameras', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cameras?status=DEGRADED')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      for (const cam of res.body.data) {
        expect(cam.operational_status).toBe('DEGRADED');
      }
    });

    it('23. Sensitive internal credentials, password hashes, and vault tokens are never exposed', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cameras/${createdCameraId}`)
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).not.toContain('passwordHash');
      expect(jsonStr).not.toContain('vault://');
      expect(jsonStr).not.toContain('secret');
      expect(jsonStr).not.toContain('JWT_SECRET');
    });
  });

  // ----------------------------------------------------------------------------
  // 8. SOFT DECOMMISSION & AUDIT TRAIL
  // ----------------------------------------------------------------------------
  describe('DELETE /api/v1/cameras/:id (Soft Decommission)', () => {
    it('24. Soft decommission marks camera inactive and offline, preserving database records', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/cameras/${createdCameraId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('is_active', false);
      expect(res.body).toHaveProperty('operational_status', 'OFFLINE');

      // Verify that camera still physically exists in database (not deleted)
      const camInDb = await prisma.camera.findUnique({
        where: { id: createdCameraId },
      });
      expect(camInDb).toBeDefined();
      expect(camInDb!.isActive).toBe(false);
      expect(camInDb!.operationalStatus).toBe('OFFLINE');

      // Verify default list query excludes decommissioned camera
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/cameras')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(200);

      const foundInActiveList = listRes.body.data.some((c: any) => c.id === createdCameraId);
      expect(foundInActiveList).toBe(false);

      // Verify audit trail logged CAMERA_DECOMMISSIONED
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'CAMERA_DECOMMISSIONED' },
        orderBy: { ts: 'desc' },
      });
      expect(audit).toBeDefined();
      expect((audit!.after as any).isActive).toBe(false);
    });
  });
});
