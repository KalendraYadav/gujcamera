# NETRAVAHA — End-to-End Intelligence Pipeline Demo Runbook
**Gujarat Police Innovation Challenge 2026**  
**Phase 6: Multi-City / Multi-Source CCTV Data Federation**

---

> [!IMPORTANT]
> **Source Provenance & Architectural Boundary Disclaimer**  
> All live video demonstrations in this prototype utilize **RESEARCH VIDEO SOURCES** (e.g., highway surveillance footage with `LICENSE_VERIFICATION_REQUIRED`) and deterministic **SYNTHETIC FIXTURES** (`cam-ahm-01.mp4`, `cam-ahm-02.mp4`, `cam-gnd-02.mp4`).  
> **No live government CCTV network is connected.**  
> The system models a representative multi-city fleet across 5 major Gujarat jurisdictions (Ahmedabad, Surat, Vadodara, Rajkot, Gandhinagar) and Ahmedabad–Vadodara Expressway (NE-1). Production deployment accepts departmental authorized RTSP, ONVIF Profile S/T, and VMS gateway sources via the clean ingestion boundary.

---

## 1. System Architecture Overview

```
[ Research Video / Synthetic Fixture / RTSP Source ]
                       ↓
               FFmpeg Stream Loop
                       ↓ RTSP (H.264)
           MediaMTX RTSP Gateway (:8554 / :9997)
                       ↓ WebRTC / LL-HLS / Internal RTSP
     ┌─────────────────┴──────────────────┐
     ↓                                    ↓
AI Vision Worker                  Live CCTV Player
- Vehicle Detection (YOLO/Heuristic) (Frontend Next.js)
- Plate Localization
- OCR Engine
- Multi-Frame Consensus (3 of 5)
- Evidence Snapshot & SHA-256 Digest
     ↓
Redis Stream (`gujcamera:events:vehicle-sightings`)
     ↓
NestJS Sighting Consumer
- Camera Registry Resolution
- PostgreSQL / PostGIS Persistence
- Watchlist Engine Comparison
     ↓ (CRITICAL Alert on Match)
WebSocket Gateway (`/ws/alerts`) ──→ Live Alerts Console
                                         ↓
                              Vehicle Investigation UI
                              - Spatio-temporal correlation
                              - Georeferenced route ordering
                              - SHA-256 evidence integrity check
```

---

## 2. Prerequisites & Environment

Ensure Docker, Node.js (v20+), and Python (3.11+) are available:

```bash
docker --version
node --version
python --version
```

Verify required ports are available:
- `5432` — PostgreSQL / PostGIS
- `6379` — Redis
- `8554` — MediaMTX RTSP
- `8888` — MediaMTX HLS
- `9997` — MediaMTX HTTP Control API
- `9000` — MinIO Object Storage
- `3001` — NestJS Backend API
- `3000` — Next.js Frontend

---

## 3. Step-by-Step Demonstration Script

### Step 1: Start Core Infrastructure Services
Launch database, message queue, object storage, and media gateway:

```bash
docker compose up -d postgres redis minio video-gateway
```

Check health:
```bash
docker compose ps
```

Verify MediaMTX API:
```bash
curl -s http://localhost:9997/v3/paths/list
```

---

### Step 2: Start NestJS Backend Service
In a dedicated terminal:

```bash
cd backend
npm install
npx prisma migrate deploy
npm run start:dev
```

*Backend boots on `http://localhost:3001/api/v1` and initializes Redis stream consumers.*

---

### Step 3: Start AI Vision Worker
In a second terminal:

```bash
cd ai-worker
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python run_worker.py
```

*Worker connects to MediaMTX RTSP and subscribes to active camera feeds.*

---

### Step 4: Start Video Stream (Realistic Demo or Synthetic)

To run the **Realistic Highway Surveillance Footage** (`demo-traffic.mp4`):
```bash
# In video-gateway container or local shell
docker compose exec video-gateway env DEMO_VIDEO_SOURCE=/fixtures/demo-traffic.mp4 /stream-loop.sh
```

To run the **Deterministic Synthetic Stream** with known target plate `GJ01AB1234`:
```bash
docker compose exec video-gateway env DEMO_VIDEO_SOURCE=/fixtures/cam-ahm-01.mp4 /stream-loop.sh
```

