// ==============================================================================
// NETRAVAHA — Production Camera Topology Provisioning Script
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md & backend/prisma/seed.ts
//
// Safe, idempotent, non-destructive provisioning of canonical demonstration
// camera fixtures into production Supabase PostgreSQL database.
// ==============================================================================

const { PrismaClient, OperationalStatus, CameraProtocol } = require('../backend/node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');

// Resolve database URL from environment or productionSecret.txt
// Prioritize production connection string from productionSecret.txt
let dbUrl = null;
const secretPath = path.resolve(__dirname, '../productionSecret.txt');
if (fs.existsSync(secretPath)) {
  const content = fs.readFileSync(secretPath, 'utf8');
  const match = content.match(/DATABASE_URL=([^\r\n]+)/);
  if (match) {
    dbUrl = match[1].trim();
  }
}
if (!dbUrl) {
  dbUrl = process.env.DATABASE_URL;
}

if (!dbUrl) {
  console.error('FATAL: DATABASE_URL could not be resolved from environment or productionSecret.txt');
  process.exit(1);
}

// Ensure pgbouncer transaction pooler parameter is present
if (!dbUrl.includes('pgbouncer=true')) {
  dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'pgbouncer=true';
}

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } }
});

async function main() {
  console.log('================================================================');
  console.log(' NETRAVAHA — Production Camera Topology Provisioning');
  console.log('================================================================');

  // STEP 1: Verify existing production departments & users
  const existingUsers = await prisma.user.count();
  const existingDepts = await prisma.department.findMany();
  console.log(`[Safety Check] Existing Users in DB: ${existingUsers}`);
  console.log(`[Safety Check] Existing Departments in DB: ${existingDepts.length}`);

  if (existingUsers === 0 || existingDepts.length === 0) {
    console.error('FATAL: Expected existing users and departments in production, but none found. Aborting for safety.');
    process.exit(1);
  }

  const deptMap = new Map();
  existingDepts.forEach((d) => {
    deptMap.set(d.name, d.id);
  });

  // Map canonical department targets
  const ahmDeptId = deptMap.get('Ahmedabad City Police');
  const gndDeptId = deptMap.get('Gandhinagar District Police');
  const dgpDeptId = deptMap.get('Gujarat Police Headquarters - DGP Office');

  if (!ahmDeptId || !gndDeptId || !dgpDeptId) {
    console.error('FATAL: Could not resolve required department IDs:', { ahmDeptId, gndDeptId, dgpDeptId });
    process.exit(1);
  }

  console.log('[Department Mapping Confirmed]:');
  console.log(`  - Ahmedabad City Police:                ${ahmDeptId}`);
  console.log(`  - Gandhinagar District Police:          ${gndDeptId}`);
  console.log(`  - Gujarat Police Headquarters - DGP:    ${dgpDeptId}`);

  // STEP 2: Verify existing camera counts
  const currentCameraCount = await prisma.camera.count();
  const currentStreamCount = await prisma.cameraStream.count();
  console.log(`[Current State] Existing cameras: ${currentCameraCount}, Existing streams: ${currentStreamCount}`);

  // STEP 3: Connectors Provisioning (Idempotent upsert)
  console.log('\n[Provisioning Connectors]...');
  const connectorDefs = [
    { adapterType: 'RTSP', configRef: 'vault://connectors/rtsp-standard-h264' },
    { adapterType: 'ONVIF', configRef: 'vault://connectors/onvif-profiles-s' },
    { adapterType: 'MOCK_VENDOR', configRef: 'vault://connectors/vendor-a-hikvision-emulated' },
  ];

  const connectorMap = new Map();
  for (const cDef of connectorDefs) {
    let conn = await prisma.connector.findFirst({
      where: { adapterType: cDef.adapterType },
    });
    if (!conn) {
      conn = await prisma.connector.create({
        data: {
          adapterType: cDef.adapterType,
          configRef: cDef.configRef,
        },
      });
      console.log(`  + Created connector: ${conn.adapterType} (${conn.id})`);
    } else {
      console.log(`  = Found existing connector: ${conn.adapterType} (${conn.id})`);
    }
    connectorMap.set(cDef.adapterType, conn.id);
  }

  // STEP 4: Camera Topology Definitions (Approved Canonical 15-Camera Topology)
  // Status set to OFFLINE truthfully because production MediaMTX is not yet deployed.
  const initialStatus = OperationalStatus.OFFLINE;

  const camerasTopology = [
    // Ahmedabad Corridor Cameras
    {
      name: 'CAM-AHM-01: SG Highway - Pakwan Crossroad Junction',
      departmentId: ahmDeptId,
      lat: 23.0338142,
      long: 72.5073289,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
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
      departmentId: ahmDeptId,
      lat: 23.0354120,
      long: 72.5592810,
      protocol: CameraProtocol.ONVIF,
      connectorTypeId: connectorMap.get('ONVIF'),
      operationalStatus: initialStatus,
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
      departmentId: ahmDeptId,
      lat: 23.0415100,
      long: 72.5742100,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
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
      name: 'CAM-AHM-04: SG Highway - ISKCON Crossroad Flyover',
      departmentId: ahmDeptId,
      lat: 23.0287100,
      long: 72.5065400,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
      location: {
        address: 'ISKCON Cross Road, SG Highway, Satellite',
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
      name: 'CAM-DEMO-01: Expressway Highway Traffic Corridor (RESEARCH)',
      departmentId: ahmDeptId,
      lat: 23.1142000,
      long: 72.5856000,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
      location: {
        address: 'Ahmedabad - Gandhinagar Highway Bypass, Express Lane 2',
        zone: 'Corridor Zone',
        district: 'Ahmedabad',
      },
      stream: {
        codec: 'h264',
        resolution: '1280x720',
        fps: 30,
        urlOrHandle: 'rtsp://simulator:8554/live/demo-traffic',
      },
    },

    // Gandhinagar District Cameras
    {
      name: 'CAM-GND-01: Gandhinagar Secretariat - Gate 1',
      departmentId: gndDeptId,
      lat: 23.2167200,
      long: 72.6372100,
      protocol: CameraProtocol.MOCK_VENDOR,
      connectorTypeId: connectorMap.get('MOCK_VENDOR'),
      operationalStatus: initialStatus,
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
      departmentId: gndDeptId,
      lat: 23.1985400,
      long: 72.6288300,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
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

    // Surat Cameras (Statewide DGP Fleet)
    {
      name: 'CAM-SUR-01: Dumas Road - VR Mall Junction',
      departmentId: dgpDeptId,
      lat: 21.1492000,
      long: 72.7483000,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
      location: {
        address: 'VR Mall Junction, Dumas Road, Magdalla',
        zone: 'South Zone',
        district: 'Surat',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 25,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-sur-01',
      },
    },
    {
      name: 'CAM-SUR-02: Ring Road - Sahara Darwaja Textile Market',
      departmentId: dgpDeptId,
      lat: 21.1965000,
      long: 72.8421000,
      protocol: CameraProtocol.ONVIF,
      connectorTypeId: connectorMap.get('ONVIF'),
      operationalStatus: initialStatus,
      location: {
        address: 'Sahara Darwaja, Ring Road, Begampura',
        zone: 'East Zone',
        district: 'Surat',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 20,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-sur-02',
      },
    },
    {
      name: 'CAM-SUR-03: Adajan - Gujarat Gas Circle',
      departmentId: dgpDeptId,
      lat: 21.1912000,
      long: 72.7984000,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
      location: {
        address: 'Gujarat Gas Circle, Anand Mahal Road, Adajan',
        zone: 'West Zone',
        district: 'Surat',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 25,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-sur-03',
      },
    },

    // Vadodara Cameras (Statewide DGP Fleet)
    {
      name: 'CAM-VAD-01: Sayajigunj - Railway Station Circle',
      departmentId: dgpDeptId,
      lat: 22.3108000,
      long: 73.1812000,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
      location: {
        address: 'Station Road, Sayajigunj',
        zone: 'Central Zone',
        district: 'Vadodara',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 25,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-vad-01',
      },
    },
    {
      name: 'CAM-VAD-02: Alkapuri - RC Dutt Road Junction',
      departmentId: dgpDeptId,
      lat: 22.3142000,
      long: 73.1705000,
      protocol: CameraProtocol.ONVIF,
      connectorTypeId: connectorMap.get('ONVIF'),
      operationalStatus: initialStatus,
      location: {
        address: 'RC Dutt Road, Alkapuri',
        zone: 'West Zone',
        district: 'Vadodara',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 20,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-vad-02',
      },
    },
    {
      name: 'CAM-VAD-03: Fatehgunj - MSU Circle',
      departmentId: dgpDeptId,
      lat: 22.3245000,
      long: 73.1878000,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
      location: {
        address: 'MSU Pavilion Road, Fatehgunj',
        zone: 'North Zone',
        district: 'Vadodara',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 25,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-vad-03',
      },
    },

    // Rajkot Cameras (Statewide DGP Fleet)
    {
      name: 'CAM-RJK-01: 150 Feet Ring Road - Indira Circle',
      departmentId: dgpDeptId,
      lat: 22.2856000,
      long: 70.7684000,
      protocol: CameraProtocol.RTSP,
      connectorTypeId: connectorMap.get('RTSP'),
      operationalStatus: initialStatus,
      location: {
        address: 'Indira Circle, 150 Feet Ring Road',
        zone: 'West Zone',
        district: 'Rajkot',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 25,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-rjk-01',
      },
    },
    {
      name: 'CAM-RJK-02: Kalawad Road - KKV Hall Cross Road',
      departmentId: dgpDeptId,
      lat: 22.2798000,
      long: 70.7789000,
      protocol: CameraProtocol.ONVIF,
      connectorTypeId: connectorMap.get('ONVIF'),
      operationalStatus: initialStatus,
      location: {
        address: 'KKV Hall Cross Road, Kalawad Road',
        zone: 'South Zone',
        district: 'Rajkot',
      },
      stream: {
        codec: 'h264',
        resolution: '1920x1080',
        fps: 20,
        urlOrHandle: 'rtsp://simulator:8554/live/cam-rjk-02',
      },
    },
  ];

  console.log(`\n[Provisioning Cameras] (Count: ${camerasTopology.length})...`);

  let createdCount = 0;
  let skippedCount = 0;

  for (const c of camerasTopology) {
    const existing = await prisma.camera.findFirst({
      where: { name: c.name },
    });

    if (existing) {
      console.log(`  = Camera '${c.name}' already exists (${existing.id}), skipping.`);
      skippedCount++;
      continue;
    }

    let created = null;
    let attempts = 0;
    while (!created && attempts < 3) {
      attempts++;
      try {
        created = await prisma.camera.create({
          data: {
            name: c.name,
            departmentId: c.departmentId,
            lat: c.lat,
            long: c.long,
            protocol: c.protocol,
            connectorTypeId: c.connectorTypeId,
            operationalStatus: c.operationalStatus,
            isActive: true,
            location: {
              create: c.location,
            },
            streams: {
              create: c.stream,
            },
            health: {
              create: {
                lastHeartbeat: new Date(),
                fpsActual: 0.0,
                packetLoss: null,
                status: c.operationalStatus,
              },
            },
          },
        });
      } catch (createErr) {
        if (attempts >= 3) throw createErr;
        console.warn(`  ! Retrying ${c.name} (attempt ${attempts + 1}/3) after transient network error...`);
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    console.log(`  + Provisioned camera: ${created.name} (${created.id})`);
    createdCount++;
  }

  console.log(`\n[Provisioning Completed] Created: ${createdCount}, Skipped: ${skippedCount}`);

  // Post-verification counts
  const finalCounts = {
    cameras: await prisma.camera.count(),
    streams: await prisma.cameraStream.count(),
    connectors: await prisma.connector.count(),
    locations: await prisma.location.count(),
    health: await prisma.cameraHealth.count(),
    users: await prisma.user.count(),
    departments: await prisma.department.count(),
  };

  console.log('\n[Final Production Database State]:');
  console.log(JSON.stringify(finalCounts, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error during provisioning:', e);
  await prisma.$disconnect();
  process.exit(1);
});
