# NETRAVAHA — JUDGE DEMONSTRATION RUNBOOK
**Gujarat Police Innovation Challenge 2026**
**Document Classification:** RESTRICTED — EVALUATION RUNBOOK
**Platform:** NETRAVAHA — Unified CCTV Intelligence Platform
**Audience:** Demonstration Operators, Technical Judges, System Evaluators

---

## 1. What NETRAVAHA Is
NETRAVAHA is an automated, real-time command and intelligence platform engineered for the Gujarat Police. It bridges disparate municipal, highway, and district camera systems into a single operational interface. Key capabilities include:
- Protocol-agnostic video normalization (RTSP, HLS, ONVIF, proprietary mock vendor protocols).
- Neural vehicle localization (YOLO) and automated number plate recognition (OCR).
- Multi-frame temporal consensus filtering to eliminate optical and OCR jitter.
- Spatio-temporal route velocity modeling and candidate correlation.
- Section 65B-aligned digital evidence vaulting with cryptographic SHA-256 integrity verification.
- Real-time sub-second hotlist/watchlist alerting over Redis Streams.

---

## 2. Demonstration Architecture
The platform runs on a modern decoupled microservices architecture:

```
[Simulated Camera Feeds] -> [FFmpeg Loop] -> [MediaMTX Gateway :8554 RTSP / :8888 HLS]
                                                   |
                                                   v
                                          [AI Vision Worker (YOLO + OCR)]
                                                   |
                    +------------------------------+------------------------------+
                    |                                                             |
                    v                                                             v
       [Redis Streams Broker :6379]                             [S3 Evidence Vault :9000]
                    |                                                             |
                    v                                                             v
        [NestJS Core API :4000] <========================================+ [Evidence Verification]
                    |
                    +--> [PostgreSQL 16 + PostGIS 3.4 :5432]
                    |
                    v
    [Next.js Tactical UI :3000] (Investigator / Operator / Auditor Consoles)
```

---

## 3. What Is Simulated vs. What Is Real

### What Is Simulated:
- **Camera Feeds:** In this demonstration environment, live camera hardware is simulated by replaying high-fidelity MP4 video fixtures continuously over RTSP into the MediaMTX video gateway.
- **Physical Locations:** GPS coordinates and camera metadata represent an authentic 10-node corridor deployment across Ahmedabad, Gandhinagar, Surat, and Vadodara.

### What Is Real within the Software Pipeline:
- **Media Ingestion:** Real network RTSP packets are streamed through MediaMTX and decoded via OpenCV VideoCapture.
- **AI Inference:** Real YOLO neural network detects vehicle bounding boxes; real OCR extracts license plates from raw pixel buffers.
- **Evidence Storage:** Real JPEG frames are saved into immutable S3 object storage; raw byte SHA-256 hashes are computed and recorded.
- **Event Dispatch:** Real Redis Streams broadcast sighting and alert events to the backend consumer group.
- **Database & Spatial Engine:** Real PostgreSQL with PostGIS GiST spatial indexing executes geospatial queries and velocity calculations.
- **Frontend Dashboard:** Real Next.js tactical interface with live HLS playback, interactive GIS maps, and evidence inspection.

---

## 4. Single-Command Operator Controls

All demonstration lifecycle commands are managed via `scripts/manage_judge_demo.js`:

### 4.1 System Readiness Check
```bash
node scripts/manage_judge_demo.js status
```
Inspects all database, Redis, S3 vault, MediaMTX gateway, and media fixture prerequisites and outputs a clear health table.

### 4.2 Start Demonstration
```bash
node scripts/manage_judge_demo.js start
```
Validates prerequisites, auto-starts the evidence vault, starts the 3 primary demonstration camera streams (`CAM-AHM-01`, `CAM-AHM-02`, `CAM-GND-02`), and publishes URLs.

### 4.3 Stop Demonstration
```bash
node scripts/manage_judge_demo.js stop
```
Terminates all active stream processes gracefully and returns MediaMTX paths to idle.

### 4.4 Reset Demonstration State
```bash
node scripts/manage_judge_demo.js reset
```
Safely purges demonstration-generated sightings, evidence records, and alerts for test vehicle `GJ01AB1234`. **Never** touches user accounts, departments, camera definitions, or database migrations.

---

## 5. Step-by-Step Judge Demonstration Procedure

### Step 1: Officer Authentication
1. Open browser to `http://localhost:3000/login`.
2. Enter demonstration credentials:
   - **Username / Email:** `investigator@police.gujarat.gov.in` (or select `INVESTIGATOR` preset role)
   - **Password:** `PoliceDemo@2026!`
3. Click **Access System**. The system loads the tactical command dashboard.

### Step 2: Live CCTV Surveillance Grid
1. Navigate to **Live Monitoring** (`http://localhost:3000/live`).
2. Point out the operational badge:
   `SIMULATED LIVE CCTV (REPRESENTATIVE CORRIDOR DEPLOYMENT)`
