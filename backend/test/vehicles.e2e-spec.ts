import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Vehicle Tracking, Sightings & Investigation Search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminAccessToken: string;
  let investigatorAccessToken: string;
  let operatorAccessToken: string;

  let ahmedabadCam1Id: string;
  let ahmedabadCam2Id: string;
  let gandhinagarCam1Id: string;
  let ahmedabadDeptId: string;
  let gandhinagarDeptId: string;

  const testImplausiblePlate = 'GJ01TEST9999';

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
    const cam3 = await prisma.camera.findFirst({ where: { name: { contains: 'Secretariat' } } });
    ahmedabadCam1Id = cam1!.id;
    ahmedabadCam2Id = cam2!.id;
    gandhinagarCam1Id = cam3!.id;

    const dept = await prisma.department.findFirst({ where: { name: { contains: 'Ahmedabad' } } });
    ahmedabadDeptId = dept!.id;

    const gndDept = await prisma.department.findFirst({ where: { name: { contains: 'Gandhinagar District' } } });
    gandhinagarDeptId = gndDept!.id;

    // Create a temporary test vehicle with an physically IMPLAUSIBLE transit hop for testing plausibility detection
    // Sighting 1 in Ahmedabad, Sighting 2 in Gandhinagar (~20 km away) only 60 seconds later (speed ~1,200 km/h)
    await prisma.vehicle.create({
      data: {
        plateNormalized: testImplausiblePlate,
        firstSeen: new Date('2026-09-09T01:00:00.000Z'),
        lastSeen: new Date('2026-09-09T01:01:00.000Z'),
        attributes: { color: 'Black', make: 'Mahindra', model: 'Scorpio' },
      },
    });

    await prisma.vehicleSighting.create({
      data: {
        plateNormalized: testImplausiblePlate,
        cameraId: ahmedabadCam1Id,
        ts: new Date('2026-09-09T01:00:00.000Z'),
        confidence: 0.95,
        consensusOf: 5,
        frameRef: 's3://evidence/test1.jpg',
      },
    });

    await prisma.vehicleSighting.create({
      data: {
        plateNormalized: testImplausiblePlate,
        cameraId: gandhinagarCam1Id,
        ts: new Date('2026-09-09T01:01:00.000Z'), // 60s later, 20km away
        confidence: 0.92,
        consensusOf: 6,
        frameRef: 's3://evidence/test2.jpg',
      },
    });
  });

  afterAll(async () => {
    // Clean up temporary test vehicle and sightings
    await prisma.vehicleSighting.deleteMany({ where: { plateNormalized: testImplausiblePlate } });
    await prisma.vehicle.deleteMany({ where: { plateNormalized: testImplausiblePlate } });
    await app.close();
  });

  // ----------------------------------------------------------------------------
  // 1. RBAC & UNAUTHENTICATED ACCESS
  // ----------------------------------------------------------------------------
  describe('RBAC & Access Control', () => {
    it('1. Unauthenticated vehicle search returns 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .expect(401);

      expect(res.body).toHaveProperty('error_code', 'UNAUTHORIZED');
    });

    it('2. OPERATOR role is forbidden from vehicle search (returns 403 FORBIDDEN_RESOURCE)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${operatorAccessToken}`)
        .expect(403);

      expect(res.body).toHaveProperty('error_code', 'FORBIDDEN_RESOURCE');
    });

    it('3. INVESTIGATOR role is authorized to search vehicles (returns 200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
    });

    it('4. SUPER_ADMIN role is authorized to search vehicles (returns 200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. VEHICLE SEARCH & PLATE LOOKUP
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/vehicles & /api/v1/vehicles/search', () => {
    it('5. Search by normalized plate query (GJ01AB1234) returns matching vehicle', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles?q=GJ01AB1234')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const vehicle = res.body.data.find((v: any) => v.plate_normalized === 'GJ01AB1234');
      expect(vehicle).toBeDefined();
      expect(vehicle).toHaveProperty('plate_normalized', 'GJ01AB1234');
      expect(vehicle).toHaveProperty('first_seen');
      expect(vehicle).toHaveProperty('last_seen');
      expect(vehicle).toHaveProperty('total_sightings');
      expect(vehicle).toHaveProperty('is_watchlisted', true); // Seeded stolen vehicle
      expect(vehicle).toHaveProperty('watchlist_category', 'STOLEN_VEHICLE');
    });

    it('6. Search with unnormalized input (lowercase, spaces, hyphens: "gj 01-ab 1234") normalizes correctly', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles?q=gj%2001-ab%201234')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].plate_normalized).toBe('GJ01AB1234');
    });

    it('7. Search alias endpoint (/api/v1/vehicles/search?q=) returns identical results', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/search?q=GJ01AB')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].plate_normalized).toContain('GJ01AB');
    });

    it('8. Search pagination works and returns page, limit, and total count', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles?limit=1&page=1')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination).toHaveProperty('page', 1);
      expect(res.body.pagination).toHaveProperty('limit', 1);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('total_pages');
    });

    it('9. Invalid ISO timestamp format returns 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles?from=not-a-date')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(400);

      expect(res.body).toHaveProperty('error_code', 'BAD_REQUEST');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. VEHICLE DEEP-DIVE DETAIL
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/vehicles/:plate', () => {
    it('10. Vehicle detail returns first/last known sightings, attributes, and watchlist alerts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/GJ01AB1234')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('plate_normalized', 'GJ01AB1234');
      expect(res.body).toHaveProperty('first_seen');
      expect(res.body).toHaveProperty('last_seen');
      expect(res.body).toHaveProperty('total_sightings', 2);
      expect(res.body).toHaveProperty('is_watchlisted', true);
      expect(res.body.watchlist_details).toHaveProperty('category', 'STOLEN_VEHICLE');
      expect(res.body).toHaveProperty('first_known_sighting');
      expect(res.body.first_known_sighting).toHaveProperty('camera_name');
      expect(res.body.first_known_sighting).toHaveProperty('location');
      expect(res.body).toHaveProperty('last_known_sighting');
    });

    it('11. Non-existent vehicle returns 404 VEHICLE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/GJ99ZZ9999')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(404);

      expect(res.body).toHaveProperty('error_code', 'VEHICLE_NOT_FOUND');
    });
  });

  // ----------------------------------------------------------------------------
  // 4. VEHICLE SIGHTING HISTORY & FILTERS
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/vehicles/:plate/sightings', () => {
    it('12. Sightings history returns chronological observations with camera coordinates and confidence', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/GJ01AB1234/sightings')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('plate_normalized', 'GJ01AB1234');
      expect(res.body.data.length).toBe(2);

      const s1 = res.body.data[0];
      expect(s1).toHaveProperty('id');
      expect(s1).toHaveProperty('timestamp');
      expect(s1).toHaveProperty('confidence');
      expect(s1).toHaveProperty('consensus_frames');
      expect(s1).toHaveProperty('camera_id');
      expect(s1).toHaveProperty('camera_name');
      expect(s1.coordinates).toHaveProperty('lat');
      expect(s1.coordinates).toHaveProperty('long');
      expect(s1.location).toHaveProperty('address');

      // Verify chronological ordering (first sighting ts <= second sighting ts)
      const ts1 = new Date(res.body.data[0].timestamp).getTime();
      const ts2 = new Date(res.body.data[1].timestamp).getTime();
      expect(ts1).toBeLessThanOrEqual(ts2);
    });

    it('13. Sightings camera filtering returns only observations at specified camera', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/GJ01AB1234/sightings?camera_id=${ahmedabadCam1Id}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].camera_id).toBe(ahmedabadCam1Id);
    });

    it('14. Sightings department filtering respects department boundary', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/GJ01AB1234/sightings?department_id=${ahmedabadDeptId}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body.data.length).toBe(2);
      for (const sighting of res.body.data) {
        expect(sighting.department_id).toBe(ahmedabadDeptId);
      }
    });

    it('15. Sightings for non-existent vehicle returns 404 VEHICLE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/UNKNOWN0000/sightings')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(404);

      expect(res.body).toHaveProperty('error_code', 'VEHICLE_NOT_FOUND');
    });
  });

  // ----------------------------------------------------------------------------
  // 5. SPATIO-TEMPORAL ROUTE RECONSTRUCTION & PLAUSIBILITY
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/vehicles/:plate/timeline & /route (Trajectory & Plausibility)', () => {
    it('16. Route reconstruction calculates distance (meters via PostGIS), travel time, speed, and plausibility', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/GJ01AB1234/timeline')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('plate_normalized', 'GJ01AB1234');
      expect(res.body).toHaveProperty('total_sightings', 2);
      expect(res.body).toHaveProperty('route_plausibility_score');
      expect(res.body).toHaveProperty('disclaimer');
      expect(res.body.disclaimer).toContain('Observed movement between camera observations');

      // Verify route segments (1 hop between 2 sightings)
      expect(res.body.route_segments.length).toBe(1);
      const hop = res.body.route_segments[0];

      expect(hop).toHaveProperty('from_camera_id', ahmedabadCam1Id);
      expect(hop).toHaveProperty('to_camera_id', ahmedabadCam2Id);
      expect(hop).toHaveProperty('distance_meters');
      expect(typeof hop.distance_meters).toBe('number');
      // Distance between Pakwan (SG Highway) and Swastik (CG Road) is ~5.3 km (5000m to 5600m)
      expect(hop.distance_meters).toBeGreaterThan(5000);
      expect(hop.distance_meters).toBeLessThan(5600);

      expect(hop).toHaveProperty('elapsed_seconds', 600); // 10 minutes seeded
      expect(hop).toHaveProperty('estimated_speed_kmh');
      // 5.3 km in 10 minutes = ~31.8 to ~32.0 km/h
      expect(hop.estimated_speed_kmh).toBeGreaterThan(30);
      expect(hop.estimated_speed_kmh).toBeLessThan(35);

      expect(hop).toHaveProperty('is_plausible', true);
      expect(hop).toHaveProperty('plausibility_status', 'PLAUSIBLE');
      expect(hop).toHaveProperty('segment_confidence');
      expect(hop.segment_confidence).toBeGreaterThan(0.9);

      // Route summary
      expect(res.body.summary).toHaveProperty('total_distance_meters');
      expect(res.body.summary).toHaveProperty('total_elapsed_seconds', 600);
      expect(res.body.summary).toHaveProperty('hops_count', 1);
      expect(res.body.summary).toHaveProperty('implausible_hops_count', 0);
    });

    it('17. Route reconstruction flags physically IMPLAUSIBLE transit jumps (exceeding speed threshold)', async () => {
      // testImplausiblePlate traveled ~20 km in 60 seconds (~1,200 km/h)
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${testImplausiblePlate}/timeline`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body.route_segments.length).toBe(1);
      const hop = res.body.route_segments[0];

      expect(hop.distance_meters).toBeGreaterThan(15000); // >15 km
      expect(hop.elapsed_seconds).toBe(60);
      expect(hop.estimated_speed_kmh).toBeGreaterThan(900); // >900 km/h
      expect(hop.is_plausible).toBe(false);
      expect(hop.plausibility_status).toBe('REQUIRES_REVIEW');
      expect(hop.plausibility_reason).toContain('exceeds plausible transit threshold');

      // Overall score should reflect the implausible hop
      expect(res.body.route_plausibility_score).toBeLessThan(1.0);
      expect(res.body.summary.implausible_hops_count).toBe(1);
    });

    it('18. Alias endpoint /api/v1/vehicles/:plate/route returns identical route reconstruction', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/GJ01AB1234/route')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('plate_normalized', 'GJ01AB1234');
      expect(res.body.route_segments.length).toBe(1);
    });
  });

  // ----------------------------------------------------------------------------
  // 6. SENSITIVE FIELD EXCLUSION & AUDIT TRAILS
  // ----------------------------------------------------------------------------
  describe('Security & Audit Trails', () => {
    it('19. Vehicle investigation responses never expose password hashes, internal secrets, or vault tokens', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/GJ01AB1234/timeline')
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      const json = JSON.stringify(res.body);
      expect(json).not.toContain('password');
      expect(json).not.toContain('passwordHash');
      expect(json).not.toContain('vault://');
      expect(json).not.toContain('secret');
      expect(json).not.toContain('JWT_SECRET');
    });

    it('20. Sensitive vehicle investigation access is synchronously logged in audit_logs', async () => {
      const audit = await prisma.auditLog.findFirst({
        where: {
          resource: 'Vehicle',
          action: 'VEHICLE_TIMELINE_SEARCH',
        },
        orderBy: { ts: 'desc' },
      });

      expect(audit).toBeDefined();
      expect(audit!.resource).toBe('Vehicle');
      expect((audit!.after as any).plate_normalized || (audit!.after as any).plate).toBe('GJ01AB1234');
    });

    it('21. Cross-department vehicle tracking enables investigators to see sightings across district boundaries, with optional departmental scoping', async () => {
      // 1. Unfiltered query returns sightings across both Ahmedabad and Gandhinagar jurisdictions
      const resAll = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${testImplausiblePlate}/sightings`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(resAll.body.data.length).toBe(2);
      const camIds = resAll.body.data.map((s: any) => s.camera_id);
      expect(camIds).toContain(ahmedabadCam1Id);
      expect(camIds).toContain(gandhinagarCam1Id);

      // 2. Department-scoped query restricts sightings exclusively to Ahmedabad cameras
      const resAhm = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${testImplausiblePlate}/sightings?department_id=${ahmedabadDeptId}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(resAhm.body.data.length).toBe(1);
      expect(resAhm.body.data[0].camera_id).toBe(ahmedabadCam1Id);

      // 3. Department-scoped query restricts sightings exclusively to Gandhinagar cameras
      const resGnd = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${testImplausiblePlate}/sightings?department_id=${gandhinagarDeptId}`)
        .set('Authorization', `Bearer ${investigatorAccessToken}`)
        .expect(200);

      expect(resGnd.body.data.length).toBe(1);
      expect(resGnd.body.data[0].camera_id).toBe(gandhinagarCam1Id);
    });
  });
});
