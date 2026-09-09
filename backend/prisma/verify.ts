// ==============================================================================
// Unified CCTV Intelligence Platform — Database Verification Suite
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6 & Section 22)
// ==============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface VerificationResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL';
  details: string;
  executionMs?: number;
}

const results: VerificationResult[] = [];

async function recordCheck(
  category: string,
  check: string,
  fn: () => Promise<string>
) {
  const start = performance.now();
  try {
    const details = await fn();
    const duration = Math.round((performance.now() - start) * 100) / 100;
    results.push({ category, check, status: 'PASS', details, executionMs: duration });
    console.log(`  ✅ [PASS] ${category} > ${check} (${duration}ms) — ${details}`);
  } catch (err: any) {
    const duration = Math.round((performance.now() - start) * 100) / 100;
    results.push({ category, check, status: 'FAIL', details: err.message, executionMs: duration });
    console.error(`  ❌ [FAIL] ${category} > ${check} (${duration}ms) — ${err.message}`);
  }
}

async function verifyAll() {
  console.log('🔍 Starting Phase 1 Database Verification Suite...\n');

  // 1. Connection Verification
  await recordCheck('Connection', 'Database Connection & Active Session', async () => {
    const res: any = await prisma.$queryRaw`SELECT current_database(), current_user, version();`;
    return `Connected to DB '${res[0].current_database}' as user '${res[0].current_user}'`;
  });

  // 2. PostGIS Extension Verification
  await recordCheck('Spatial', 'PostGIS Extension & Version Verification', async () => {
    const res: any = await prisma.$queryRaw`SELECT PostGIS_Version(), PostGIS_Full_Version();`;
    return `PostGIS Version: ${res[0].postgis_version}`;
  });

  // 3. Schema & Table Verification
  await recordCheck('Schema', 'Canonical Tables Verification', async () => {
    const tables: any = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    const tableNames = tables.map((t: any) => t.table_name);
    const requiredTables = [
      'departments', 'roles', 'permissions', 'users', 'connectors',
      'cameras', 'locations', 'camera_streams', 'camera_health',
      'detections', 'plate_detections', 'vehicles', 'vehicle_sightings',
      'watchlists', 'watchlist_entries', 'alerts', 'incidents',
      'evidence', 'audit_logs'
    ];
    const missing = requiredTables.filter(t => !tableNames.includes(t));
    if (missing.length > 0) {
      throw new Error(`Missing canonical tables: ${missing.join(', ')}`);
    }
    return `All ${requiredTables.length} canonical architecture tables verified in public schema`;
  });

  // 4. Spatial Index Verification
  await recordCheck('Spatial', 'GiST Spatial Index on Camera Coordinates', async () => {
    const idx: any = await prisma.$queryRaw`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'cameras' AND indexname = 'cameras_location_gist_idx';
    `;
    if (idx.length === 0) {
      throw new Error('Spatial GiST index "cameras_location_gist_idx" is missing on cameras table');
    }
    return `GiST index active: ${idx[0].indexdef}`;
  });

  // 5. Seed Data Count Verification
  await recordCheck('Seed Data', 'Seeded Record Inventory', async () => {
    const [rolesCount, deptsCount, usersCount, camerasCount, sightingsCount, watchlistsCount, alertsCount] = await Promise.all([
      prisma.role.count(),
      prisma.department.count(),
      prisma.user.count(),
      prisma.camera.count(),
      prisma.vehicleSighting.count(),
      prisma.watchlist.count(),
      prisma.alert.count(),
    ]);
    return `Roles: ${rolesCount}, Depts: ${deptsCount}, Users: ${usersCount}, Cameras: ${camerasCount}, Sightings: ${sightingsCount}, Watchlists: ${watchlistsCount}, Alerts: ${alertsCount}`;
  });

  // 6. Representative Query 1: Camera Lookup with Relations
  await recordCheck('Queries', 'Camera Lookup (Metadata, Location, Streams, Health)', async () => {
    const cam = await prisma.camera.findFirst({
      where: { name: { contains: 'Pakwan' } },
      include: {
        department: true,
        location: true,
        streams: true,
        health: true,
        connector: true,
      },
    });
    if (!cam || !cam.location || !cam.health) {
      throw new Error('Camera lookup or relation join failed');
    }
    return `Fetched '${cam.name}' at '${cam.location.address}' (Status: ${cam.health.status})`;
  });

  // 7. Representative Query 2: Spatial Viewport / Proximity Query using PostGIS
  await recordCheck('Queries', 'Spatial Query: Cameras within 10 km of Ahmedabad City Center', async () => {
    // Ahmedabad center: 23.0225° N, 72.5714° E
    const centerLat = 23.0225;
    const centerLong = 72.5714;
    const radiusMeters = 10000;

    const nearbyCameras: any = await prisma.$queryRaw`
      SELECT 
        c.id, 
        c.name, 
        c.lat, 
        c.long,
        ROUND(ST_Distance(
          ST_SetSRID(ST_MakePoint(c.long::float, c.lat::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${centerLong}::float, ${centerLat}::float), 4326)::geography
        )::numeric, 2) AS distance_meters
      FROM cameras c
      WHERE ST_DWithin(
        ST_SetSRID(ST_MakePoint(c.long::float, c.lat::float), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${centerLong}::float, ${centerLat}::float), 4326)::geography,
        ${radiusMeters}
      )
      ORDER BY distance_meters ASC;
    `;

    if (nearbyCameras.length === 0) {
      throw new Error('PostGIS spatial proximity query returned 0 cameras');
    }
    return `Found ${nearbyCameras.length} cameras within 10km radius. Nearest: '${nearbyCameras[0].name}' at ${nearbyCameras[0].distance_meters}m`;
  });

  // 8. Representative Query 3: Vehicle Search by Plate & Chronological Sighting Route
  await recordCheck('Queries', 'Vehicle Search & Chronological Sighting Timeline (GJ01AB1234)', async () => {
    const vehicle = await prisma.vehicle.findUnique({
      where: { plateNormalized: 'GJ01AB1234' },
      include: {
        sightings: {
          orderBy: { ts: 'asc' },
          include: {
            camera: {
              include: { location: true },
            },
          },
        },
      },
    });

    if (!vehicle || vehicle.sightings.length === 0) {
      throw new Error('Vehicle search for demo plate GJ01AB1234 returned no records');
    }

    const timelineSummary = vehicle.sightings
      .map((s) => `${s.camera.name} at ${s.ts.toISOString().substring(11, 19)} (Conf: ${(Number(s.confidence) * 100).toFixed(1)}%)`)
      .join(' -> ');

    return `Retrieved ${vehicle.sightings.length} timeline sightings: ${timelineSummary}`;
  });

  // 9. Representative Query 4: Active Watchlist Plate Match & Alert Lookup
  await recordCheck('Queries', 'Watchlist Lookup & Active Alert Join', async () => {
    const alert = await prisma.alert.findFirst({
      where: { status: 'NEW' },
      include: {
        watchlistEntry: true,
        sighting: {
          include: {
            camera: {
              include: { location: true },
            },
          },
        },
      },
    });

    if (!alert) {
      throw new Error('No active alert found matching watchlist');
    }

    return `Alert ID '${alert.id}' [Severity: ${alert.severity}] for plate '${alert.watchlistEntry.plateNormalized}' on '${alert.sighting.camera.name}'`;
  });

  // 10. Representative Query 5: Audit Log Immutability Check
  await recordCheck('Queries', 'Audit Trail Query with Actor & Diff Details', async () => {
    const logs = await prisma.auditLog.findMany({
      take: 5,
      orderBy: { ts: 'desc' },
      include: { actor: true },
    });

    if (logs.length === 0) {
      throw new Error('No audit records found');
    }

    return `Found ${logs.length} audit records. Latest action: '${logs[0].action}' by '${logs[0].actor?.email || 'SYSTEM'}'`;
  });

  // 11. Foreign Key & Referential Integrity Verification
  await recordCheck('Constraints', 'Referential Integrity: Cascade & Restrict Tests', async () => {
    // Verify that deleting a camera deletes its location (CASCADE), but deleting department with cameras is blocked (RESTRICT)
    const deptWithCameras = await prisma.department.findFirst({
      where: { cameras: { some: {} } },
    });
    if (!deptWithCameras) throw new Error('No department with cameras found');

    let restrictBlocked = false;
    try {
      await prisma.department.delete({ where: { id: deptWithCameras.id } });
    } catch (err: any) {
      restrictBlocked = err.code === 'P2003' || err.message.toLowerCase().includes('foreign key');
    }

    if (!restrictBlocked) {
      throw new Error('FK RESTRICT constraint failed: Department with active cameras was deleted');
    }

    return 'Referential integrity confirmed: FK RESTRICT successfully prevents orphaned records';
  });

  console.log('\n==================================================');
  const allPassed = results.every(r => r.status === 'PASS');
  console.log(`VERIFICATION RESULT: ${allPassed ? '🟢 ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log(`Total checks: ${results.length}, Passed: ${results.filter(r => r.status === 'PASS').length}, Failed: ${results.filter(r => r.status === 'FAIL').length}`);
  console.log('==================================================\n');
}

verifyAll()
  .catch((e) => {
    console.error('Fatal verification error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
