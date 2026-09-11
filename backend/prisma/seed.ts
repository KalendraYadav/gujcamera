// ==============================================================================
// Unified CCTV Intelligence Platform — Database Seed Script
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6 & Section 23)
// NOTE: All seeded records are strictly DEVELOPMENT / DEMO FIXTURES.
// ==============================================================================

import { PrismaClient, OperationalStatus, CameraProtocol, AlertSeverity, AlertStatus, DetectionType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const S3_BUCKET = process.env.MINIO_BUCKET_NAME || process.env.MINIO_BUCKET || 'police-evidence-vault';
const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || 'minio_admin';
const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || 'minio_dev_secret_2026';

const s3Client = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

function createSyntheticEvidenceJpeg(comment: string): Buffer {
  const commentBytes = Buffer.from(comment, 'utf8');
  const comLength = commentBytes.length + 2;
  const comHeader = Buffer.from([0xff, 0xfe, (comLength >> 8) & 0xff, comLength & 0xff]);

  const baseHeader = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, // APP0 JFIF
  ]);

  const baseRest = Buffer.from([
    0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, // DQT
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, // SOF0 (1x1 grayscale)
    0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, // DHT
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x00, // SOS
    0xff, 0xd9, // EOI
  ]);

  return Buffer.concat([baseHeader, comHeader, commentBytes, baseRest]);
}

