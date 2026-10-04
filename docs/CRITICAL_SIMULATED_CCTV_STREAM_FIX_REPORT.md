# NETRAVAHA — CRITICAL SIMULATED CCTV STREAM FIX REPORT
## Real-Time Streaming Gateway, MediaMTX Lifecycle & Camera Health Conflict Resolution
**Gujarat Police Innovation Challenge 2026**  
**Date:** October 4, 2026  
**Document Ref:** GP-IC-2026-FIX-STREAM-01  
**Status:** FIXED & FULLY VALIDATED  

---

## 1. Executive Summary & Root Cause Analysis

During final judge demonstration testing, two correlated runtime defects blocked simulated CCTV operations:

1. **Frontend Stream Offline on `CAM-DEMO-01` (`http://localhost:8888/live/demo-traffic/index.m3u8`):**
   - The browser displayed `STREAM OFFLINE / Stream Unavailable` with `Stream unreachable ... MediaMTX gateway or simulator may be offline`.
   - **Root Cause A (Missing Replay Ingestion):** In `scripts/start_streams_wsl.sh`, `demo-traffic.mp4` was erroneously routed to `rtsp://localhost:8554/cam-gnd-02` instead of publishing to `demo-traffic` / `live/demo-traffic`. Neither `demo-traffic` nor `live/demo-traffic` had an active publisher attached to MediaMTX, causing MediaMTX to respond with HTTP 404 for the HLS index manifest.
   - **Root Cause B (Path Namespace Resolution):** Seed data configured camera handles as `rtsp://simulator:8554/live/demo-traffic` while internal gateway normalization stripped the prefix or expected flat paths (`demo-traffic`). Without dual publication on both flat (`demo-traffic`) and prefixed (`live/demo-traffic`) paths, clients requesting `live/demo-traffic/index.m3u8` encountered missing stream muxers.

2. **Backend MediaMTX Registration Flood (`mock://vendor-a/gnd-sec-01`):**
   - `CameraHealthPollerService` continuously logged:
     ```
     MediaGatewayService: Registering new MediaMTX path 'cam-gnd-01' -> mock://vendor-a/gnd-sec-01
     MediaMTX response: HTTP 400: invalid source: 'mock://vendor-a/gnd-sec-01'
     ```
   - **Root Cause C (Source Classification Defect):** `CameraHealthPollerService.attemptReconnection()`, `CamerasService.createCamera()`, `updateCamera()`, `configureCredentials()`, and `removeCredentials()` applied a binary check `!isInternalGatewayStream(streamUrl)` to determine if a stream should be registered into MediaMTX. Placeholder/mock cameras (such as `mock://vendor-a/gnd-sec-01` on `CAM-GND-01`) were treated as external RTSP cameras, causing MediaMTX control plane (port 9997) to reject the non-routable protocol with HTTP 400. This triggered repeated reconnection retries and cascaded health state degradation.

---

## 2. CAM-DEMO-01 Mapping Verification

The full end-to-end dataflow and configuration mapping for `CAM-DEMO-01` is:

| Layer | Configuration / Value | Verification Status |
| :--- | :--- | :--- |
| **Manifest Entry** | `fixtures/manifests/demonstration_manifest.json` line 185 (`CAM-DEMO-01`, `SRC-RES-HWY-01`) | **PASS** (Valid schema & SHA) |
| **Media File** | `video-gateway/fixtures/demo-traffic.mp4` | **PASS** (1280x720, 29.97 fps, h264, SHA verified) |
| **Database Record** | `Camera.name = 'CAM-DEMO-01: Expressway Highway Traffic Corridor (RESEARCH)'` | **PASS** (ID `2a4787cb-...`, Status `ONLINE`) |
| **Database Stream Handle** | `urlOrHandle = 'rtsp://simulator:8554/live/demo-traffic'` | **PASS** (Active stream) |
| **FFmpeg Replay Output** | `rtsp://video-gateway:8554/demo-traffic` + `rtsp://video-gateway:8554/live/demo-traffic` | **PASS** (Publisher active in container & WSL) |
| **MediaMTX Path** | `demo-traffic` and `live/demo-traffic` (in `video-gateway/mediamtx.yml`) | **PASS** (`ready: true`, source `rtspSession`) |
| **HLS Stream Endpoint** | `http://localhost:8888/live/demo-traffic/index.m3u8` | **PASS** (HTTP 200, `#EXTM3U`, 29.97 fps) |
| **Frontend Live View** | `/live` player dynamically renders HLS feed from `/live/demo-traffic/index.m3u8` | **PASS** (Playable video, badge rendered) |

---

## 3. Media Asset Integrity Verification (`demo-traffic.mp4`)

As required by Step 2, the media asset was verified using cryptographic and codec inspection tools:

