#!/usr/bin/env node
// ==============================================================================
// NETRAVAHA — Simulated CCTV Operator Control CLI
// Gujarat Police Innovation Challenge 2026
// Operator CLI for Demonstrations, Validation & Stream Lifecycle Control
// ==============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.resolve(WORKSPACE_ROOT, 'fixtures/manifests/demonstration_manifest.json');
const MEDIAMTX_API_URL = process.env.MEDIAMTX_API_URL || 'http://localhost:9997';
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:3000';

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ Manifest file not found: ${MANIFEST_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    }).on('error', (err) => reject(err));
  });
}

async function validateManifest() {
  console.log('==============================================================================');
  console.log('🔍 NETRAVAHA — Demonstration Manifest & Media Integrity Audit');
  console.log(`Manifest: ${MANIFEST_PATH}`);
  console.log('==============================================================================\n');

  const manifest = loadManifest();
  console.log(`Title:       ${manifest.title}`);
  console.log(`Version:     ${manifest.manifestVersion}`);
  console.log(`Total Nodes: ${manifest.cameras.length}\n`);

  let allValid = true;
  let unverifiedCount = 0;

  for (const cam of manifest.cameras) {
    const fullPath = path.resolve(WORKSPACE_ROOT, cam.videoPath);
    const exists = fs.existsSync(fullPath);
    let hashMatch = false;
    let computedHash = 'N/A';

    if (exists) {
      computedHash = computeFileSha256(fullPath);
      hashMatch = computedHash.toLowerCase() === cam.sha256.toLowerCase();
    }

    const isLicenseUnverified = cam.licenseStatus === 'LICENSE_VERIFICATION_REQUIRED';
    if (isLicenseUnverified) unverifiedCount++;

    const statusIcon = exists && hashMatch ? '✅' : '❌';
    console.log(`${statusIcon} [${cam.cameraId}] ${cam.displayName}`);
    console.log(`   Location:     ${cam.location} (${cam.jurisdiction})`);
    console.log(`   Source Type:  ${cam.sourceType} | Provenance: ${cam.provenance}`);
    console.log(`   License:      ${cam.licenseStatus} ${isLicenseUnverified ? '⚠️ (Dev fixture only)' : ''}`);
    console.log(`   File Exists:  ${exists ? 'YES' : 'NO'} (${cam.videoPath})`);
    console.log(`   SHA-256 Match: ${hashMatch ? 'VERIFIED' : 'MISMATCH'}`);
    if (!hashMatch && exists) {
      console.log(`   Expected:     ${cam.sha256}`);
      console.log(`   Computed:     ${computedHash}`);
      allValid = false;
    }
    if (!exists) allValid = false;
    console.log('');
  }

  console.log('==============================================================================');
  if (allValid) {
    console.log('🎉 MANIFEST AUDIT PASS: All video assets exist and match SHA-256 digests.');
  } else {
    console.log('❌ MANIFEST AUDIT FAIL: One or more assets missing or corrupt.');
  }
  if (unverifiedCount > 0) {
    console.log(`⚠️  NOTE: ${unverifiedCount} source(s) marked LICENSE_VERIFICATION_REQUIRED (Honest provenance preserved).`);
  }
  console.log('==============================================================================\n');
}

async function checkStatus() {
  console.log('==============================================================================');
  console.log('📡 NETRAVAHA — Simulated CCTV Streaming & MediaMTX Path Health');
  console.log('==============================================================================\n');

  const manifest = loadManifest();
  let mediaMtxPaths = new Map();

  try {
    const res = await httpGetJson(`${MEDIAMTX_API_URL}/v3/paths/list`);
    if (res.status === 200 && res.data && Array.isArray(res.data.items)) {
      for (const item of res.data.items) {
        if (item.name) mediaMtxPaths.set(item.name, item);
      }
      console.log(`✅ MediaMTX is ONLINE (${mediaMtxPaths.size} total active paths on :9997)\n`);
    } else {
      console.log(`⚠️  MediaMTX returned status HTTP ${res.status}\n`);
    }
  } catch (err) {
    console.log(`⚠️  MediaMTX API not reachable at ${MEDIAMTX_API_URL} (${err.message})\n`);
  }

  console.log('CAMERA ID   | RTSP STREAM PATH | PROVENANCE      | LICENSE STATUS    | MEDIAMTX READY');
  console.log('------------|------------------|-----------------|-------------------|---------------');

  for (const cam of manifest.cameras) {
    const mtxState = mediaMtxPaths.get(cam.rtspPath);
    const ready = mtxState ? (mtxState.ready ? '✅ READY' : '⏳ CONNECTING') : '⚪ IDLE / WAIT';
    const camId = cam.cameraId.padEnd(11);
    const rtspPath = cam.rtspPath.padEnd(16);
    const prov = cam.provenance.slice(0, 15).padEnd(15);
    const lic = cam.licenseStatus.slice(0, 17).padEnd(17);

    console.log(`${camId} | ${rtspPath} | ${prov} | ${lic} | ${ready}`);
  }

  console.log('\n==============================================================================');
  console.log('Streaming protocol: rtsp://localhost:8554/<rtspPath>');
  console.log('Browser HLS view:   http://localhost:8888/<rtspPath>/index.m3u8');
  console.log('==============================================================================\n');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '--status';

  switch (command) {
    case '--validate':
      await validateManifest();
      break;
    case '--status':
    default:
      await checkStatus();
      break;
  }
}

main().catch((e) => {
  console.error('Fatal CLI error:', e);
  process.exit(1);
});
