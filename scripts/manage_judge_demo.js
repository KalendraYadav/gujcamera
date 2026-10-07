#!/usr/bin/env node
// ==============================================================================
// NETRAVA — One-Command Judge Demonstration Orchestrator & Operator CLI
// Gujarat Police Innovation Challenge 2026
// Commands: start | status | stop | reset
// ==============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const { spawn, execSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const JUDGE_MANIFEST_PATH = path.resolve(WORKSPACE_ROOT, 'fixtures/manifests/judge_demo_manifest.json');
const STATE_FILE_PATH = path.resolve(__dirname, '.judge_demo_state.json');
const VAULT_SCRIPT_PATH = path.resolve(__dirname, 'local_evidence_vault.js');

const MEDIAMTX_API_URL = process.env.MEDIAMTX_API_URL || 'http://localhost:9997';
const MEDIAMTX_USER = process.env.MEDIAMTX_API_USER || 'mediamtx_admin';
const MEDIAMTX_PASS = process.env.MEDIAMTX_API_PASSWORD || 'mediamtx_dev_secret_2026';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5432', 10);
const S3_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);

function loadManifest() {
  if (!fs.existsSync(JUDGE_MANIFEST_PATH)) {
    console.error(`❌ Judge demonstration manifest not found: ${JUDGE_MANIFEST_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(JUDGE_MANIFEST_PATH, 'utf8'));
}

function loadState() {
  if (fs.existsSync(STATE_FILE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
    } catch (e) {
      return { processes: {} };
    }
  }
  return { processes: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function httpGet(url, options = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const reqOpts = {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method: 'GET',
        headers: options.headers || {},
        timeout: 3000,
      };

      const req = http.request(reqOpts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, raw: data });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'TIMEOUT' });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });

      req.end();
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

function checkTcpPort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function checkRedis(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.write('PING\r\n');
    });
    socket.on('data', (d) => {
      socket.destroy();
      resolve(d.toString().includes('PONG'));
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function detectFfmpeg() {
  // Check Windows PATH first
  try {
    execSync('where.exe ffmpeg', { stdio: 'ignore' });
    return { type: 'native', bin: 'ffmpeg' };
  } catch (e) {}

  // Check WSL ffmpeg
  try {
    const wslCheck = execSync('wsl -d Ubuntu-24.04 -- which ffmpeg', { encoding: 'utf8' }).trim();
    if (wslCheck && wslCheck.includes('ffmpeg')) {
      return { type: 'wsl', bin: 'wsl', argsPrefix: ['-d', 'Ubuntu-24.04', '--', 'ffmpeg'] };
    }
  } catch (e) {}

  return null;
}

// -----------------------------------------------------------------------------
// HEALTH GATE AUDIT
// -----------------------------------------------------------------------------
async function runHealthGate(options = { exitOnFail: false }) {
  const manifest = loadManifest();
  const checks = {};

  // 1. PostgreSQL
  checks.database = await checkTcpPort(PG_HOST, PG_PORT);

  // 2. Redis
  checks.redis = await checkRedis(REDIS_HOST, REDIS_PORT);

  // 3. S3 Evidence Vault
  let vaultHealth = await httpGet(`http://127.0.0.1:${S3_PORT}/minio/health/live`);
  if (!vaultHealth.ok) {
    vaultHealth = await httpGet(`http://localhost:${S3_PORT}/minio/health/live`);
  }
  checks.minio = vaultHealth.ok;

  // Auto-start local vault if not running and we are starting demo
  if (!checks.minio && options.autoStartVault) {
    console.log('⚡ Starting local S3 Evidence Vault on :9000...');
    const vaultProc = spawn('node', [VAULT_SCRIPT_PATH], {
      detached: true,
      stdio: 'ignore',
    });
    vaultProc.unref();
    // Wait briefly for port to bind
    await new Promise(r => setTimeout(r, 1000));
    let recheck = await httpGet(`http://127.0.0.1:${S3_PORT}/minio/health/live`);
    if (!recheck.ok) recheck = await httpGet(`http://localhost:${S3_PORT}/minio/health/live`);
    checks.minio = recheck.ok;
  }

  // 4. MediaMTX
  const authHeader = 'Basic ' + Buffer.from(`${MEDIAMTX_USER}:${MEDIAMTX_PASS}`).toString('base64');
  const mtxRes = await httpGet(`${MEDIAMTX_API_URL}/v3/paths/list`, {
    headers: { Authorization: authHeader },
  });
  checks.mediamtx = mtxRes.ok;
  const activePaths = new Set();
  if (mtxRes.ok && mtxRes.data && Array.isArray(mtxRes.data.items)) {
    for (const item of mtxRes.data.items) {
      if (item.name && item.ready) activePaths.add(item.name);
    }
  }

  // 5. Media Fixtures & SHA-256 Check
  let mediaValid = true;
  for (const node of manifest.primaryDemonstrationNodes) {
    const fullPath = path.resolve(WORKSPACE_ROOT, node.videoFixture);
    if (!fs.existsSync(fullPath)) {
      mediaValid = false;
      break;
    }
    const hash = computeFileSha256(fullPath);
    if (hash.toLowerCase() !== node.sha256.toLowerCase()) {
      mediaValid = false;
      break;
    }
  }
  checks.media = mediaValid;

  // 6. Backend API
  const backendCheck = await httpGet(`${BACKEND_URL}/api/v1/cameras/simulated-cctv/manifest`);
  checks.backend = backendCheck.ok || backendCheck.status === 401;

  // 7. FFmpeg availability
  const ffmpegInfo = detectFfmpeg();
  checks.ffmpeg = !!ffmpegInfo;

  // Print Health Gate Report
  console.log('==============================================================================');
  console.log('🛡️  NETRAVA JUDGE DEMO READINESS GATE');
  console.log('==============================================================================');
  console.log(`DATABASE (PG:5432)   ${checks.database ? '✅ READY' : '❌ OFFLINE'}`);
  console.log(`REDIS STREAMS (:6379) ${checks.redis ? '✅ READY' : '❌ OFFLINE'}`);
  console.log(`MINIO S3 VAULT (:9000)${checks.minio ? '✅ READY' : '❌ OFFLINE'}`);
  console.log(`MEDIAMTX GATEWAY     ${checks.mediamtx ? `✅ READY (${activePaths.size} paths active)` : '❌ OFFLINE'}`);
  console.log(`MEDIA ASSET INTEGRITY${checks.media ? '✅ READY (SHA-256 verified)' : '❌ INTEGRITY ERROR'}`);
  console.log(`STREAMING ENGINE     ${checks.ffmpeg ? `✅ READY (${ffmpegInfo.type})` : '⚠️  WSL/Native FFmpeg pending'}`);
  console.log(`BACKEND API (:4000)   ${checks.backend ? '✅ READY' : '⚪ STANDBY / OFFLINE'}`);

  console.log('------------------------------------------------------------------------------');
  for (const node of manifest.primaryDemonstrationNodes) {
    const isOnline = activePaths.has(node.rtspPath) || activePaths.has('live/' + node.rtspPath);
    console.log(`${node.cameraId.padEnd(14)}       ${isOnline ? '🟢 ONLINE' : '⚪ IDLE'} (${node.targetRtspUrl})`);
  }
  const isDemoOnline = activePaths.has('demo-traffic') || activePaths.has('live/demo-traffic');
  console.log(`${'CAM-DEMO-01'.padEnd(14)}       ${isDemoOnline ? '🟢 ONLINE' : '⚪ IDLE'} (rtsp://localhost:8554/demo-traffic)`);
  console.log('==============================================================================');

  const criticalPass = checks.database && checks.redis && checks.minio && checks.mediamtx && checks.media;
  if (criticalPass) {
    console.log('DEMO STATUS: READY FOR JUDGE PRESENTATION\n');
  } else {
    console.log('DEMO STATUS: BLOCKED — One or more core infrastructure dependencies unavailable.\n');
    if (options.exitOnFail) {
      process.exit(1);
    }
  }

  return { checks, criticalPass, ffmpegInfo, activePaths };
}

// -----------------------------------------------------------------------------
// START ACTION
// -----------------------------------------------------------------------------
async function startDemo() {
  console.log('🚀 Initiating NETRAVA Judge Demonstration Pipeline...\n');
  const gate = await runHealthGate({ exitOnFail: false, autoStartVault: true });

  if (!gate.criticalPass) {
    console.error('❌ Cannot start judge demonstration: Prerequisites check failed.');
    process.exit(1);
  }

  const manifest = loadManifest();
  const state = loadState();
  const ffmpeg = gate.ffmpegInfo;

  if (!ffmpeg) {
    console.log('');
    console.log('==============================================================================');
    console.log('⚠️  STREAM REPLAY ENGINE: FFmpeg NOT INSTALLED');
    console.log('==============================================================================');
    console.log('All critical infrastructure (Database, Redis, S3, MediaMTX, Backend) is READY.');
    console.log('RTSP stream replay requires FFmpeg. Install it with:');
    console.log('');
    console.log('  WSL (Ubuntu):  wsl -d Ubuntu-24.04 -- sudo apt-get install -y ffmpeg');
    console.log('  Windows:       https://ffmpeg.org/download.html  (add to system PATH)');
    console.log('');
    console.log('After installing FFmpeg, run:  node scripts/manage_judge_demo.js start');
    console.log('==============================================================================\n');
    process.exit(0);
  }

  console.log(`📹 Starting replay streams for target scenario: ${manifest.scenarioName}`);
  console.log(`🎯 Target Pursuit Vehicle: ${manifest.targetVehicle.plate} (${manifest.targetVehicle.color} ${manifest.targetVehicle.make} ${manifest.targetVehicle.model})\n`);

  if (ffmpeg.type === 'wsl') {
    const wslScriptPath = path.resolve(__dirname, 'start_streams_wsl.sh').replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
    execSync(`wsl -d Ubuntu-24.04 -- bash "${wslScriptPath}"`, { stdio: 'ignore' });
    for (const node of manifest.primaryDemonstrationNodes) {
      console.log(`▶️  Active corridor stream: ${node.cameraId} -> ${node.rtspPath}`);
      state.processes[node.cameraId] = {
        pid: 'wsl-daemon',
        rtspPath: node.rtspPath,
        startedAt: new Date().toISOString(),
      };
    }
    console.log(`▶️  Active corridor stream: CAM-DEMO-01 -> demo-traffic`);
    state.processes['CAM-DEMO-01'] = {
      pid: 'wsl-daemon',
      rtspPath: 'demo-traffic',
      startedAt: new Date().toISOString(),
    };
  } else {
    for (const node of manifest.primaryDemonstrationNodes) {
      const filePath = path.resolve(WORKSPACE_ROOT, node.videoFixture);
      const rtspUrl = node.targetRtspUrl;

      if (gate.activePaths.has(node.rtspPath)) {
        console.log(`ℹ️  [${node.cameraId}] Stream already published to ${rtspUrl}`);
        continue;
      }

      const spawnArgs = ['-re', '-stream_loop', '-1', '-i', filePath, '-c', 'copy', '-f', 'rtsp', '-rtsp_transport', 'tcp', rtspUrl];
      console.log(`▶️  Spawning stream for ${node.cameraId} -> ${node.rtspPath}`);
      const proc = spawn(ffmpeg.bin, spawnArgs, {
        stdio: 'ignore',
        detached: true,
      });
      proc.unref();

      state.processes[node.cameraId] = {
        pid: proc.pid,
        rtspPath: node.rtspPath,
        startedAt: new Date().toISOString(),
      };
    }
  }

  saveState(state);

  console.log('\n⏳ Waiting 3 seconds for MediaMTX publication...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n==============================================================================');
  console.log('🎉 JUDGE DEMONSTRATION RUNTIME ACTIVE');
  console.log('==============================================================================');
  console.log(`Scenario:       ${manifest.scenarioName}`);
  console.log(`Target Vehicle: ${manifest.targetVehicle.plate} (${manifest.targetVehicle.color} ${manifest.targetVehicle.make} ${manifest.targetVehicle.model})`);
  console.log(`Case Reference: ${manifest.targetVehicle.caseReference}`);
  console.log('------------------------------------------------------------------------------');
  console.log('OPERATIONAL DEMO URLS:');
  console.log('1. Live CCTV Grid:      http://localhost:3000/live');
  console.log('2. Vehicle Search:      http://localhost:3000/investigation  (Plate: GJ01AB1234)');
  console.log('3. GIS Corridor Map:    http://localhost:3000/gis');
  console.log('4. Hotlist Alerts:      http://localhost:3000/alerts');
  console.log('==============================================================================\n');
}

// -----------------------------------------------------------------------------
// STOP ACTION
// -----------------------------------------------------------------------------
async function stopDemo() {
  console.log('🛑 Stopping NETRAVA Judge Demonstration Streams...\n');
  const state = loadState();
  let stoppedCount = 0;

  for (const [camId, procInfo] of Object.entries(state.processes)) {
    if (procInfo && procInfo.pid) {
      try {
        process.kill(procInfo.pid);
        console.log(`Stopped stream process for [${camId}] (PID: ${procInfo.pid})`);
        stoppedCount++;
      } catch (e) {
        // Process might already be dead
      }
    }
  }

  // Also kill any lingering ffmpeg replay loops in WSL if applicable
  try {
    execSync('wsl -d Ubuntu-24.04 -- pkill -f "ffmpeg.*rtsp" || true', { stdio: 'ignore' });
  } catch (e) {}

  state.processes = {};
  saveState(state);

  console.log(`\n✅ Stopped ${stoppedCount} demonstration stream(s). All MediaMTX inputs idle.\n`);
}

// -----------------------------------------------------------------------------
// RESET ACTION (Safe demonstration purge)
// -----------------------------------------------------------------------------
async function resetDemo() {
  console.log('==============================================================================');
  console.log('🧹 NETRAVA — Resettable Demonstration State Purge');
  console.log('==============================================================================');
  console.log('Safety Guarantee:');
  console.log('- User accounts and roles: PRESERVED');
  console.log('- Database schema and migrations: PRESERVED');
  console.log('- Camera registry & department hierarchy: PRESERVED');
  console.log('- Watchlist configurations: PRESERVED');
  console.log('- PURGES ONLY: Target demo sightings & alerts for vehicle \'GJ01AB1234\'');
  console.log('------------------------------------------------------------------------------\n');

  try {
    const prismaModulePath = path.resolve(WORKSPACE_ROOT, 'backend/node_modules/@prisma/client');
    const { PrismaClient } = require(prismaModulePath);
    const prisma = new PrismaClient();

    // 0. Find sightings to get IDs
    const demoSightings = await prisma.vehicleSighting.findMany({
      where: { plateNormalized: { contains: 'GJ01AB1234' } },
      select: { id: true },
    });
    const sightingIds = demoSightings.map(s => s.id);

    // 1. Delete evidence linked to demo sightings
    if (sightingIds.length > 0) {
      const delEvidence = await prisma.evidence.deleteMany({
        where: { sourceId: { in: sightingIds } },
      });
      console.log(`✅ Deleted ${delEvidence.count} linked evidence record(s)`);
    }

    // 2. Delete sightings for demo target vehicle (alerts cascade automatically)
    const delSightings = await prisma.vehicleSighting.deleteMany({
      where: { id: { in: sightingIds } },
    });
    console.log(`✅ Deleted ${delSightings.count} demo vehicle sighting(s) (and cascaded alerts) for 'GJ01AB1234'`);

    await prisma.$disconnect();
  } catch (err) {
    console.warn(`⚠️  Database reset warning (Prisma): ${err.message}`);
  }

  // 3. Purge temporary evidence vault files for demo camera paths
  const vaultDir = path.resolve(WORKSPACE_ROOT, 'fixtures/evidence-vault/police-evidence-vault');
  if (fs.existsSync(vaultDir)) {
    try {
      const files = fs.readdirSync(vaultDir);
      for (const file of files) {
        if (file.includes('CAM-AHM') || file.includes('CAM-GND')) {
          fs.unlinkSync(path.join(vaultDir, file));
        }
      }
      console.log('✅ Purged demo temporary files from S3 Evidence Vault');
    } catch (e) {}
  }

  console.log('\n🎉 DEMONSTRATION RESET COMPLETE: Ready for fresh judge rehearsal.\n');
}

// -----------------------------------------------------------------------------
// STATUS ACTION
// -----------------------------------------------------------------------------
async function statusDemo() {
  await runHealthGate({ exitOnFail: false });
}

// -----------------------------------------------------------------------------
// CLI DISPATCHER
// -----------------------------------------------------------------------------
async function main() {
  const command = process.argv[2] || 'status';

  switch (command.toLowerCase()) {
    case 'start':
      await startDemo();
      break;
    case 'stop':
      await stopDemo();
      break;
    case 'reset':
      await resetDemo();
      break;
    case 'status':
    default:
      await statusDemo();
      break;
  }
}

main().catch((err) => {
  console.error('Fatal CLI execution error:', err);
  process.exit(1);
});
