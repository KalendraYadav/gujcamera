# NETRAVAHA — Phase 13: Dataset Adapter & Simulated Live CCTV Ingestion Architecture
**Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-PHASE13-INGESTION-2026-V1`  
**Security Classification:** Engineering Specification & Deployment Guide  

---

> [!IMPORTANT]
> **Operational Status & Government CCTV Disclosure**  
> **CURRENT**: Operating in demonstration mode using representative traffic recordings and deterministic test fixtures replayed over a simulated RTSP streaming gateway.  
> **FUTURE**: The identical RTSP/ONVIF/VMS ingestion and cryptographic verification boundaries accept authorized Gujarat Police departmental VMS/NVR streams immediately upon operational connectivity.

---

## 1. Architectural Overview

Phase 13 establishes the end-to-end simulated live CCTV streaming and data ingestion pipeline for the **Gujarat Police Innovation Challenge 2026**. The system decouples video source provenance from the core analytics stack through a strictly normalized media gateway boundary:

```
┌─────────────────────────────────┐
│     Demonstration Manifest      │  Single source of truth for CCTV nodes,
│ demonstration_manifest.json     │  corridor GPS, hashes, and stream paths
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│      Dataset Source Adapter     │  Validates files, verifies SHA-256 hashes,
│     DatasetAdapterService       │  enforces licenses, rejects invalid sources
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   FFmpeg RTSP Replay Engine     │  Reads video at native frame rate (-re),
│     SimulatedReplayService      │  loops indefinitely (-stream_loop -1),
│      stream-loop.sh             │  copies NAL units (-c:v copy) over TCP
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│     MediaMTX Streaming Gateway  │  RTSP Server (:8554) + HLS Remuxer (:8888)
│      (bluenviron/mediamtx)      │  REST API (:9997) dynamic path control
└───────┬─────────────────┬───────┘
        │                 │
        │ RTSP Feeds      │ HLS Feeds
        ▼                 ▼
┌──────────────────┐ ┌─────────────────────────┐
│ AI Vision Worker │ │ Frontend Web Console    │
│ StreamConsumer   │ │ LivePlayer HLS.js Grid  │
│ (YOLOv8 + ANPR)  │ │ GIS Leaflet Map         │
└───────┬──────────┘ └─────────────────────────┘
        │
        ▼ Sighting Events
┌──────────────────────────────────────────────────┐
│ Redis Streams (gujcamera:events:vehicle-sightings)│
└───────┬──────────────────────────────────────────┘
        │
        ▼ SightingEventConsumer
