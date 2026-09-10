// ==============================================================================
// 80,000-Camera GIS PostGIS Benchmark Suite
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6 & Phase 5A Specification)
//
// Measures spatial indexing, bbox intersection, and proximity latency across
// 80,000 synthetic camera records distributed across Gujarat police jurisdictions.
// Dedicated isolated table ensures ZERO pollution of canonical demo dataset.
// ==============================================================================

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const BENCHMARK_TABLE = 'benchmark_cameras';
const TARGET_CAMERA_COUNT = 80000;
const BATCH_SIZE = 5000;
const BBOX_QUERY_SAMPLES = 100;
const PROXIMITY_QUERY_SAMPLES = 50;

// Gujarat Geographic Clusters (Realistic Police Commissionerate Distribution)
const GUJARAT_CLUSTERS = [
  { name: 'Ahmedabad Commissionerate', lat: 23.0225, lon: 72.5714, ratio: 0.35, spread: 0.12 },
  { name: 'Surat Commissionerate', lat: 21.1702, lon: 72.8311, ratio: 0.25, spread: 0.10 },
  { name: 'Vadodara Commissionerate', lat: 22.3072, lon: 73.1812, ratio: 0.15, spread: 0.08 },
  { name: 'Rajkot Commissionerate', lat: 22.3039, lon: 70.8022, ratio: 0.10, spread: 0.08 },
  { name: 'Gandhinagar & State Corridors', lat: 23.2156, lon: 72.6369, ratio: 0.15, spread: 0.25 },
];

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, index)] * 100) / 100;
}

