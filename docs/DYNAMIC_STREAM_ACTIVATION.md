# NETRAVAHA — Dynamic Stream Activation & Lifecycle Management

## 1. Executive Summary

NETRAVAHA features a **zero-restart, source-agnostic dynamic video onboarding pipeline**. Authorized administrators can onboard external RTSP video sources via the existing Camera Admin interface. The system dynamically provisions MediaMTX ingestion paths, normalizes internal RTSP streams, notifies the AI Worker via Redis Pub/Sub, and streams HLS to the web console—without restarting any containers, dropping existing camera feeds, or altering downstream intelligence pipelines.

---

## 2. End-to-End Dynamic Stream Architecture

```
[ External Video Source ]
(Authorized IP Camera / VMS RTSP feed / Demo Synthetic Stream)
          │
          ▼ RTSP Stream Ingestion
┌────────────────────────────────────────────────────────┐
│             MediaMTX Video Gateway (v1.11+)            │
│  - API enabled (:9997)                                 │
│  - Dynamic Path Registry (/v3/config/paths/*)          │
│  - Protocol Remuxing: RTSP In ➔ RTSP / HLS Out         │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            │ Normalized Internal RTSP       │ HLS (.m3u8)
            ▼                                ▼
┌───────────────────────────────┐  ┌─────────────────────┐
│       AI Vision Worker        │  │ Frontend Web Console│
│  - DynamicStreamDispatcher    │  │  - Live Camera Grid │
│  - Thread-safe StreamConsumer │  │  - HLS.js Player    │
│  - YOLOv8 Vehicle & Plate Det │  │  - Zero UI Redesign │
│  - Consensus OCR Pipeline     │  └─────────────────────┘
└───────────┬───────────────────┘
            │
            ▼ Sightings Ingestion Event
┌────────────────────────────────────────────────────────┐
│                  Redis Streams & Pub/Sub               │
│  - Hash: gujcamera:registry:active-streams             │
│  - PubSub: gujcamera:control:camera-events             │
│  - Stream: gujcamera:events:sightings                  │
└───────────┬────────────────────────────────────────────┘
            │
            ▼ Event Consumer
┌────────────────────────────────────────────────────────┐
│                   NestJS Core Backend                  │
│  - MediaGatewayService (MediaMTX v3 Control Plane)     │
│  - CamerasService (Dynamic Lifecycle Manager)          │
│  - Watchlist Engine & Cooldown Dedup                   │
│  - Native WebSocket Alert Gateway                      │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌───────────────────────────────┐  ┌─────────────────────┐
│      PostgreSQL + PostGIS     │  │   MinIO Vault (S3)  │
│  - cameras / camera_streams   │  │  - Evidence Crops   │
│  - sightings / alerts         │  │  - SHA-256 Hashes   │
└───────────────────────────────┘  └─────────────────────┘
```

---

## 3. Source-Agnostic Input Boundary

NETRAVAHA strictly decouples external video sources from internal processing components through an architectural ingestion boundary:

| Attribute | Demo / Synthetic Source | Authorized Real RTSP Source |
| :--- | :--- | :--- |
| **Origin** | FFmpeg test video loop / test pattern | Physical IP CCTV camera or VMS RTSP proxy |
| **Protocol** | RTSP / RTMP / Static File | Standard RTSP (H.264 / H.265, AAC/PCM) |
| **MediaMTX Ingestion** | Dynamic or static MediaMTX path | Dynamic registration via `MediaGatewayService` |
| **Internal RTSP Contract** | `rtsp://video-gateway:8554/<path>` | `rtsp://video-gateway:8554/<path>` |
| **AI Worker Ingestion** | Normalized internal RTSP feed | Normalized internal RTSP feed |
| **Frontend Playback** | `http://localhost:8888/<path>/index.m3u8` | `http://localhost:8888/<path>/index.m3u8` |

