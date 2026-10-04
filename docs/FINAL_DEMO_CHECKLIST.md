# NETRAVAHA — FINAL JUDGE DEMONSTRATION CHECKLIST
**Gujarat Police Innovation Challenge 2026**
**System:** NETRAVAHA Unified CCTV Intelligence Platform
**Scenario:** Stolen Vehicle Corridor Trace — FIR #102/2026

---

## PRE-DEMO (Complete before judges enter the room)

### Infrastructure
- [ ] Laptop plugged in to power
- [ ] Docker Desktop running (check system tray)
- [ ] WSL Ubuntu-24.04 running (`wsl -d Ubuntu-24.04 -- echo OK`)
- [ ] PostgreSQL 16 responding on port 5432
- [ ] Redis 7 responding on port 6379
- [ ] MinIO / Local Evidence Vault responding on port 9000
- [ ] MediaMTX gateway running on ports 8554 / 8888 / 9997
- [ ] FFmpeg installed in WSL (`wsl -d Ubuntu-24.04 -- which ffmpeg`)

### Services
- [ ] NestJS backend started: `cd backend && npm run start:dev`
- [ ] Local S3 vault started: `node scripts/local_evidence_vault.js`
- [ ] AI worker started: `cd ai-worker && python -m app.main`
- [ ] Frontend started: `cd frontend && npm run dev`

### Demo State
- [ ] Demo state reset: `node scripts/manage_judge_demo.js reset`
- [ ] Demo started: `node scripts/manage_judge_demo.js start`
- [ ] Status verified: `node scripts/manage_judge_demo.js status`

Expected status output shows all ✅ READY and cameras 🟢 ONLINE.

### Browser Setup
- [ ] Browser opened at http://localhost:3000
- [ ] Login page loads correctly (NETRAVAHA branding visible)
- [ ] Demo credentials entered (INVESTIGATOR role for full access):
  - Email: investigator.demo@gujcamera.local
  - Password: see databaseKEY.md
- [ ] Live CCTV tab pre-loaded (http://localhost:3000/live)
- [ ] Vehicle investigation pre-searched (GJ01AB1234)
- [ ] Internet not required for local demo (all services local)

---

## DURING DEMO (5-minute flow — see docs/JUDGE_5_MINUTE_DEMO.md)

### Step 1 — Login (30 seconds)
- [ ] Show NETRAVAHA login screen with police crest branding
- [ ] Select INVESTIGATOR role from quick-select panel
- [ ] Authenticate and enter dashboard

### Step 2 — Dashboard Overview (60 seconds)
- [ ] Point to: camera network status, active alerts, recent sightings
- [ ] Show: CONFIGURED PROTOTYPE SOURCES AUTHORIZED INGESTION BOUNDARY badge
- [ ] Show: system health indicators (Database, PostGIS, AI Pipeline)
- [ ] Show: 4 CRITICAL alerts in alert feed

### Step 3 — Live CCTV (45 seconds)
- [ ] Navigate to Live CCTV (/live)
- [ ] Show SIMULATED LIVE CCTV (REPRESENTATIVE CORRIDOR DEPLOYMENT) badge
- [ ] Select CAM-AHM-01 → show HLS stream playing
- [ ] Select CAM-GND-02 → show HLS stream playing

### Step 4 — Vehicle Investigation (90 seconds)
- [ ] Navigate to Vehicles → search GJ01AB1234
- [ ] Show: vehicle profile (White Hyundai Creta, FIR #102/2026)
- [ ] Show: 4 sightings across 3 cameras with timestamps
- [ ] Show: watchlist flag (CRITICAL — STOLEN_VEHICLE)
- [ ] Show: evidence frame with SHA-256 INTEGRITY VERIFIED badge

### Step 5 — Timeline and GIS (45 seconds)
- [ ] Show Timeline: CAM-AHM-01 → CAM-AHM-02 → CAM-GND-02 progression
- [ ] Show GIS Map: camera nodes, numbered sighting sequence, route segment

### Step 6 — Correlation and Alerts (30 seconds)
- [ ] Show Correlation Candidates with plate similarity and spatio-temporal score
- [ ] Show: CRITICAL alert with camera, timestamp, link to investigation

---

## EMERGENCY RECOVERY

### E1: Stream not playing in browser
SYMPTOM: HLS player shows error or black screen
CHECK: http://localhost:9997/v3/paths/list — verify path ready: true
FIX: node scripts/manage_judge_demo.js stop && node scripts/manage_judge_demo.js start
VERIFY: Stream shows ONLINE in status output

### E2: AI worker not processing
SYMPTOM: No new sightings appearing
FIX: Restart AI worker — cd ai-worker && python -m app.main
VERIFY: Logs show Connecting to RTSP stream within 30 seconds

### E3: Stream not reaching MediaMTX
SYMPTOM: Cameras show IDLE after start
CHECK: wsl -d Ubuntu-24.04 -- which ffmpeg
FIX: wsl -d Ubuntu-24.04 -- sudo apt-get install -y ffmpeg
VERIFY: node scripts/manage_judge_demo.js start → cameras go ONLINE

### E4: Browser video decode error
FIX: Refresh browser (F5). If persists: restart MediaMTX docker container.
VERIFY: http://localhost:8888/cam-ahm-01/index.m3u8 returns valid M3U8

### E5: Database or Redis unavailable
FIX: wsl -d Ubuntu-24.04 -- sudo service postgresql start && sudo service redis-server start
VERIFY: node scripts/manage_judge_demo.js status shows DATABASE and REDIS READY

---

## DEMO ACCOUNTS

| User | Role | Purpose |
|------|------|---------|
| investigator.demo@gujcamera.local | INVESTIGATOR | Primary demo account — vehicle search, evidence, timeline, GIS |
| operator.demo@gujcamera.local | OPERATOR | Live CCTV monitoring, camera health, alerts view |
| admin.demo@gujcamera.local | SUPER_ADMIN | Admin panel, user management |

Credentials NOT stored in public documentation. See databaseKEY.md (local only).

---

## REPEAT DEMO

node scripts/manage_judge_demo.js stop
node scripts/manage_judge_demo.js reset
node scripts/manage_judge_demo.js start
node scripts/manage_judge_demo.js status

No manual SQL. No file editing. No Docker volume deletion required.

---
NETRAVAHA Phase 15 — Gujarat Police Innovation Challenge 2026