Both streams publish cleanly to:
- `rtsp://localhost:8554/demo-traffic` (Research Video)
- `rtsp://localhost:8554/cam-ahm-01` (Synthetic Fixture)

---

### Step 5: Start Frontend UI
In a third terminal:

```bash
cd frontend
npm install
npm run dev
```

Open browser at: [http://localhost:3000](http://localhost:3000)

---

### Step 6: Log In as Investigator or Administrator
Use seeded credentials:
- **Email:** `investigator.demo@gujcamera.local` (or `admin.demo@gujcamera.local`)
- **Password:** `PoliceDemo@2026!`

---

### Step 7: Multi-City GIS Camera Map & City Filtering
1. Navigate to **GIS Map** (`/map`).
2. Observe the Gujarat state viewport showing 15 cameras across 5 major jurisdictions:
   - **Ahmedabad City Police** (SG Highway, Income Tax, Pakwan)
   - **Surat City Police** (Ring Road, Athwa Gate, Varachha Main Road)
   - **Vadodara City Police** (Sayajigunj, Alkapuri, Makarpura GIDC)
   - **Rajkot City Police** (Trikon Baug, Yagnik Road)
   - **Gandhinagar Police** (Chh Road Secretariat, Infocity Circle)
   - **Statewide Highway Safety** (Ahmedabad–Vadodara Expressway NE-1 Toll)
3. Use the **City Filter Bar** (`All Cities`, `Ahmedabad`, `Surat`, `Vadodara`, `Rajkot`, `Gandhinagar`):
   - Click **Surat**: The map smoothly flies to Surat coordinates `[21.1702, 72.8311]` and filters visible markers to Surat cameras (`CAM-SUR-01`, `CAM-SUR-02`, `CAM-SUR-03`).
   - Click **Gandhinagar**: The map pans to `[23.2156, 72.6369]` displaying secretariat and Infocity junctions.
   - Click **All Cities**: Pans out to the full statewide view `[22.8, 72.0]` at zoom level 7.
4. Use the **Source Type Filter** (`ALL`, `SYNTHETIC_STREAM`, `RESEARCH_VIDEO`):
   - Filter to `RESEARCH_VIDEO`: displays highway research sources with provenance tags.

---

### Step 8: Select Camera, Inspect Source Provenance & Watch Live Stream
1. Click on camera marker `CAM-AHM-01` or `CAM-SUR-01` on the map.
2. The **Camera Detail Drawer** opens:
   - **City / Jurisdiction Badge:** `CITY: Ahmedabad` or `CITY: Surat`.
   - **Source Provenance Badge:** `SOURCE: SYNTHETIC_STREAM` or `SOURCE: RESEARCH_VIDEO`.
   - **Source Quality Classification:** Documented per `docs/VIDEO_SOURCE_CATALOG.md` (Class A: ANPR/Consensus, Class B: Vehicle Detection, Class C: GIS Playback).
   - **Operational Health:** `● ONLINE` with actual FPS, packet loss, and heartbeat timestamp.
3. Observe live sub-second video playback in the drawer's embedded video player.

---

### Step 9: Observe Live AI Detections & Sighting Events
1. In the AI worker console:
   ```
   [Inference] Sampled frame 120 | Detections: 4 vehicles | Plates localized: 1
   [Consensus] Accepted plate: GJ01AB1234 | Confidence: 0.96 | Agreement: 5/5
   [Evidence] Snapshot generated | SHA-256: 315cb76daa3caa030ef0de4aecbaafa8dd20c114901d940682cceb1a9fa42db7
   [Event] Published to Redis stream gujcamera:events:vehicle-sightings
   ```
2. In the backend terminal:
   ```
   [SightingEventConsumer] Persisted sighting and evidence for camera CAM-AHM-01 (Ahmedabad)
   [Watchlist Alert Triggered] Sighting matched STOLEN_VEHICLE watchlist!
   ```

---

### Step 10: Observe Live Watchlist Alert Originating Across Cities
1. Navigate to **Alerts Console** (`/alerts`).
2. A new alert arrives in real time via WebSocket:
   - **Severity:** `CRITICAL` (flashing red indicator)
   - **Target Plate:** `GJ01AB1234`
   - **Category:** `STOLEN_VEHICLE`
   - **Originating Jurisdiction:** `Ahmedabad City Police (CAM-AHM-01)`
   - **Source Type:** `SYNTHETIC_STREAM`
3. Click **Investigate Vehicle**.

---

### Step 11: Multi-City Vehicle Investigation & Spatio-Temporal Sighting Correlation
1. The **Vehicle Investigation Page** (`/vehicles/GJ01AB1234`) displays:
   - **Plate Summary:** Normalized plate `GJ01AB1234`, vehicle class `SUV`, make/model `Toyota Innova (White)`.
   - **Multi-City Sightings Chronology:**
     1. `10:00:00` — `CAM-AHM-01` (Ahmedabad, SG Highway Junction)
     2. `10:10:00` — `CAM-AHM-02` (Ahmedabad, Pakwan Cross Road)
     3. `10:25:00` — `CAM-GND-02` (Gandhinagar, Infocity Circle)
   - **Spatio-Temporal Hop Analysis:**
     - Hop 1 → Hop 2: 5.8 km, 10 mins elapsed (34.8 km/h — Plausible urban transit).
     - Hop 2 → Hop 3: 19.4 km along SG Highway corridor, 15 mins elapsed (77.6 km/h — Plausible inter-city highway transit).
     - **Overall Route Plausibility Score:** `1.0 (100% Plausible)`.
   - **Sighting Map:** Inter-city route line connecting camera coordinates from Ahmedabad to Gandhinagar.
   - *Terminology Check:* Labeled strictly as **spatio-temporal sighting correlation**, not continuous GPS tracking.

---

### Step 12: Evidence Cryptographic Integrity Verification
1. On the Gandhinagar sighting record (`CAM-GND-02`), click **View Evidence**.
2. Examine the evidence modal:
   - Captured full-frame snapshot and plate crop.
   - Originating camera: `CAM-GND-02 (Gandhinagar Police)`.
   - Recorded **SHA-256 Digest**: `a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0`.
3. Click **Verify Integrity**:
   - Result: `[VALID] Byte-level SHA-256 digest matches. Frame integrity verified.`

---

### Step 13: Single-Camera Stream Failure & Health Isolation
Demonstrate that a fault on one city camera does not crash or degrade other streams:

1. **Simulate a failure on Surat Camera (`CAM-SUR-01`):**
   - The stream loop for Surat is stopped or packet loss is simulated.
2. In the **Camera Registry** (`/cameras`):
   - `CAM-SUR-01` status transitions: `ONLINE` → `DEGRADED` (reconnecting attempt 1/5) → `OFFLINE`.
   - Health poller logs: `Camera [cam-sur-01] stream source disconnected. Entering reconnection backoff.`
3. **Verify Sibling Stream Isolation:**
   - Ahmedabad cameras (`CAM-AHM-01`, `CAM-AHM-02`) continue streaming smoothly at 30 FPS.
   - Gandhinagar camera (`CAM-GND-02`) remains `ONLINE`.
   - AI Worker continues inference on healthy streams without thread pool starvation.
4. **Restore the Surat stream:**
   - MediaMTX stream path recovers.
   - Reconnection reconciler detects stream within 5–10s: `CAM-SUR-01` transitions back to `ONLINE`.

---

## 4. Truthful Architectural Claims Reference

| Claim | Acceptable Phrasing | Strictly Prohibited Phrasing |
| :--- | :--- | :--- |
| **Video Source** | "Controlled demo/research footage & synthetic stream" | "Live Government CCTV connected" |
| **Scale** | "Architecture designed toward the 80,000-camera challenge target" | "Tested across 80,000 live cameras" |
| **Evidence** | "Cryptographic SHA-256 byte-level integrity verification" | "Tamper-proof / immutable blockchain evidence" |
| **Tracking** | "Spatio-temporal sighting correlation across camera junctions" | "Continuous GPS vehicle tracking" |
| **ANPR Quality** | "Multi-frame consensus OCR with confidence thresholding" | "100% accurate ANPR in all weather" |

---

## 5. Verification Commands Summary

To run all automated validations locally:

```bash
# 1. AI Worker Tests (111 unit tests)
cd ai-worker && pytest

# 2. Realistic Video & Synthetic Stream Benchmarks
python ai-worker/scripts/validate_realistic_video.py

# 3. Backend Unit & Contract Tests (95 unit tests)
cd ../backend && npm test

# 4. Backend Build Verification
npm run build

# 5. Frontend Tests (148 unit tests)
cd ../frontend && npm test

# 6. Frontend TypeScript Compilation
npx tsc --noEmit
```