> [!IMPORTANT]
> **Real Government Network Boundary:**
> NETRAVAHA is currently running in an isolated development and testing environment. **No real government CCTV networks or law-enforcement camera infrastructure are connected.** Real external cameras connect strictly via standard, authorized RTSP/ONVIF endpoints conforming to this normalized contract.

---

## 4. MediaMTX Control Plane (`MediaGatewayService`)

Dynamic stream routing is managed by `MediaGatewayService` in the NestJS backend (`backend/src/modules/cameras/media-gateway.service.ts`).

### 4.1 MediaMTX API Specification
- **Base Endpoint:** `http://video-gateway:9997` (configurable via `MEDIAMTX_API_URL`)
- **API Version:** MediaMTX v3 REST API
- **Endpoints Used:**
  - `GET /v3/config/paths/get/{name}` — Query path configuration & active status
  - `POST /v3/config/paths/add/{name}` — Dynamically register a new stream source
  - `PATCH /v3/config/paths/patch/{name}` — Update source URL or operational parameters
  - `DELETE /v3/config/paths/delete/{name}` — Teardown and deregister an active path
  - `GET /v3/paths/list` — Health check and gateway availability

### 4.2 Path Normalization Rules
MediaMTX v3 route parameters do not permit forward slashes in path registration endpoints (`/v3/config/paths/add/{name}`).
The system converts camera names and IDs into sanitized, URL-safe path slugs:
- Example: `"CAM-SUR-01"` ➔ `"cam-sur-01"`
- Normalized Internal RTSP URL: `rtsp://video-gateway:8554/cam-sur-01`
- Normalized Internal HLS URL: `http://localhost:8888/cam-sur-01/index.m3u8`

### 4.3 Security & Credential Masking
- External RTSP URLs may contain inline authentication (e.g., `rtsp://admin:pass@192.168.1.50:554/stream`).
- All logging, database debug messages, and API responses strictly sanitize credentials via `sanitizeStreamUrl()`:
  - `rtsp://admin:secret@192.168.1.50/stream` ➔ `rtsp://***:***@192.168.1.50/stream`
- Passwords are never returned to the frontend or exposed across WebSocket events.

---

## 5. Camera Lifecycle Management

The `CamerasService` coordinates database transactions, MediaMTX path registration, Redis state tracking, and AI Worker notifications.

### 5.1 Onboarding Lifecycle States

```
[ POST /api/v1/cameras ]
         │
         ▼
[ Validate RTSP Source ]
         │
   Success? ───► No ───► [ Return 400 Bad Request ]
         │
        Yes
         ▼
[ Persist Camera & Stream to PostgreSQL ]
         │
         ▼
[ Register MediaMTX Path via MediaGatewayService ]
         │
   Success? ───► No ───► [ Set Status: ERROR, Log sanitized err, return ]
         │
        Yes
         ▼
[ Persist Normalized Internal RTSP URL in DB ]
         │
         ▼
[ Write Active Stream Entry in Redis Hash ]
(gujcamera:registry:active-streams)
         │
         ▼
[ Publish ACTIVATE Event to Redis Pub/Sub ]
(gujcamera:control:camera-events)
         │
         ▼
[ Set Status: ONLINE / CONFIGURED ]
```

### 5.2 Lifecycle Operations

1. **Create Camera (`POST /api/v1/cameras`):**
   - Validates RTSP source availability.
   - Saves record to PostgreSQL.
   - Dynamically registers path with MediaMTX.
   - Sets internal RTSP URL (`rtsp://video-gateway:8554/<path>`).
   - Publishes `ACTIVATE` event to Redis Pub/Sub.
   - If MediaMTX registration fails, stream status is set to `ERROR` (preventing false `ONLINE` claims).

2. **Update Camera (`PATCH /api/v1/cameras/:id`):**
   - Detects changes in RTSP stream URL or operational status.
   - Reconfigures MediaMTX path using `PATCH /v3/config/paths/patch/{name}`.
   - If deactivated (`status: DECOMMISSIONED`), deactivates MediaMTX path and issues `DEACTIVATE` event.