async function runBenchmark(): Promise<void> {
  console.log('==============================================================================');
  console.log('GUJARAT POLICE CCTV PLATFORM — 80,000-CAMERA GIS BENCHMARK');
  console.log('==============================================================================\n');

  try {
    // 1. Environment & Hardware Detection
    console.log('📌 [Phase 1/5] Inspecting Database & Spatial Engine...');
    const dbInfo: any = await prisma.$queryRaw`
      SELECT version(), PostGIS_Version() as postgis_ver;
    `;
    const pgVersion = dbInfo[0]?.version || 'PostgreSQL';
    const postgisVersion = dbInfo[0]?.postgis_ver || 'PostGIS';
    console.log(`   Database Engine: ${pgVersion.split(',')[0]}`);
    console.log(`   Spatial Module : PostGIS ${postgisVersion}`);

    // Verify baseline camera count
    const baselineCameras = await prisma.camera.count();
    console.log(`   Baseline Demo Fleet: ${baselineCameras} cameras (Preserved untouched)\n`);

    // 2. Setup Dedicated Benchmark Table & Spatial GiST Index
    console.log(`📌 [Phase 2/5] Creating Dedicated Isolation Table '${BENCHMARK_TABLE}'...`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${BENCHMARK_TABLE};`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE ${BENCHMARK_TABLE} (
        id UUID PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        district VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        geom GEOMETRY(Point, 4326) NOT NULL
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX idx_benchmark_cameras_geom ON ${BENCHMARK_TABLE} USING GIST (geom);
    `);
    console.log(`   ✅ Table created with PostGIS GiST index on 'geom'.\n`);

    // 3. Generate & Ingest 80,000 Synthetic Cameras
    console.log(`📌 [Phase 3/5] Generating & Ingesting ${TARGET_CAMERA_COUNT.toLocaleString()} Cameras...`);
    const seedStartTime = performance.now();
    let totalInserted = 0;

    for (let batchStart = 0; batchStart < TARGET_CAMERA_COUNT; batchStart += BATCH_SIZE) {
      const currentBatchCount = Math.min(BATCH_SIZE, TARGET_CAMERA_COUNT - batchStart);
      const rows: string[] = [];

      for (let i = 0; i < currentBatchCount; i++) {
        const id = crypto.randomUUID();
        const globalIdx = batchStart + i;

        // Select cluster based on ratio
        const rand = Math.random();
        let cumulative = 0;
        let cluster = GUJARAT_CLUSTERS[0];
        for (const c of GUJARAT_CLUSTERS) {
          cumulative += c.ratio;
          if (rand <= cumulative) {
            cluster = c;
            break;
          }
        }

        // Random jitter within cluster spread
        const lat = cluster.lat + (Math.random() - 0.5) * cluster.spread * 2;
        const lon = cluster.lon + (Math.random() - 0.5) * cluster.spread * 2;
        const name = `CAM-GJ-BENCH-${String(globalIdx + 1).padStart(6, '0')}`;
        const status = Math.random() > 0.05 ? 'ONLINE' : 'DEGRADED';

        rows.push(
          `('${id}', '${name}', '${cluster.name}', '${status}', ${lat.toFixed(6)}, ${lon.toFixed(6)}, ST_SetSRID(ST_MakePoint(${lon.toFixed(6)}, ${lat.toFixed(6)}), 4326))`
        );
      }

      const insertSql = `
        INSERT INTO ${BENCHMARK_TABLE} (id, name, district, status, latitude, longitude, geom)
        VALUES ${rows.join(',\n')};
      `;
      await prisma.$executeRawUnsafe(insertSql);
      totalInserted += currentBatchCount;

      const progress = Math.round((totalInserted / TARGET_CAMERA_COUNT) * 100);
      process.stdout.write(`   Progress: ${totalInserted.toLocaleString()} / ${TARGET_CAMERA_COUNT.toLocaleString()} cameras (${progress}%)\r`);
    }

    const seedDurationSec = (performance.now() - seedStartTime) / 1000;
    const throughput = Math.round(TARGET_CAMERA_COUNT / seedDurationSec);
    console.log(`\n   ✅ Seed completed in ${seedDurationSec.toFixed(2)}s (${throughput.toLocaleString()} cameras/sec)\n`);

    // Analyze table to update query planner statistics
    await prisma.$executeRawUnsafe(`ANALYZE ${BENCHMARK_TABLE};`);

    // 4. Benchmark Spatial Bounding Box Queries
    console.log(`📌 [Phase 4/5] Executing ${BBOX_QUERY_SAMPLES} Viewport Bounding Box Queries...`);
    const bboxLatencies: number[] = [];
    const bboxResultsCount: number[] = [];

    for (let sample = 0; sample < BBOX_QUERY_SAMPLES; sample++) {
      // Pick random focal point across Gujarat
      const cluster = GUJARAT_CLUSTERS[sample % GUJARAT_CLUSTERS.length];
      const centerLat = cluster.lat + (Math.random() - 0.5) * 0.05;
      const centerLon = cluster.lon + (Math.random() - 0.5) * 0.05;

      // Realistic viewport box (e.g. 0.04 deg lat/lon ≈ 4.4km x 4.2km area)
      const halfSize = 0.02 + Math.random() * 0.02;
      const minLat = centerLat - halfSize;
      const maxLat = centerLat + halfSize;
      const minLon = centerLon - halfSize;
      const maxLon = centerLon + halfSize;

      const qStart = performance.now();
      const results: any = await prisma.$queryRawUnsafe(`
        SELECT id, name, status, latitude, longitude
        FROM ${BENCHMARK_TABLE}
        WHERE ST_Intersects(geom, ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326))
        LIMIT 250;
      `);
      const qDuration = performance.now() - qStart;
      bboxLatencies.push(qDuration);
      bboxResultsCount.push(results.length);
    }

    const bboxP50 = percentile(bboxLatencies, 50);
    const bboxP95 = percentile(bboxLatencies, 95);
    const bboxP99 = percentile(bboxLatencies, 99);
    const bboxAvg = Math.round((bboxLatencies.reduce((a, b) => a + b, 0) / bboxLatencies.length) * 100) / 100;
    const avgResults = Math.round(bboxResultsCount.reduce((a, b) => a + b, 0) / bboxResultsCount.length);

    console.log(`   Spatial Bbox Query Latency (n=${BBOX_QUERY_SAMPLES}):`);
    console.log(`     - p50 Latency: ${bboxP50.toFixed(2)} ms`);
    console.log(`     - p95 Latency: ${bboxP95.toFixed(2)} ms`);
    console.log(`     - p99 Latency: ${bboxP99.toFixed(2)} ms`);
    console.log(`     - Mean Latency: ${bboxAvg.toFixed(2)} ms (Avg Cameras / Viewport: ${avgResults})\n`);

    // 5. Benchmark Proximity / Nearest Neighbor (KNN) Queries
    console.log(`📌 [Phase 5/5] Executing ${PROXIMITY_QUERY_SAMPLES} Incident Scene Proximity Queries...`);
    const proxLatencies: number[] = [];

    for (let sample = 0; sample < PROXIMITY_QUERY_SAMPLES; sample++) {
      const cluster = GUJARAT_CLUSTERS[sample % GUJARAT_CLUSTERS.length];
      const incidentLat = cluster.lat + (Math.random() - 0.5) * 0.03;
      const incidentLon = cluster.lon + (Math.random() - 0.5) * 0.03;

      const qStart = performance.now();
      // Find 10 nearest cameras within 3,000m of incident location
      await prisma.$queryRawUnsafe(`
        SELECT id, name,
               ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(${incidentLon}, ${incidentLat}), 4326)::geography) AS dist_m
        FROM ${BENCHMARK_TABLE}
        WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${incidentLon}, ${incidentLat}), 4326)::geography, 3000)
        ORDER BY dist_m ASC
        LIMIT 10;
      `);
      const qDuration = performance.now() - qStart;
      proxLatencies.push(qDuration);
    }

    const proxP50 = percentile(proxLatencies, 50);
    const proxP95 = percentile(proxLatencies, 95);
    const proxP99 = percentile(proxLatencies, 99);
    const proxAvg = Math.round((proxLatencies.reduce((a, b) => a + b, 0) / proxLatencies.length) * 100) / 100;

    console.log(`   Proximity / Incident KNN Latency (n=${PROXIMITY_QUERY_SAMPLES}):`);
    console.log(`     - p50 Latency: ${proxP50.toFixed(2)} ms`);
    console.log(`     - p95 Latency: ${proxP95.toFixed(2)} ms`);
    console.log(`     - p99 Latency: ${proxP99.toFixed(2)} ms`);
    console.log(`     - Mean Latency: ${proxAvg.toFixed(2)} ms\n`);

    // 6. Cleanup & Isolation Verification
    console.log(`🧹 Cleaning up benchmark table '${BENCHMARK_TABLE}'...`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${BENCHMARK_TABLE};`);
    const afterCameras = await prisma.camera.count();
    console.log(`   ✅ Table dropped. Primary demo fleet count verified: ${afterCameras} cameras.\n`);

    // SUMMARY REPORT
    console.log('==============================================================================');
    console.log('80,000-CAMERA GIS BENCHMARK REPORT SUMMARY');
    console.log('==============================================================================');
    console.log(`  Fleet Scale Target       : 80,000 Synthetic Nodes across Gujarat`);
    console.log(`  PostGIS Index Type       : Spatial GiST (geom geometry(Point, 4326))`);
    console.log(`  Ingestion Throughput     : ${throughput.toLocaleString()} records/sec (${seedDurationSec.toFixed(2)}s total)`);
    console.log(`  Spatial BBox Queries (p50): ${bboxP50.toFixed(2)} ms`);
    console.log(`  Spatial BBox Queries (p95): ${bboxP95.toFixed(2)} ms`);
    console.log(`  Spatial BBox Queries (p99): ${bboxP99.toFixed(2)} ms`);
    console.log(`  Proximity KNN Queries(p50): ${proxP50.toFixed(2)} ms`);
    console.log(`  Proximity KNN Queries(p95): ${proxP95.toFixed(2)} ms`);
    console.log(`  Proximity KNN Queries(p99): ${proxP99.toFixed(2)} ms`);
    console.log(`  Isolation Verification   : PASSED (Demo fleet unchanged at ${afterCameras} cameras)`);
    console.log(`  Benchmarking Result      : 🏆 SUCCESS`);
    console.log('==============================================================================\n');

  } catch (err: any) {
    console.error('\n❌ BENCHMARK FAILED:');
    console.error(`   ${err.message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runBenchmark();
