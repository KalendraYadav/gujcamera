// ==============================================================================
// Evidence Verification, Raw Frame & Export Package E2E Test Suite (Phase 11 Hardening)
// Gujarat Police Unified CCTV Intelligence Platform
// Source of Truth: Phase 11 Evidence Lifecycle & Forensic Audit Hardening Specification
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as http from 'http';
import AdmZip from 'adm-zip';
import { EvidenceSourceType } from '@prisma/client';

describe('Evidence Lifecycle & Forensic Audit Hardening API (Phase 11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s3Client: S3Client;
  let mockS3Server: http.Server | null = null;
  const s3Store = new Map<string, Buffer>();

  let superAdminToken: string;
  let investigatorToken: string;
  let operatorToken: string;
  let auditorToken: string;
  let deptAdminToken: string;

  let validEvidenceId: string;
  let tamperedEvidenceId: string;
  let missingStorageEvidenceId: string;
  let testSightingId: string;
  let tamperedSightingId: string;
  let missingSightingId: string;

  const testStorageKey = 'evidence/2026/09/10/CAM-AHM-01/sighting_test_export_001.jpg';
  const testStorageRef = `s3://police-evidence-vault/${testStorageKey}`;
  const missingStorageRef = 's3://police-evidence-vault/evidence/2026/09/missing_frame_vault_999.jpg';
  const testImageBuffer = Buffer.from('FAKE-JPEG-BINARY-DATA-FOR-TESTING-EVIDENCE-INTEGRITY-2026');
  const validSha256 = crypto.createHash('sha256').update(testImageBuffer).digest('hex');
  const tamperedSha256 = '0000000000000000000000000000000000000000000000000000000000000000';

  jest.setTimeout(90000);

  beforeAll(async () => {
    // 0. Ensure port 9000 S3 mock exists if external MinIO is not running
    await new Promise<void>((resolve) => {
      const server = http.createServer((req, res) => {
        const url = req.url?.split('?')[0] || '';
        if (req.method === 'PUT') {
          const chunks: Buffer[] = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            s3Store.set(url, Buffer.concat(chunks));
            res.writeHead(200, { ETag: '"mock-etag-hash"' });
            res.end();
          });
        } else if (req.method === 'GET') {
          if (s3Store.has(url)) {
            const b = s3Store.get(url)!;
            res.writeHead(200, {
              'Content-Type': 'image/jpeg',
              'Content-Length': b.length.toString(),
            });
            res.end(b);
          } else {
            res.writeHead(404, { 'Content-Type': 'application/xml' });
            res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code></Error>');
          }
        } else {
          res.writeHead(200);
          res.end();
        }
      });

      server.listen(9000, () => {
        mockS3Server = server;
        resolve();
      });

      server.on('error', () => {
        // Port 9000 already bound (e.g. MinIO container already active)
        resolve();
      });
    });

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

    // 1. Initialize S3 client and ensure bucket exists & upload test artifact
    s3Client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER || 'minio_admin',
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minio_dev_secret_2026',
      },
      forcePathStyle: true,
    });

    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: 'police-evidence-vault' }));
    } catch {
      // Bucket already exists
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: 'police-evidence-vault',
        Key: testStorageKey,
        Body: testImageBuffer,
        ContentType: 'image/jpeg',
      }),
    );

    // 2. Obtain JWT tokens
    const adminRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    superAdminToken = adminRes.body.access_token;

    const invRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'investigator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    investigatorToken = invRes.body.access_token;

    const opRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'operator.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    operatorToken = opRes.body.access_token;

    const deptAdminRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'deptadmin.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    deptAdminToken = deptAdminRes.body.access_token;

    // Ensure auditor user exists and login
    const adminRecord = await prisma.user.findFirst({ where: { email: 'admin.demo@gujcamera.local' } });
    const auditorRole = await prisma.role.findFirst({ where: { name: 'SYSTEM_AUDITOR' } });
    const dept = await prisma.department.findFirst();
    await prisma.user.upsert({
      where: { email: 'auditor.demo@gujcamera.local' },
      update: { passwordHash: adminRecord!.passwordHash },
      create: {
        email: 'auditor.demo@gujcamera.local',
        passwordHash: adminRecord!.passwordHash,
        roleId: auditorRole!.id,
        departmentId: dept!.id,
        isActive: true,
      },
    });

    const auditorLoginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'auditor.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    auditorToken = auditorLoginRes.body.access_token;

    // 3. Create dedicated test sightings for clean isolation
    const testCamera = await prisma.camera.findFirst();
    const testVehicle = await prisma.vehicle.upsert({
      where: { plateNormalized: 'GJ01EX9999' },
      update: {},
      create: { plateNormalized: 'GJ01EX9999' },
    });

    const testSighting = await prisma.vehicleSighting.create({
      data: {
        plateNormalized: testVehicle.plateNormalized,
        cameraId: testCamera!.id,
        confidence: 0.98,
        consensusOf: 5,
        frameRef: testStorageRef,
        vehicleClass: 'SEDAN', // Phase 10 vehicle class
        ts: new Date(),
      },
    });
    testSightingId = testSighting.id;

    const tamperedSighting = await prisma.vehicleSighting.create({
      data: {
        plateNormalized: testVehicle.plateNormalized,
        cameraId: testCamera!.id,
        confidence: 0.95,
        consensusOf: 5,
        frameRef: testStorageRef,
        vehicleClass: 'SUV',
        ts: new Date(),
      },
    });
    tamperedSightingId = tamperedSighting.id;

    const missingSighting = await prisma.vehicleSighting.create({
      data: {
        plateNormalized: testVehicle.plateNormalized,
        cameraId: testCamera!.id,
        confidence: 0.92,
        consensusOf: 4,
        frameRef: missingStorageRef,
        vehicleClass: 'TRUCK',
        ts: new Date(),
      },
    });
    missingSightingId = missingSighting.id;

    // 4. Create valid Evidence record in DB
    const validEvidence = await prisma.evidence.create({
      data: {
        sourceType: EvidenceSourceType.SIGHTING,
        sourceId: testSightingId,
        storageRef: testStorageRef,
        hash: validSha256,
        capturedAt: new Date(),
      },
    });
    validEvidenceId = validEvidence.id;

    // 5. Create tampered Evidence record in DB (hash mismatch on separate sighting)
    const tamperedEvidence = await prisma.evidence.create({
      data: {
        sourceType: EvidenceSourceType.SIGHTING,
        sourceId: tamperedSightingId,
        storageRef: testStorageRef,
        hash: tamperedSha256, // Does not match actual bytes
        capturedAt: new Date(),
      },
    });
    tamperedEvidenceId = tamperedEvidence.id;

    // 6. Create evidence with missing storage object
    const missingEvidence = await prisma.evidence.create({
      data: {
        sourceType: EvidenceSourceType.SIGHTING,
        sourceId: missingSightingId,
        storageRef: missingStorageRef,
        hash: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
        capturedAt: new Date(),
      },
    });
    missingStorageEvidenceId = missingEvidence.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.evidence.deleteMany({
        where: { id: { in: [validEvidenceId, tamperedEvidenceId, missingStorageEvidenceId] } },
      });
      await prisma.vehicleSighting.deleteMany({
        where: { id: { in: [testSightingId, tamperedSightingId, missingSightingId] } },
      });
    }
    if (mockS3Server) {
      await new Promise<void>((resolve) => mockS3Server!.close(() => resolve()));
    }
    if (app) {
      await app.close();
    }
  });

  // ----------------------------------------------------------------------------
  // 1. Evidence Inspection & Cryptographic Verification
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/evidence/:id (Inspection & Live Verification)', () => {
    it('1. Rejects unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}`)
        .expect(401);
    });

    it('2. Rejects OPERATOR role with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);
    });

    it('2b. Rejects DEPARTMENT_ADMIN role with 403 Forbidden on evidence inspection', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(403);
    });

    it('3. Authorizes INVESTIGATOR to inspect evidence with live cryptographic verification', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', validEvidenceId);
      expect(res.body).toHaveProperty('hash', validSha256);
      expect(res.body).toHaveProperty('verification');
      expect(res.body.verification.verified).toBe(true);
      expect(res.body.verification.status).toBe('VERIFIED_MATCH');
      expect(res.body.verification.calculated_hash).toBe(validSha256);
      expect(res.body.sighting).toHaveProperty('id', testSightingId);
      expect(res.body.sighting).toHaveProperty('vehicleClass', 'SEDAN');
    });

    it('3b. Authorizes SYSTEM_AUDITOR to inspect evidence with live verification', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(res.body.verification.verified).toBe(true);
    });

    it('3c. Creates EVIDENCE_INSPECTED audit log on successful inspection', async () => {
      const inspectAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'EVIDENCE_INSPECTED',
          actorId: (await prisma.user.findFirst({ where: { email: 'investigator.demo@gujcamera.local' } }))!.id,
        },
        orderBy: { ts: 'desc' },
      });

      expect(inspectAudit).not.toBeNull();
      expect((inspectAudit!.after as any).evidence_id).toBe(validEvidenceId);
      expect((inspectAudit!.after as any).verification_status).toBe('INTEGRITY_VERIFIED');
      expect((inspectAudit!.after as any).sha256_hash).toBe(validSha256);
    });

    it('4. Reports INTEGRITY_BREACH and creates EVIDENCE_TAMPER_DETECTED audit when bytes do not match canonical hash', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${tamperedEvidenceId}`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body.verification.verified).toBe(false);
      expect(res.body.verification.status).toBe('INTEGRITY_BREACH');
      expect(res.body.verification.calculated_hash).not.toBe(res.body.verification.expected_hash);

      // Verify view-time EVIDENCE_TAMPER_DETECTED audit log was persisted
      const viewTamperAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'EVIDENCE_TAMPER_DETECTED',
          actorId: (await prisma.user.findFirst({ where: { email: 'investigator.demo@gujcamera.local' } }))!.id,
        },
        orderBy: { ts: 'desc' },
      });
      expect(viewTamperAudit).not.toBeNull();
      expect((viewTamperAudit!.after as any).evidence_id).toBe(tamperedEvidenceId);
      expect((viewTamperAudit!.after as any).severity).toBe('SECURITY_ALERT');
    });

    it('5. Returns 404 for non-existent evidence ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/evidence/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(404);
    });

    it('6. Supports lookup by linked sighting ID (GET /evidence/by-sighting/:sightingId)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/by-sighting/${testSightingId}`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('source_id', testSightingId);
      expect(res.body.verification.verified).toBe(true);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Raw Evidence Frame Streaming Endpoint (GET /api/v1/evidence/:id/frame)
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/evidence/:id/frame (Raw Frame Streaming)', () => {
    it('A. Rejects unauthenticated frame request with 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/frame`)
        .expect(401);
    });

    it('B. Rejects OPERATOR role with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/frame`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);
    });

    it('B2. Rejects DEPARTMENT_ADMIN role with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/frame`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(403);
    });

    it('C. Authorizes INVESTIGATOR to stream original JPEG bytes with live SHA-256 verification', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/frame`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['content-length']).toBe(testImageBuffer.length.toString());
      expect(res.headers['x-evidence-integrity']).toBe('VERIFIED_MATCH');
      expect(res.headers['x-evidence-hash']).toBe(validSha256);
      expect(res.body.equals(testImageBuffer)).toBe(true);
    });

    it('C2. Authorizes SUPER_ADMIN to stream original JPEG frame', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/frame`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['x-evidence-integrity']).toBe('VERIFIED_MATCH');
    });

    it('C3. Authorizes SYSTEM_AUDITOR to stream original JPEG frame for audit review', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/frame`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['x-evidence-integrity']).toBe('VERIFIED_MATCH');
    });

    it('D. Returns 404 when evidence record does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/evidence/00000000-0000-0000-0000-000000000000/frame')
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(404);
    });

    it('E. Returns 404 when frame object is missing in storage vault', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${missingStorageEvidenceId}/frame`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(404);
    });

    it('F. Blocks streaming with 409 Conflict when stored bytes fail SHA-256 verification and logs tamper audit', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${tamperedEvidenceId}/frame`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(409);

      expect(res.body.message).toContain('INTEGRITY_VERIFICATION_FAILED');

      // Verify tamper audit was logged
      const tamperAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'EVIDENCE_TAMPER_DETECTED',
          resource: 'evidence',
        },
        orderBy: { ts: 'desc' },
      });
      expect(tamperAudit).not.toBeNull();
      expect((tamperAudit!.after as any).severity).toBe('SECURITY_ALERT');
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Authenticated Evidence Package Export (ZIP Bundle) & RBAC Alignment
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/evidence/:id/export (Export Package & RBAC Alignment)', () => {
    it('7. Rejects unauthenticated export request with 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/export`)
        .expect(401);
    });

    it('8. Rejects OPERATOR role with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/export`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);
    });

    it('8b. Rejects DEPARTMENT_ADMIN role with 403 Forbidden on export package', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/export`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(403);
    });

    it('8c. Rejects SYSTEM_AUDITOR role with 403 Forbidden on export (auditors inspect/verify, but do not export)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/export`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(403);
    });

    it('9. Successfully exports Evidence Integrity Package as authenticated ZIP bundle with vehicleClass metadata', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${validEvidenceId}/export`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .responseType('blob')
        .expect(200);

      expect(res.headers['content-type']).toBe('application/zip');
      expect(res.headers['content-disposition']).toContain('attachment; filename=');
      expect(res.headers['x-evidence-integrity']).toBe('VERIFIED_MATCH');

      // Unzip in-memory and inspect package contents
      const zip = new AdmZip(res.body);
      const zipEntries = zip.getEntries();
      const entryNames = zipEntries.map((e) => e.entryName);

      expect(entryNames.some((n) => n.endsWith('.jpg'))).toBe(true);
      expect(entryNames).toContain('metadata.json');
      expect(entryNames).toContain('CERTIFICATE_OF_INTEGRITY.txt');

      // Verify metadata.json content including Phase 10 vehicleClass
      const metadataEntry = zip.getEntry('metadata.json');
      const metadataObj = JSON.parse(metadataEntry!.getData().toString('utf8'));
      expect(metadataObj.evidence_id).toBe(validEvidenceId);
      expect(metadataObj.sha256_hash).toBe(validSha256);
      expect(metadataObj.vehicleClass).toBe('SEDAN');
      expect(metadataObj.sighting_context.vehicleClass).toBe('SEDAN');
      expect(metadataObj.sighting_context.vehicle_class).toBe('SEDAN');
      expect(metadataObj.export_audit.verification_result).toBe('SHA-256_MATCH_VERIFIED');
      expect(metadataObj.export_audit.exporting_email).toBe('investigator.demo@gujcamera.local');
    });

    it('10. Blocks export with 409 Conflict when stored bytes fail SHA-256 verification', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${tamperedEvidenceId}/export`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(409);

      expect(res.body.message).toContain('INTEGRITY_VERIFICATION_FAILED');
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Evidence → VehicleSighting Formal Prisma Relation Verification
  // ----------------------------------------------------------------------------
  describe('Prisma Evidence ↔ VehicleSighting Relation Hardening', () => {
    it('K1. Navigates relation from Evidence to VehicleSighting', async () => {
      const evidenceWithSighting = await prisma.evidence.findUnique({
        where: { id: validEvidenceId },
        include: { sighting: true },
      });

      expect(evidenceWithSighting).not.toBeNull();
      expect(evidenceWithSighting!.sighting).not.toBeNull();
      expect(evidenceWithSighting!.sighting.id).toBe(testSightingId);
      expect(evidenceWithSighting!.sighting.vehicleClass).toBe('SEDAN');
    });

    it('K2. Navigates reverse relation from VehicleSighting to Evidence', async () => {
      const sightingWithEvidence = await prisma.vehicleSighting.findUnique({
        where: { id: testSightingId },
        include: { evidence: true },
      });

      expect(sightingWithEvidence).not.toBeNull();
      expect(sightingWithEvidence!.evidence).not.toBeNull();
      expect(sightingWithEvidence!.evidence!.id).toBe(validEvidenceId);
    });

    it('K3. Enforces onDelete: Restrict — prevents deleting sighting when evidence exists', async () => {
      // Attempting to delete sighting should fail due to foreign key constraint
      await expect(
        prisma.vehicleSighting.delete({
          where: { id: testSightingId },
        }),
      ).rejects.toThrow();
    });

    it('L. Existing seeded evidence records remain readable', async () => {
      const allEvidence = await prisma.evidence.findMany({
        take: 5,
        include: { sighting: true },
      });

      expect(allEvidence.length).toBeGreaterThan(0);
      for (const ev of allEvidence) {
        expect(ev.id).toBeDefined();
        expect(ev.sourceId).toBeDefined();
      }
    });
  });
});