┌──────────────────────────────────────────────────┐
│ NestJS Backend + PostgreSQL/PostGIS + MinIO      │
│ Watchlist Alerting + Evidence Vault (SHA-256)    │
└──────────────────────────────────────────────────┘
```

---

## 2. Demonstration Manifest (`fixtures/manifests/demonstration_manifest.json`)

The demonstration manifest serves as the single source of truth for all demonstration media and camera node configurations:
- **Corridor Coverage**: 10 strategic nodes across Ahmedabad, Gandhinagar, Surat, and Vadodara.
- **Fields Provided**:
  - `cameraId`: Canonical identifier matching the database (e.g., `CAM-AHM-01`).
  - `sourceId`: Source asset tag (e.g., `SRC-SYNTH-AHM-01`).
  - `sourceType`: Preserved classification (`SYNTHETIC_STREAM`, `RESEARCH_VIDEO`, `DEMO_FILE`).
  - `displayName`: Human-readable junction description.
  - `jurisdiction`: Police commissionerate or district authority.
  - `location`: Exact street address / intersection.
  - `latitude` / `longitude`: Real Gujarat GPS coordinates for PostGIS mapping.
  - `videoPath`: Relative repository path to local MP4 asset.
  - `sha256`: Cryptographic digest for file integrity validation.
  - `duration`, `fps`, `width`, `height`: Expected media characteristics.
  - `rtspPath`: Normalized URL-safe path slug published to MediaMTX.
  - `provenance`: Historical origin (`IN_HOUSE_SYNTHETIC`, `PUBLIC_RESEARCH_VIDEO`).
  - `licenseStatus`: Legal declaration (`VERIFIED_SYNTHETIC`, `LICENSE_VERIFICATION_REQUIRED`).
  - `attribution`: Source credit.
  - `targetVehicles`: Reference metadata only; **never injected into runtime inference**.
  - `notes`: Operational context.

---

## 3. Dataset Source Adapter (`DatasetAdapterService`)

Located in `backend/src/modules/cameras/dataset-adapter/`:
- **Interface**: Implements `IDatasetSource`.
- **Validation**:
  1. Inspects file presence on disk.
  2. Computes SHA-256 byte-level digest and checks against manifest hash.
  3. Verifies non-zero video dimensions, FPS, and duration.
  4. Enforces URL-safe regex for RTSP stream paths (`/^[a-z0-9_-]+$/i`).
  5. Flags sources with `licenseStatus === 'LICENSE_VERIFICATION_REQUIRED'`, keeping them explicitly classified as development fixtures.
- **Strict Anti-Fabrication Boundary**: The adapter contains zero inference logic and produces zero simulated sightings.

---

## 4. FFmpeg Replay Engine (`SimulatedReplayService`)

Manages the lifecycle of continuous video stream loops into MediaMTX:
- **Command Invocation**:
  ```bash
  ffmpeg -hide_banner -loglevel warning \
    -re \
    -stream_loop -1 \
    -i /fixtures/<asset>.mp4 \
    -c:v copy \
    -f rtsp -rtsp_transport tcp \
    rtsp://<gateway_host>:8554/<rtspPath>
  ```
- **Process Management**:
  - Spawns and tracks child process PIDs.
  - Traps process errors and exits.
  - Guarantees clean shutdown on module destroy / process exit (SIGTERM / SIGKILL) to eliminate orphan FFmpeg processes.
- **Multi-Channel Orchestration**: Supports starting/stopping all streams or individual cameras dynamically.

---

## 5. MediaMTX Integration (`MediaGatewayService`)

Connects the replay streams to downstream consumers:
- **RTSP Server (`:8554`)**: Receives published streams from FFmpeg and serves raw RTSP feeds to the AI Worker's `StreamConsumer`.
- **HLS Transcoder (`:8888`)**: Remuxes RTP video packets into low-latency fragmented MP4 (fMP4) chunks with 1-second segment durations for browser playback via HLS.js.
- **REST API (`:9997`)**: Enables dynamic path querying (`GET /v3/paths/get/:name`) to report path readiness without restarting streaming servers.

---

## 6. AI Vision Pipeline Flow

The containerized Python AI Worker consumes streams natively without awareness of simulated origin:
1. `StreamConsumer` opens RTSP connection over TCP via OpenCV FFmpeg backend.
2. **Timestamp Assignment**: Frames are stamped with the system UTC wall-clock time (`time.time()`) at the moment of decoding. Original file container timestamps are disregarded.
3. **YOLOv8 Inference**: Detects vehicle chassis and localizes license plate bounding boxes.
4. **Consensus Engine**: Accumulates 5–8 observations across a 3.0-second sliding window and votes on alphanumeric character agreement ($\ge 60\%$).
5. **Evidence Capture**: On consensus agreement, crops the full frame and stores it in MinIO (`police-evidence-vault`) with an authentic SHA-256 hash.
6. **Event Dispatch**: Emits `vehicle.sighting_created` event to Redis stream `gujcamera:events:vehicle-sightings`.

---

## 7. Downstream Intelligence Integration

1. `SightingEventConsumer` in NestJS reads the Redis stream, validates event schema, and atomically writes to PostgreSQL:
   - Updates `Vehicle` table (`lastSeen`, `firstSeen`).
   - Inserts `VehicleSighting` with PostGIS camera coordinate reference.
   - Inserts `Evidence` record sealed with the exact SHA-256 hash.
2. `AlertsService` matches the normalized plate against active watchlists and fires real-time WebSocket alerts on hits.
3. `RouteIntelligenceEngine` reconstructs consecutive sightings along the corridor, calculating geodesic distance and transit velocity.
4. `VehicleCorrelationService` computes fuzzy-Levenshtein and spatio-temporal correlation candidates.

---

## 8. Frontend Demonstration Disclosure

1. **Global Header Indicator**: Persistent badge in the top navigation bar reading:  
   `SIMULATED LIVE CCTV` with tooltip explaining representative corridor deployment.
2. **Live Player Overlay Badge**: Persistent pill reading `SIMULATED LIVE` alongside `SOURCE: SYNTHETIC_STREAM` or `SOURCE: RESEARCH_VIDEO`.
3. **Live Surveillance Breadcrumb**: Clear notice reading `SIMULATED LIVE CCTV (REPRESENTATIVE CORRIDOR DEPLOYMENT)`.

---

## 9. Operator Controls & CLI

Operators can control demonstration streams via CLI or REST endpoints:

### CLI Utility
```bash
# Validate demonstration manifest and verify SHA-256 video hashes on disk
node scripts/manage_simulated_cctv.js --validate

# Inspect streaming health and MediaMTX path readiness
node scripts/manage_simulated_cctv.js --status
```

### REST Endpoints (`SimulatedCctvController`)
- `GET /api/v1/cameras/simulated-cctv/manifest`: Get full manifest metadata.
- `GET /api/v1/cameras/simulated-cctv/validate`: Execute integrity audit of on-disk assets.
- `GET /api/v1/cameras/simulated-cctv/status`: Query active streaming states.
- `POST /api/v1/cameras/simulated-cctv/start-all`: Initiate all demonstration streams.
- `POST /api/v1/cameras/simulated-cctv/stop-all`: Gracefully terminate all streams.
- `POST /api/v1/cameras/simulated-cctv/:cameraId/start`: Start single stream.
- `POST /api/v1/cameras/simulated-cctv/:cameraId/stop`: Stop single stream.
- `POST /api/v1/cameras/simulated-cctv/:cameraId/restart`: Restart single stream.

---

## 10. Future Transition to Authorized Government CCTV

When operational connectivity to Gujarat Police municipal Command and Control Centers (ICCC / C3), government VMS, or edge NVRs is granted:
1. Register external stream endpoints in the Camera Registry (`CameraProtocol.RTSP`, `CameraProtocol.ONVIF`).
2. Store encrypted connection credentials via `POST /api/v1/cameras/:id/credentials` (AES-256-GCM).
3. `MediaGatewayService` dynamically provisions the MediaMTX path to ingest the authorized external stream.
4. Downstream AI workers, Redis streams, database schema, and frontend UI require **zero code changes**.
