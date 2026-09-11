// ==============================================================================
// Evidence Verification & Export Package E2E Test Suite (Phase 5A)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 11, Section 8.2, FR-019, Journey O)
// ==============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import AdmZip from 'adm-zip';
import { EvidenceSourceType } from '@prisma/client';

describe('Evidence Verification & Export Package API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s3Client: S3Client;

  let superAdminToken: string;
  let investigatorToken: string;
  let operatorToken: string;
  let auditorToken: string;
  let deptAdminToken: string;

  let validEvidenceId: string;
  let tamperedEvidenceId: string;
  let testSightingId: string;
  const testStorageKey = 'evidence/2026/09/10/CAM-AHM-01/sighting_test_export_001.jpg';
  const testStorageRef = `s3://police-evidence-vault/${testStorageKey}`;
  const testImageBuffer = Buffer.from('FAKE-JPEG-BINARY-DATA-FOR-TESTING-EVIDENCE-INTEGRITY-2026');
  const validSha256 = crypto.createHash('sha256').update(testImageBuffer).digest('hex');
  const tamperedSha256 = '0000000000000000000000000000000000000000000000000000000000000000';

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
    const auditorRole = await prisma.role.findFirst({ where: { name: 'SYSTEM_AUDITOR' } });
    const dept = await prisma.department.findFirst();
    const auditorUser = await prisma.user.upsert({
      where: { email: 'auditor.demo@gujcamera.local' },
      update: {},
      create: {
        email: 'auditor.demo@gujcamera.local',
        passwordHash: 'dummy-hash',
        roleId: auditorRole!.id,
        departmentId: dept!.id,
        isActive: true,
      },
    });
    // Acquire auditor token via superAdmin or direct JWT if needed, or login
    const auditorLoginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin.demo@gujcamera.local', password: 'PoliceDemo@2026!' });
    // For auditor testing, use auditor if password matches or test role check

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
        ts: new Date(),
      },
    });

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
        sourceId: tamperedSighting.id,
        storageRef: testStorageRef,
        hash: tamperedSha256, // Does not match actual bytes
        capturedAt: new Date(),
      },
    });
    tamperedEvidenceId = tamperedEvidence.id;
  });

  afterAll(async () => {
    await prisma.evidence.deleteMany({
      where: { storageRef: testStorageRef },
    });
    await app.close();
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
    });

    it('4. Reports INTEGRITY_BREACH when stored bytes do not match canonical hash', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${tamperedEvidenceId}`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(200);

      expect(res.body.verification.verified).toBe(false);
      expect(res.body.verification.status).toBe('INTEGRITY_BREACH');
      expect(res.body.verification.calculated_hash).not.toBe(res.body.verification.expected_hash);
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

    it('6b. Rejects DEPARTMENT_ADMIN role with 403 Forbidden on lookup by sighting', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/evidence/by-sighting/${testSightingId}`)
        .set('Authorization', `Bearer ${deptAdminToken}`)
        .expect(403);
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Authenticated Evidence Package Export (ZIP Bundle)
  // ----------------------------------------------------------------------------
  describe('GET /api/v1/evidence/:id/export (Export Package)', () => {
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

    it('9. Successfully exports Evidence Integrity Package as authenticated ZIP bundle', async () => {
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

      // Verify metadata.json content
      const metadataEntry = zip.getEntry('metadata.json');
      const metadataObj = JSON.parse(metadataEntry!.getData().toString('utf8'));
      expect(metadataObj.evidence_id).toBe(validEvidenceId);
      expect(metadataObj.sha256_hash).toBe(validSha256);
      expect(metadataObj.export_audit.verification_result).toBe('SHA-256_MATCH_VERIFIED');
      expect(metadataObj.export_audit.exporting_email).toBe('investigator.demo@gujcamera.local');

      // Verify Certificate of Integrity text content
      const certEntry = zip.getEntry('CERTIFICATE_OF_INTEGRITY.txt');
      const certText = certEntry!.getData().toString('utf8');
      expect(certText).toContain('TECHNICAL EVIDENCE INTEGRITY CERTIFICATE');
      expect(certText).toContain('Verification Result: PASS — 100% Cryptographic Match');
      expect(certText).toContain(validSha256);
      expect(certText).toContain('investigator.demo@gujcamera.local');
    });

    it('10. Blocks export with 409 Conflict when stored bytes fail SHA-256 verification', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/evidence/${tamperedEvidenceId}/export`)
        .set('Authorization', `Bearer ${investigatorToken}`)
        .expect(409);

      expect(res.body.message).toContain('INTEGRITY_VERIFICATION_FAILED');

      // Verify security alert audit was logged
      const tamperAudit = await prisma.auditLog.findFirst({
        where: { action: 'EVIDENCE_TAMPER_DETECTED' },
        orderBy: { ts: 'desc' },
      });
      expect(tamperAudit).not.toBeNull();
      expect((tamperAudit!.after as any).severity).toBe('SECURITY_ALERT');
    });

    it('11. Generates synchronous audit log when evidence is exported', async () => {
      const exportAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'EVIDENCE_PACKAGE_EXPORTED',
          actorId: (await prisma.user.findFirst({ where: { email: 'investigator.demo@gujcamera.local' } }))!.id,
        },
        orderBy: { ts: 'desc' },
      });

      expect(exportAudit).not.toBeNull();
      expect((exportAudit!.after as any).evidence_id).toBe(validEvidenceId);
      expect((exportAudit!.after as any).sha256_hash).toBe(validSha256);
    });
  });
});
