// ==============================================================================
// Phase 4E Live End-to-End Verification Script
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.1, 8.2)
// ==============================================================================

import WebSocket from 'ws';
import { PrismaClient, AlertSeverity, AlertStatus } from '@prisma/client';

const API_BASE = 'http://localhost:4000/api/v1';
const WS_URL = 'ws://localhost:4000/ws/alerts';
const prisma = new PrismaClient();

async function main() {
  console.log('=== [PHASE 4E] Starting Live End-to-End Verification ===\n');

  // 1. Authenticate Operator
  console.log('1. Authenticating as Operator via REST (POST /auth/login)...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'operator.demo@gujcamera.local',
      password: 'PoliceDemo@2026!',
    }),
  });
  if (!loginRes.ok) {
    throw new Error(`Operator login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const loginData: any = await loginRes.json();
  const operatorToken = loginData.access_token;
  console.log('   ✓ Operator authenticated successfully. Role:', loginData.user.role);

  // 2. Test Rejection of Invalid Token on WebSocket Gateway
  console.log('2. Testing security: Unauthorized connection rejection...');
  await new Promise<void>((resolve, reject) => {
    const badWs = new WebSocket(WS_URL);
    badWs.on('open', () => {
      badWs.send(JSON.stringify({ type: 'auth', token: 'invalid.tampered.token' }));
    });
    badWs.on('close', (code) => {
      if (code === 4401) {
        console.log('   ✓ WebSocket rejected invalid JWT with close code 4401 (Unauthorized)');
        resolve();
      } else {
        reject(new Error(`Expected close code 4401, got: ${code}`));
      }
    });
  });

  // 3. Establish Authorized Native WebSocket Connection
  console.log('3. Connecting authorized WebSocket client at:', WS_URL);
  const ws = new WebSocket(WS_URL);
  let alertCreatedReceived: any = null;
  let alertUpdatedReceived: any = null;
  const testPlate = 'GJ01P4E8888';

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 8000);

    ws.on('open', () => {
      console.log('   ✓ WebSocket TCP socket open. Sending in-band auth handshake...');
      ws.send(JSON.stringify({ type: 'auth', token: operatorToken }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'connection_ack') {
        console.log('   ✓ Received connection_ack from gateway:', msg.data);
        clearTimeout(timeout);
        resolve();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Setup broadcast listeners
  const alertCreatedPromise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for alert.created broadcast')), 15000);

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'alert.created') {
        console.log('   ✓ Real-Time WebSocket Received [alert.created]:');
        console.log('     Alert ID:', msg.data.id);
        console.log('     Severity:', msg.data.severity);
        console.log('     Plate:', msg.data.plate_normalized);
        console.log('     Watchlist:', msg.data.watchlist_name);
        console.log('     Camera:', msg.data.camera_name);

        // Security check: ensure no binary video/jpeg in payload
        const serialized = JSON.stringify(msg);
        if (serialized.includes('data:image') || serialized.includes('base64')) {
          reject(new Error('Security violation: binary image detected in WebSocket payload!'));
          return;
        }

        alertCreatedReceived = msg.data;
        clearTimeout(timeout);
        resolve(msg.data);
      }
    });
  });

  const alertUpdatedPromise = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for alert.updated broadcast')), 15000);

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'alert.updated') {
        console.log('   ✓ Real-Time WebSocket Received [alert.updated]:');
        console.log('     Alert ID:', msg.data.id);
        console.log('     Updated Status:', msg.data.status);
        alertUpdatedReceived = msg.data;
        clearTimeout(timeout);
        resolve(msg.data);
      }
    });
  });

  // 4. Ensure Test Watchlist & Entry Exist
  console.log('4. Preparing target watchlist entry for plate:', testPlate);
  const dept = await prisma.department.findFirst();
  let watchlist = await prisma.watchlist.findFirst({
    where: { name: 'PHASE 4E LIVE TEST LIST' },
  });
  if (!watchlist) {
    watchlist = await prisma.watchlist.create({
      data: {
        name: 'PHASE 4E LIVE TEST LIST',
        departmentId: dept!.id,
        owner: 'Command Room E2E Unit',
      },
    });
  }

  let entry = await prisma.watchlistEntry.findFirst({
    where: { watchlistId: watchlist.id, plateNormalized: testPlate },
  });
  if (!entry) {
    entry = await prisma.watchlistEntry.create({
      data: {
        watchlistId: watchlist.id,
        plateNormalized: testPlate,
        category: 'STOLEN_VEHICLE',
        reason: 'Live Phase 4E Demonstration Plate',
        priority: AlertSeverity.CRITICAL,
        addedBy: 'e2e.test@gujcamera.local',
        active: true,
      },
    });
  } else {
    await prisma.watchlistEntry.update({
      where: { id: entry.id },
      data: { active: true },
    });
  }

  // 5. Ingest Vehicle Sighting
  console.log('5. Ingesting VehicleSighting for plate:', testPlate);
  const camera = await prisma.camera.findFirst();
  if (!camera) throw new Error('No camera found in database');

  await prisma.vehicle.upsert({
    where: { plateNormalized: testPlate },
    create: { plateNormalized: testPlate },
    update: {},
  });

  const now = new Date();
  const sighting = await prisma.vehicleSighting.create({
    data: {
      cameraId: camera.id,
      plateNormalized: testPlate,
      ts: now,
      confidence: 0.985,
      consensusOf: 6,
      frameRef: 's3://evidence-vault/test-live-4e.jpg',
    },
  });

  // 6. Trigger Watchlist Matching on Sighting -> Creates Alert & Broadcasts over WebSocket!
  console.log('6. Triggering AlertsService.processSightingMatch via POST /alerts/match-sighting ...');
  const matchRes = await fetch(`${API_BASE}/alerts/match-sighting`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify({ sighting_id: sighting.id }),
  });

  if (!matchRes.ok) {
    throw new Error(`Match sighting failed: ${matchRes.status} ${await matchRes.text()}`);
  }
  const matchResult: any = await matchRes.json();
  console.log('   ✓ Match result returned from AlertsService:', matchResult.length, 'alert(s) created.');

  // Wait for real-time broadcast of alert.created
  console.log('   Awaiting WebSocket [alert.created] broadcast...');
  const createdAlert = await alertCreatedPromise;
  const broadcastPlate = createdAlert.watchlist_match?.plate_normalized || createdAlert.plate_normalized;
  if (!createdAlert || broadcastPlate !== testPlate) {
    throw new Error(`Broadcast plate mismatch: expected ${testPlate}, got ${broadcastPlate}`);
  }

  // 7. Perform Triage Action via REST: Operator Acknowledges Alert
  console.log('\n7. Performing Triage Action (Operator Acknowledges Alert):');
  console.log('   Sending POST /api/v1/alerts/' + createdAlert.id + '/acknowledge ...');

  const ackRes = await fetch(`${API_BASE}/alerts/${createdAlert.id}/acknowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorToken}`,
    },
  });

  if (!ackRes.ok) {
    throw new Error(`Acknowledge failed: ${ackRes.status} ${await ackRes.text()}`);
  }
  const updatedAlertResult: any = await ackRes.json();
  console.log('   ✓ Authoritative alert status in PostgreSQL:', updatedAlertResult.status);

  // Wait for real-time broadcast of alert.updated
  console.log('   Awaiting WebSocket [alert.updated] broadcast...');
  const updatedAlert = await alertUpdatedPromise;
  if (!updatedAlert || updatedAlert.status !== 'ACKNOWLEDGED') {
    throw new Error(`Broadcast status mismatch: expected ACKNOWLEDGED, got ${updatedAlert?.status}`);
  }

  // 8. Cleanup test fixtures cleanly
  console.log('\n8. Cleaning up test data...');
  ws.close();
  await prisma.alert.deleteMany({ where: { id: createdAlert.id } });
  await prisma.vehicleSighting.deleteMany({ where: { id: sighting.id } });
  await prisma.vehicle.deleteMany({ where: { plateNormalized: testPlate } });
  await prisma.watchlistEntry.deleteMany({ where: { id: entry.id } });
  await prisma.watchlist.deleteMany({ where: { id: watchlist.id } });
  await prisma.$disconnect();

  console.log('\n=== [PHASE 4E] ALL LIVE END-TO-END VERIFICATION CHECKS PASSED! ===\n');
}

main().catch((err) => {
  console.error('\n❌ [PHASE 4E] Verification FAILED:', err);
  process.exit(1);
});