3. **Decommission Camera (`DELETE /api/v1/cameras/:id`):**
   - Soft-deletes or marks camera as `DECOMMISSIONED`.
   - Removes MediaMTX path via `DELETE /v3/config/paths/delete/{name}`.
   - Removes entry from Redis active streams registry.
   - Publishes `DEACTIVATE` event to AI Worker.
   - **Preserves all historical sightings, vehicle traces, and MinIO evidence crops intact.**

4. **Self-Healing Startup Sync (`onModuleInit`):**
   - On backend boot, `CamerasService` queries MediaMTX `/v3/paths/list`.
   - Re-registers any active database streams that MediaMTX lost during restart.
   - Populates Redis Hash `gujcamera:registry:active-streams` to ensure state parity.

---

## 6. Dynamic AI Worker Synchronization

The AI Vision Worker (`ai-worker/`) consumes video feeds using a thread-safe `DynamicStreamDispatcher` without restarting the worker process:

### 6.1 Redis Hash Registry (`gujcamera:registry:active-streams`)
- Maintains the current source of truth for active streams:
  ```json
  {
    "cam-ahm-01": "{\"cameraId\":\"...\",\"streamUrl\":\"rtsp://video-gateway:8554/cam-ahm-01\"}",
    "cam-sur-01": "{\"cameraId\":\"...\",\"streamUrl\":\"rtsp://video-gateway:8554/cam-sur-01\"}"
  }
  ```

### 6.2 Redis Pub/Sub (`gujcamera:control:camera-events`)
- Emits real-time lifecycle events:
  ```json
  {
    "action": "ACTIVATE",
    "cameraId": "f8a7b9c1-...",
    "streamUrl": "rtsp://video-gateway:8554/cam-sur-01",
    "pathName": "cam-sur-01"
  }
  ```

### 6.3 Dynamic Dispatcher Execution Flow
- **Startup:** Reads `gujcamera:registry:active-streams` and initiates `StreamConsumer` background threads for all registered cameras.
- **On ACTIVATE Event:**
  - If a consumer already exists with the same URL, it remains running.
  - If URL changed or consumer does not exist, spawns a new `StreamConsumer` thread targeting the normalized internal RTSP endpoint.
- **On DEACTIVATE Event:**
  - Signals the matching `StreamConsumer` thread to stop cleanly.
  - Releases video capture handles and removes thread reference.

---

## 7. Frontend Compatibility

- The frontend console consumes streams strictly via HLS (`http://<gateway>:8888/<path>/index.m3u8`).
- `resolveCameraStream()` in `frontend/lib/api/stream.ts` maps the camera's `url_or_handle` directly to HLS.
- Because `CameraStream.urlOrHandle` stores the normalized MediaMTX path, **zero frontend code changes were required**.
- Administrators and operators can view newly onboarded camera streams immediately in the Live CCTV Grid.

---

## 8. Automated Verification & Test Results

| Test Suite | Scope | Tests | Result |
| :--- | :--- | :---: | :---: |
| `media-gateway.service.spec.ts` | MediaMTX path registration, update, delete, health check, URL masking, error safety | 13 | 🟢 PASS |
| `cameras-dynamic-stream.spec.ts` | Camera creation lifecycle, MediaMTX integration, Redis events, error state handling | 5 | 🟢 PASS |
| `test_stream_dispatcher.py` | AI Worker dynamic stream spawning, teardown, Redis Pub/Sub events, startup sync | 7 | 🟢 PASS |
| Frontend Test Suites | Navigation, live player, health indicators, alert triage, investigation UI | 143 | 🟢 PASS |
| Backend TypeScript Build | Complete NestJS compilation (`npm run build`) | N/A | 🟢 PASS |