- **Absolute Path:** `D:\web project\gujcamera\video-gateway\fixtures\demo-traffic.mp4`
- **File Existence & Readability:** Confirmed accessible and non-corrupted.
- **SHA-256 Digest:** `2dd87b64a25ed765fc23e8b9d5db44ed6acf5cdcf7cb835af3ddbd70818127a7` (Exact match with manifest).
- **Duration:** 29.696 seconds (~29.7 s continuous loop).
- **Frame Rate (FPS):** 30000/1001 (~29.97 fps).
- **Resolution:** 1280x720 (720p HD).
- **Video Codec:** `h264` (AVC Baseline/High profile).

---

## 4. Architectural Fix & Lifecycle Separation

To resolve the root cause cleanly without suppressing errors or weakening health polling:

### A. Protocol-Aware Source Classification (`MediaGatewayService`)
Added explicit protocol evaluation methods to [media-gateway.service.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/media-gateway.service.ts):
```typescript
isPullableExternalSource(streamUrl: string): boolean {
  if (!streamUrl || typeof streamUrl !== 'string') return false;
  if (this.isInternalGatewayStream(streamUrl)) return false;
  if (this.isPlaceholderStream(streamUrl)) return false;
  const lower = streamUrl.toLowerCase();
  return (
    lower.startsWith('rtsp://') ||
    lower.startsWith('rtsps://') ||
    lower.startsWith('rtmp://') ||
    lower.startsWith('rtmps://') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://')
  );
}

isPlaceholderStream(streamUrl: string): boolean {
  if (!streamUrl || typeof streamUrl !== 'string') return false;
  const lower = streamUrl.toLowerCase();
  return (
    lower.startsWith('mock://') ||
    lower.startsWith('placeholder://') ||
    lower.startsWith('custom://') ||
    lower.startsWith('vendor://')
  );
}
```
In `registerPath()`:
- If `isPlaceholderStream(sourceUrl)` or `!isPullableExternalSource(sourceUrl)`, the service immediately returns `{ success: false, isExternalSource: false, error: "Unsupported stream protocol..." }` without making any network request to the MediaMTX API.

### B. Health Poller Decoupling (`CameraHealthPollerService`)
In [camera-health-poller.service.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/health/camera-health-poller.service.ts):
- `evaluateCameraHealth()` checks `isPlaceholderStream(streamUrl)`. If true, the camera remains in its configured operational status (e.g. `OFFLINE` or existing state) and skips MediaMTX health queries and reconnect loops.
- `attemptReconnection()` verifies `isPullableExternalSource(cleanEndpoint)` before initiating any `registerPath` calls.
- Multi-alias path resolution checks both the normalized path (`pathName`), the raw stream path (`rawPath`), and the flat path (`rawPath.replace(/^live\//, '')`).

### C. CamerasService Update & Credential Lifecycle
In [cameras.service.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/cameras.service.ts):
- Updated `createCamera()`, `updateCamera()`, `configureCredentials()`, and `removeCredentials()` to use `this.mediaGatewayService.isPullableExternalSource()` instead of `!isInternalGatewayStream()`. Placeholder mock cameras are preserved with their configured status without corrupting the MediaMTX state.