3. Switch between primary corridor cameras:
   - `CAM-AHM-01: SG Highway - Pakwan Crossroad Junction`
   - `CAM-AHM-02: C.G. Road - Swastik Char Rasta`
   - `CAM-GND-02: CH-0 Circle - Gandhinagar Entrance`
4. Confirm live low-latency HLS video playback.

### Step 3: Vehicle Search
1. Click **Vehicle Investigation** (`http://localhost:3000/investigation`).
2. Enter the target pursuit plate: `GJ01AB1234`.
3. Click **Search**.
4. Confirm the vehicle dossier:
   - **Plate:** `GJ01AB1234`
   - **Class:** `SUV`
   - **Make/Model:** `Hyundai Creta` (White)
   - **Watchlist Flag:** `CRITICAL (FIR #102/2026 - Stolen Vehicle)`

### Step 4: Multi-Camera Chronological Timeline
1. Switch to the **Chronological Timeline** tab.
2. Review the chronological progression across the corridor:
   - Detection 1: `CAM-AHM-01` (Pakwan Crossroad)
   - Detection 2: `CAM-AHM-02` (Swastik Char Rasta, ~5.3 km)
   - Detection 3: `CAM-GND-02` (CH-0 Circle, Gandhinagar)
3. Point out the route velocity calculation showing arterial travel speeds between 40-50 km/h.

### Step 5: GIS Tactical Corridor Map
1. Navigate to **GIS Map** (`http://localhost:3000/gis`).
2. Review the interactive corridor map showing green active camera nodes, discrete sighting markers, and inter-district directional pursuit vectors connecting Ahmedabad to Gandhinagar.

### Step 6: Candidate Correlation (Phase 10 Hybrid Engine)
1. On the investigation view, select **Correlation Candidates**.
2. Explain the hybrid scoring:
   - Fuzzy plate Levenshtein distance (e.g. `GJ01AB1234` vs altered `GJ01A81234`).
   - Spatio-temporal velocity plausibility.
   - Combined confidence score demonstrating candidate discovery without claiming absolute identity.

### Step 7: Forensic Evidence & Integrity Inspection
1. Click on a sighting record and open **Inspect Evidence** (`/evidence/:id`).
2. The modal displays:
   - Full captured snapshot image.
   - Bounding box overlay and plate crop.
   - Forensic metadata (Camera, Timestamp, Frame Sequence).
   - Stored SHA-256 digest vs Live SHA-256 digest.
   - Status: `VERIFIED (INTEGRITY MATCH)`.
3. Clarify: *"The system computes the SHA-256 hash of the vaulted frame in real-time to verify that stored evidence has not suffered pixel alteration or corruption."*

### Step 8: Watchlist Hotlist Alert
1. Navigate to **Alerts** (`http://localhost:3000/alerts`).
2. Point out the active `CRITICAL` alert generated by Redis Streams when the vehicle was detected at `CAM-AHM-01`.
3. Demonstrate alert actions: **Acknowledge Alert** or **Export Section 65B Dossier**.

---

## 6. Failure Recovery Drills (Live Resilience)

### Drill A: Camera Stream Disruption & Recovery
1. In a terminal, stop one stream:
   `node scripts/manage_judge_demo.js stop`
2. In the UI, the stream status changes to `OFFLINE / CONNECTING`.
3. Restart the stream:
   `node scripts/manage_judge_demo.js start`
4. The stream resumes in the UI within 2-3 seconds without refreshing the page.

### Drill B: AI Vision Worker Restart
1. Terminate the AI worker process.
2. The UI continues to serve live video streams via MediaMTX unaffected.
3. Restart the AI worker; it re-establishes connection to MediaMTX and Redis Streams immediately.

### Drill C: Browser Hard Refresh
1. Press `Ctrl + F5` on the investigation page during an active pursuit.
2. All sightings, timeline markers, and map pins restore from PostgreSQL state within 200 ms.

---

## 7. Troubleshooting Quick Reference

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| `DATABASE OFFLINE` | PostgreSQL service not running | Ensure PostgreSQL is active on port 5432 (`wsl -d Ubuntu-24.04 -- sudo service postgresql start`). |
| `REDIS OFFLINE` | Redis service not running | Start Redis on port 6379 (`wsl -d Ubuntu-24.04 -- sudo service redis-server start`). |
| `MINIO OFFLINE` | Evidence vault script not running | Run `node scripts/local_evidence_vault.js` or execute `node scripts/manage_judge_demo.js start`. |
| `MEDIAMTX OFFLINE` | Video gateway container stopped | Run `docker start gujcamera_mediamtx` in WSL. |
| `BACKEND OFFLINE` | NestJS server stopped | Run `npm run start:dev` in `backend/` directory. |
| Missing Sightings | Streams not running | Run `node scripts/manage_judge_demo.js start` and ensure AI worker is running. |