async function main() {
  console.log('🌱 Starting database seeding (Development/Demo Fixtures)...');

  // 1. Clean existing records in reverse dependency order (safe for repeated runs)
  console.log('🧹 Cleaning old demo records...');
  await prisma.auditLog.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.watchlistEntry.deleteMany();
  await prisma.watchlist.deleteMany();
  await prisma.vehicleSighting.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.plateDetection.deleteMany();
  await prisma.detection.deleteMany();
  await prisma.cameraHealth.deleteMany();
  await prisma.cameraStream.deleteMany();
  await prisma.location.deleteMany();
  await prisma.camera.deleteMany();
  await prisma.connector.deleteMany();
  await prisma.user.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.department.deleteMany();

  // 2. Seed Roles
  console.log('👥 Creating canonical police roles...');
  const roleSuperAdmin = await prisma.role.create({ data: { name: 'SUPER_ADMIN' } });
  const roleDeptAdmin = await prisma.role.create({ data: { name: 'DEPARTMENT_ADMIN' } });
  const roleInvestigator = await prisma.role.create({ data: { name: 'INVESTIGATOR' } });
  const roleOperator = await prisma.role.create({ data: { name: 'OPERATOR' } });
  const roleAuditor = await prisma.role.create({ data: { name: 'SYSTEM_AUDITOR' } });

  // 3. Seed Permissions
  console.log('🔑 Assigning role permissions...');
  const permissionsData = [
    { roleId: roleSuperAdmin.id, resource: '*', action: '*' },
    { roleId: roleDeptAdmin.id, resource: 'cameras', action: 'manage' },
    { roleId: roleDeptAdmin.id, resource: 'watchlists', action: 'manage' },
    { roleId: roleInvestigator.id, resource: 'vehicles', action: 'search' },
    { roleId: roleInvestigator.id, resource: 'alerts', action: 'investigate' },
    { roleId: roleInvestigator.id, resource: 'evidence', action: 'export' },
    { roleId: roleOperator.id, resource: 'cameras', action: 'view' },
    { roleId: roleOperator.id, resource: 'alerts', action: 'acknowledge' },
    { roleId: roleAuditor.id, resource: 'audit_logs', action: 'read' },
    { roleId: roleAuditor.id, resource: 'evidence', action: 'verify' },
  ];
  for (const perm of permissionsData) {
    await prisma.permission.create({ data: perm });
  }

  // 4. Seed Departments (Gujarat Police Hierarchy)
  console.log('🏛️ Creating Gujarat Police department hierarchy...');
  const deptDGP = await prisma.department.create({
    data: {
      name: 'Director General of Police (DGP) Headquarters - Gandhinagar',
      retentionPolicyId: 'POLICY-STATE-DEFAULT-90D',
    },
  });

  const deptAhmedabad = await prisma.department.create({
    data: {
      name: 'Ahmedabad City Police Commissionerate',
      parentDepartmentId: deptDGP.id,
      retentionPolicyId: 'POLICY-AHMEDABAD-CITY-1YR',
    },
  });

  const deptGandhinagar = await prisma.department.create({
    data: {
      name: 'Gandhinagar District Police',
      parentDepartmentId: deptDGP.id,
      retentionPolicyId: 'POLICY-GANDHINAGAR-DIST-1YR',
    },
  });

  // 5. Seed Demo Users (Explicitly labeled as DEVELOPMENT FIXTURES)
  console.log('👤 Creating development demo accounts (Password: PoliceDemo@2026!)...');
  const passwordHash = await bcrypt.hash('PoliceDemo@2026!', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin.demo@gujcamera.local',
      passwordHash,
      roleId: roleSuperAdmin.id,
      departmentId: deptDGP.id,
      mfaEnabled: true,
      isActive: true,
    },
  });

  const operatorUser = await prisma.user.create({
    data: {
      email: 'operator.demo@gujcamera.local',
      passwordHash,
      roleId: roleOperator.id,
      departmentId: deptAhmedabad.id,
      mfaEnabled: false,
      isActive: true,
    },
  });

  const investigatorUser = await prisma.user.create({
    data: {
      email: 'investigator.demo@gujcamera.local',
      passwordHash,
      roleId: roleInvestigator.id,
      departmentId: deptAhmedabad.id,
      mfaEnabled: true,
      isActive: true,
    },
  });

  const deptAdminUser = await prisma.user.create({
    data: {
      email: 'deptadmin.demo@gujcamera.local',
      passwordHash,
      roleId: roleDeptAdmin.id,
      departmentId: deptAhmedabad.id,
      mfaEnabled: true,
      isActive: true,
    },
  });

  const auditorUser = await prisma.user.create({
    data: {
      email: 'auditor.demo@gujcamera.local',
      passwordHash,
      roleId: roleAuditor.id,
      departmentId: deptDGP.id,
      mfaEnabled: true,
      isActive: true,
    },
  });

  // 6. Seed Ingestion Connectors (master_architecture.md Model 3)
  console.log('🔌 Creating protocol connectors (RTSP, ONVIF, Mock Vendor)...');
  const connectorRTSP = await prisma.connector.create({
    data: {
      adapterType: 'RTSP',
      configRef: 'vault://connectors/rtsp-standard-h264',
    },
  });

  const connectorONVIF = await prisma.connector.create({
    data: {
      adapterType: 'ONVIF',
      configRef: 'vault://connectors/onvif-profiles-s',
    },
  });

  const connectorMockVendor = await prisma.connector.create({
    data: {
      adapterType: 'MOCK_VENDOR',
      configRef: 'vault://connectors/vendor-a-hikvision-emulated',
    },
  });

  // 7. Seed Demo Cameras with Real Gujarat Transit GPS Coordinates
  console.log('📹 Seeding demonstration CCTV camera fixtures...');
  const camerasData = [
    {
      name: 'CAM-AHM-01: SG Highway - Pakwan Crossroad Junction',
      departmentId: deptAhmedabad.id,
      lat: 23.0338142,
      long: 72.5073289,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorRTSP.id,
      operationalStatus: OperationalStatus.ONLINE,
      location: {
        address: 'Pakwan Crossroad, Sarkhej - Gandhinagar Hwy, Bodakdev',
        zone: 'West Zone',
        district: 'Ahmedabad',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 25,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-ahm-01',
      },
    },
    {
      name: 'CAM-AHM-02: C.G. Road - Swastik Char Rasta',
      departmentId: deptAhmedabad.id,
      lat: 23.0354120,
      long: 72.5592810,
      protocol: CameraProtocol.ONVIF,
      connectorTypeId: connectorONVIF.id,
      operationalStatus: OperationalStatus.ONLINE,
      location: {
        address: 'Swastik Cross Road, Chimanlal Girdharlal Rd, Navrangpura',
        zone: 'West Zone',
        district: 'Ahmedabad',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 20,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-ahm-02',
      },
    },
    {
      name: 'CAM-AHM-03: Sabarmati Riverfront Promenade North',
      departmentId: deptAhmedabad.id,
      lat: 23.0415100,
      long: 72.5742100,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorRTSP.id,
      operationalStatus: OperationalStatus.ONLINE,
      location: {
        address: 'Sabarmati Riverfront West Bank, Usmanpura',
        zone: 'Central Zone',
        district: 'Ahmedabad',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 30,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-ahm-03',
      },
    },
    {
      name: 'CAM-GND-01: Gandhinagar Secretariat - Gate 1',
      departmentId: deptGandhinagar.id,
      lat: 23.2167200,
      long: 72.6372100,
      protocol: CameraProtocol.MOCK_VENDOR,
      connectorTypeId: connectorMockVendor.id,
      operationalStatus: OperationalStatus.ONLINE,
      location: {
        address: 'New Sachivalaya, Sector 10, Gandhinagar',
        zone: 'Capital Zone',
        district: 'Gandhinagar',
      },
      stream: {
        codec: 'h265',
        resolution: '2560x1440',
        fps: 25,
        urlOrHandle: 'mock://vendor-a/gnd-sec-01',
      },
    },
    {
      name: 'CAM-GND-02: CH-0 Circle - Gandhinagar Entrance',
      departmentId: deptGandhinagar.id,
      lat: 23.1985400,
      long: 72.6288300,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorRTSP.id,
      operationalStatus: OperationalStatus.DEGRADED,
      location: {
        address: 'CH-0 Circle, Koba Circle Highway Link, Gandhinagar',
        zone: 'Outer Zone',
        district: 'Gandhinagar',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 15,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-gnd-02',
      },
    },
  ];

  const createdCameras = [];
  for (const c of camerasData) {
    const cam = await prisma.camera.create({
      data: {
        name: c.name,
        departmentId: c.departmentId,
        lat: c.lat,
        long: c.long,
        protocol: c.protocol,
        connectorTypeId: c.connectorTypeId,
        operationalStatus: c.operationalStatus,
        location: {
          create: c.location,
        },
        streams: {
          create: c.stream,
        },
        health: {
          create: {
            lastHeartbeat: new Date(),
            fpsActual: c.stream.fps,
            packetLoss: c.operationalStatus === OperationalStatus.ONLINE ? 0.0 : 4.5,
            status: c.operationalStatus,
          },
        },
      },
    });
    createdCameras.push(cam);
  }

  // 8. Seed Demo Watchlist & Flagged Vehicles
  console.log('🚨 Seeding demo police watchlist & flagged plates...');
  const watchlistStolen = await prisma.watchlist.create({
    data: {
      name: 'Ahmedabad Stolen Vehicles Watchlist (DEMO)',
      departmentId: deptAhmedabad.id,
      owner: 'Crime Branch Unit 3',
    },
  });

  const watchlistSuspects = await prisma.watchlist.create({
    data: {
      name: 'High-Priority Inter-District Suspects (DEMO)',
      departmentId: deptDGP.id,
      owner: 'State Intelligence Bureau',
    },
  });

  const entryStolen1 = await prisma.watchlistEntry.create({
    data: {
      watchlistId: watchlistStolen.id,
      plateNormalized: 'GJ01AB1234',
      category: 'STOLEN_VEHICLE',
      reason: 'White Hyundai Creta reported stolen from Vastrapur - FIR #102/2026',
      priority: AlertSeverity.CRITICAL,
      addedBy: investigatorUser.email,
      active: true,
    },
  });

  await prisma.watchlistEntry.create({
    data: {
      watchlistId: watchlistStolen.id,
      plateNormalized: 'GJ05CD5678',
      category: 'HIT_AND_RUN',
      reason: 'Silver Swift involved in pedestrian hit-and-run on SG Highway - FIR #405/2026',
      priority: AlertSeverity.HIGH,
      addedBy: investigatorUser.email,
      active: true,
    },
  });

  await prisma.watchlistEntry.create({
    data: {
      watchlistId: watchlistSuspects.id,
      plateNormalized: 'GJ27EF9012',
      category: 'ORGANIZED_CRIME',
      reason: 'Black Scorpio associated with inter-state contraband transit',
      priority: AlertSeverity.HIGH,
      addedBy: adminUser.email,
      active: true,
    },
  });

  // 9. Seed Demo Vehicle Identity & Consecutive Sightings for Demonstration Plate GJ01AB1234
  console.log('🚗 Seeding demonstration vehicle timeline (Plate: GJ01AB1234)...');
  const demoVehicle = await prisma.vehicle.create({
    data: {
      plateNormalized: 'GJ01AB1234',
      firstSeen: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
      lastSeen: new Date(Date.now() - 5 * 60 * 1000),  // 5 mins ago
      attributes: {
        color: 'White',
        type: 'SUV',
        make: 'Hyundai',
        model: 'Creta',
      },
    },
  });

  // First Sighting on CAM-AHM-01 (Pakwan Cross Road)
  const sighting1 = await prisma.vehicleSighting.create({
    data: {
      plateNormalized: demoVehicle.plateNormalized,
      cameraId: createdCameras[0].id,
      ts: new Date(Date.now() - 15 * 60 * 1000),
      confidence: 0.9450,
      consensusOf: 6,
      frameRef: 's3://police-evidence-vault/frames/2026/09/09/cam-ahm-01-gj01ab1234-sighting1.jpg',
    },
  });

  // Second Sighting on CAM-AHM-02 (C.G. Road) — 10 minutes later (~5 km away, physically plausible transit)
  const sighting2 = await prisma.vehicleSighting.create({
    data: {
      plateNormalized: demoVehicle.plateNormalized,
      cameraId: createdCameras[1].id,
      ts: new Date(Date.now() - 5 * 60 * 1000),
      confidence: 0.9620,
      consensusOf: 7,
      frameRef: 's3://police-evidence-vault/frames/2026/09/09/cam-ahm-02-gj01ab1234-sighting2.jpg',
    },
  });

  // 10. Seed Demo Alert for Sighting 2 matching Watchlist
  console.log('🚨 Generating initial demo alert for demonstration plate...');
  await prisma.alert.create({
    data: {
      sourceSightingId: sighting2.id,
      watchlistEntryId: entryStolen1.id,
      severity: AlertSeverity.CRITICAL,
      status: AlertStatus.NEW,
      ts: sighting2.ts,
    },
  });

  // 11. Seed Evidence Records with MinIO S3 Binary Uploads & Authentic SHA-256 Digests
  console.log('🛡️ Generating deterministic synthetic evidence vault fixtures in MinIO & DB...');
  
  // Ensure MinIO bucket exists
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  } catch {
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
      console.log(`   📦 Created MinIO bucket '${S3_BUCKET}'.`);
    } catch (createErr: any) {
      console.warn(`   ⚠️ Bucket creation notice: ${createErr.message}`);
    }
  }

  // Generate deterministic JPEG frames with clear simulated demo comments
  const jpegSighting1 = createSyntheticEvidenceJpeg(
    'SIMULATED DEMO CCTV EVIDENCE - GUJARAT POLICE GPIC-2026 - CAM-AHM-01 - GJ01AB1234 - SIGHTING 1'
  );
  const sha256Sighting1 = crypto.createHash('sha256').update(jpegSighting1).digest('hex');

  const jpegSighting2 = createSyntheticEvidenceJpeg(
    'SIMULATED DEMO CCTV EVIDENCE - GUJARAT POLICE GPIC-2026 - CAM-AHM-02 - GJ01AB1234 - SIGHTING 2'
  );
  const sha256Sighting2 = crypto.createHash('sha256').update(jpegSighting2).digest('hex');

  const key1 = 'frames/2026/09/09/cam-ahm-01-gj01ab1234-sighting1.jpg';
  const key2 = 'frames/2026/09/09/cam-ahm-02-gj01ab1234-sighting2.jpg';

  // Upload frames to MinIO S3
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key1,
      Body: jpegSighting1,
      ContentType: 'image/jpeg',
    })
  );
  console.log(`   ✅ Sighting 1 frame stored in MinIO ('${S3_BUCKET}/${key1}'). SHA-256: ${sha256Sighting1}`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key2,
      Body: jpegSighting2,
      ContentType: 'image/jpeg',
    })
  );
  console.log(`   ✅ Sighting 2 frame stored in MinIO ('${S3_BUCKET}/${key2}'). SHA-256: ${sha256Sighting2}`);

  // Create database Evidence records for both sightings with authentic cryptographic hashes
  const evidence1 = await prisma.evidence.create({
    data: {
      sourceType: 'SIGHTING',
      sourceId: sighting1.id,
      storageRef: sighting1.frameRef,
      hash: sha256Sighting1,
      capturedAt: sighting1.ts,
    },
  });

  const evidence2 = await prisma.evidence.create({
    data: {
      sourceType: 'SIGHTING',
      sourceId: sighting2.id,
      storageRef: sighting2.frameRef,
      hash: sha256Sighting2,
      capturedAt: sighting2.ts,
    },
  });
  console.log(`   ✅ Evidence records seeded in DB: Sighting 1 -> ${evidence1.id}, Sighting 2 -> ${evidence2.id}`);

  // 12. Seed Initial Audit Record
  console.log('📝 Creating initial system audit log...');
  await prisma.auditLog.create({
    data: {
      actorId: adminUser.id,
      action: 'SYSTEM_INITIALIZATION',
      resource: 'System',
      before: null,
      after: { event: 'Phase 1 Database Foundation Initialized', demoFixturesLoaded: true },
      correlationId: '00000000-0000-0000-0000-000000000001',
    },
  });

  console.log('✅ Database seeding complete with realistic, clearly-labeled demo fixtures.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