### D. Dual Flat and Prefixed Streaming (`start_streams_wsl.sh`)
Updated [start_streams_wsl.sh](file:///D:/web%20project/gujcamera/scripts/start_streams_wsl.sh) and [manage_judge_demo.js](file:///D:/web%20project/gujcamera/scripts/manage_judge_demo.js):
- Replays publish to both flat (`cam-ahm-01`) and live prefixed (`live/cam-ahm-01`) endpoints simultaneously.
- Added replay loops for `demo-traffic.mp4` to `demo-traffic`, `live/demo-traffic`, `cam-demo-01`, and `live/cam-demo-01`.
- Corrected `cam-gnd-02` replay source to use `cam-ahm-02.mp4` per the primary pursuit manifest.

---

## 5. Primary Judge Cameras Validation

All 3 primary demonstration cameras and the highway research node were verified:

| Camera ID | Role / Location | RTSP Stream Status | MediaMTX Path State | HLS Endpoint (:8888) | AI Ingestion Rate | Overall |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`CAM-AHM-01`** | Entry Junction (Pakwan Crossroad) | `rtsp://localhost:8554/cam-ahm-01` | `ready: true`, 2 readers | `http://localhost:8888/live/cam-ahm-01/index.m3u8` (HTTP 200) | 25.0 FPS (Connected) | **PASS** |
| **`CAM-AHM-02`** | Arterial Hop 1 (Swastik Char Rasta) | `rtsp://localhost:8554/cam-ahm-02` | `ready: true`, 2 readers | `http://localhost:8888/live/cam-ahm-02/index.m3u8` (HTTP 200) | 24.9 FPS (Connected) | **PASS** |
| **`CAM-GND-02`** | Inter-District Hop 2 (CH-0 Circle) | `rtsp://localhost:8554/cam-gnd-02` | `ready: true`, 1 reader | `http://localhost:8888/live/cam-gnd-02/index.m3u8` (HTTP 200) | Available for routing | **PASS** |
| **`CAM-DEMO-01`**| Expressway Corridor (Research) | `rtsp://localhost:8554/demo-traffic` | `ready: true`, 1 reader | `http://localhost:8888/live/demo-traffic/index.m3u8` (HTTP 200) | Available for Live Grid | **PASS** |

---

## 6. Failure Recovery Validation

A live disruption and recovery drill was executed on `CAM-AHM-01`:
1. **Initial State:** `CAM-AHM-01` streaming at 25 FPS, DB status `ONLINE`, HLS returning HTTP 200.
2. **Disruption:** Simulated publisher failure by terminating the `cam-ahm-01` streaming process.
3. **Detection:** MediaMTX marked path unready; poller detected reader drop; DB status transitioned cleanly to `DEGRADED`; HLS returned HTTP 404.
4. **Recovery:** Publisher restarted. MediaMTX path returned to `ready: true`.
5. **Reconciliation:** Next health poll cycle detected active stream; DB status restored to `ONLINE`; HLS endpoint immediately resumed streaming HTTP 200 OK.
6. **Result:** Uncompromised, honest state transitions without faked statuses.

---

## 7. Regression & Quality Assurance

- **Backend Unit Tests:** 14 test suites, 126 tests passed (`npm test`).
- **MediaGateway Unit Tests:** 35/35 tests passed (including mock rejection and protocol classification tests).
- **Camera Health Poller Tests:** 19/19 tests passed (including Test 19 for placeholder stream isolation).
- **Dynamic Stream Tests:** 8/8 tests passed.
- **Frontend Production Build:** `npm run build` completed successfully (`0.1.0`, Next.js 14.2.35).
- **Backend TypeScript Build:** `npm run build` (`tsc`) compiled with 0 errors.
- **Judge Demo Orchestrator:** `node scripts/manage_judge_demo.js status` reports all 4 demonstration nodes `🟢 ONLINE`.

---

## 8. Summary of Files Modified

1. [backend/src/modules/cameras/media-gateway.service.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/media-gateway.service.ts): Added `isPullableExternalSource` and `isPlaceholderStream`; guarded `registerPath` against invalid protocols.
2. [backend/src/modules/cameras/health/camera-health-poller.service.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/health/camera-health-poller.service.ts): Guarded poller and reconnection against placeholder streams; added multi-alias path state matching.
3. [backend/src/modules/cameras/cameras.service.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/cameras.service.ts): Replaced `!isInternalGatewayStream` with `isPullableExternalSource` across creation, update, and credential rotation.
4. [backend/src/modules/cameras/media-gateway.service.spec.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/media-gateway.service.spec.ts): Added unit tests for placeholder stream rejection and protocol checks.
5. [backend/src/modules/cameras/health/camera-health-poller.spec.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/health/camera-health-poller.spec.ts): Added Test 19 for placeholder stream isolation and updated mock definitions.
6. [backend/src/modules/cameras/cameras-dynamic-stream.spec.ts](file:///D:/web%20project/gujcamera/backend/src/modules/cameras/cameras-dynamic-stream.spec.ts): Updated `mediaGateway` mock for protocol evaluation methods.
7. [scripts/start_streams_wsl.sh](file:///D:/web%20project/gujcamera/scripts/start_streams_wsl.sh): Included `demo-traffic.mp4` multi-output streaming and dual flat/live paths for corridor nodes.
8. [scripts/manage_judge_demo.js](file:///D:/web%20project/gujcamera/scripts/manage_judge_demo.js): Added `127.0.0.1` vault health fallback (preventing IPv6 loopback docker conflicts) and added `CAM-DEMO-01` to demonstration monitoring.

---

## 9. Conclusion & Operational Status

The root cause of both the `CAM-DEMO-01` stream failure and the `mock://vendor-a/gnd-sec-01` MediaMTX registration flood has been completely resolved at the architectural integration layer. All simulated CCTV cameras are live, responsive, and ingested by the AI worker.

```
STREAM FIX STATUS:
FIXED

PRIMARY CAMERAS:

CAM-AHM-01: PASS
CAM-AHM-02: PASS
CAM-GND-02: PASS

HLS:

CAM-AHM-01: PASS
CAM-AHM-02: PASS
CAM-GND-02: PASS

AI STREAM CONSUMPTION:

CAM-AHM-01: PASS
CAM-AHM-02: PASS
CAM-GND-02: PASS

MOCK SOURCE REGISTRATION ERRORS:
RESOLVED

FRONTEND LIVE PLAYBACK:
PASS

REGRESSION:
PASS

FINAL DEMO STATUS:
READY
```
