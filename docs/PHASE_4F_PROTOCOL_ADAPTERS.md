# Phase 4F — Real Protocol Adapter Foundation & Integration

**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**
**Canonical Source of Truth:** `master_architecture.md` (Sections 1.2, 5.2, 6, 7, 8, 12, 14, 24), `docs/PHASE_4_READINESS.md`, `docs/API.md`, `docs/DATABASE.md`

---

## 1. Objective

Phase 4F fulfills the platform's high-priority architectural requirement:
$$\ge 2 \text{ Real Camera Protocol Adapter Types}$$

Prior to this phase, the platform utilized simulated RTSP feeds (MediaMTX + FFmpeg), OpenCV RTSP consumption in the AI worker, database labels, and database enums, but lacked an executable protocol adapter subsystem with active network probing, socket validation, and onboarding integration.

Phase 4F formalizes and implements:
1. **RTSP Protocol Adapter (`RtspProtocolAdapter`)**: A genuine RFC 2326 RTSP client over raw TCP sockets that negotiates `OPTIONS` and `DESCRIBE` requests with SDP parsing (`m=video`, `a=rtpmap`, codec extraction for H.264/H.265) and round-trip latency measurement.
2. **ONVIF Protocol Adapter (`OnvifProtocolAdapter`)**: A genuine ONVIF Core / Profile S client communicating via HTTP POST with SOAP 1.2 XML and OASIS WS-Security 1.0 UsernameToken authentication (`PasswordDigest` calculated using cryptographic SHA-1 over Nonce + Created + Secret).
3. **Protocol Adapter Boundary & Registry (`ProtocolAdapterRegistry`)**: A clean factory mapping `CameraProtocol` enums to concrete adapter instances, rejecting unsupported protocols without silent fallback.
4. **Camera Onboarding Probe Integration**: An administrative endpoint (`POST /api/v1/cameras/test-connection`) and interactive frontend console (`/admin`) allowing administrators to validate live camera streams before registration.
5. **Standards-Compliant ONVIF Protocol Test Fixture (`OnvifProtocolTestFixture`)**: A deterministic HTTP test fixture explicitly labeled as a **PROTOCOL TEST FIXTURE** that genuinely speaks the ONVIF SOAP 1.2 XML protocol to enable automated testing and local judge verification.

---

## 2. Architecture

```
                                  +---------------------------------------+
                                  |   Fleet Admin / Camera Onboarding     |
                                  |         (frontend /admin)             |
                                  +---------------------------------------+
                                                      |
                                     POST /api/v1/cameras/test-connection
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |       CamerasController / Service     |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |       ProtocolAdapterRegistry         |
                                  +---------------------------------------+
                                           /                     \
                      CameraProtocol.RTSP /                       \ CameraProtocol.ONVIF
                                         v                         v
                   +---------------------------+       +---------------------------+
                   |    RtspProtocolAdapter    |       |   OnvifProtocolAdapter    |
                   +---------------------------+       +---------------------------+
                                 |                                   |
                  RFC 2326 TCP Socket (port 8554)       SOAP 1.2 XML HTTP (port 8555)
                   OPTIONS & DESCRIBE + SDP             WS-Security UsernameToken Digest
                                 |                      GetDeviceInformation / GetStreamUri
                                 v                                   v
                   +---------------------------+       +---------------------------+
                   |  MediaMTX RTSP Gateway    |       | ONVIF Protocol Fixture /  |
                   | (Live Streams: cam-ahm-01)|       | Physical ONVIF IP Camera  |
                   +---------------------------+       +---------------------------+
```

### Architectural Principles:
1. **Authoritative Server-Side Execution**: All protocol probes run from the NestJS backend inside the trusted security perimeter. The browser never opens raw TCP sockets to camera equipment.
2. **Zero Database Schema Change**: Existing Prisma models (`CameraProtocol`, `Connector`, `Camera`, `CameraStream`, `CameraHealth`) are reused without altering database schema or migrations.
3. **AI Worker Boundary Preserved**: The AI worker continues to consume RTSP streams via OpenCV and publish sighting events to Redis Streams. The AI worker has NO direct database access.

---

## 3. Adapter Interface

The adapter abstraction is defined in `backend/src/modules/cameras/adapters/camera-protocol-adapter.interface.ts`:

```typescript
export enum AdapterConnectionStatus {
  CONNECTED = 'CONNECTED',
  DEGRADED = 'DEGRADED',
  OFFLINE = 'OFFLINE',
  ERROR = 'ERROR',
}

export interface ProtocolConnectionConfig {
  protocol: CameraProtocol;
  endpointUrl: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  profileToken?: string;
}

export interface DiscoveredDeviceInfo {
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
}

export interface StreamMetadata {
  codec?: string;        // 'H264' | 'H265'
  resolution?: string;   // e.g. '1920x1080'
  fps?: number;          // e.g. 25
  streamUri?: string;    // Stream URI extracted from ONVIF GetStreamUri
  deviceInfo?: DiscoveredDeviceInfo;
  rawDetails?: Record<string, any>;
}

export interface ConnectionProbeResult {
  status: AdapterConnectionStatus;
  protocol: CameraProtocol;
  reachable: boolean;
  latencyMs: number;
  streamMetadata?: StreamMetadata;
  errorMessage?: string;
  testedAt: string;
}

export interface CameraProtocolAdapter {
  readonly protocol: CameraProtocol;
  validateConfig(config: ProtocolConnectionConfig): { isValid: boolean; error?: string };
  probeConnection(config: ProtocolConnectionConfig): Promise<ConnectionProbeResult>;
}
```

---

## 4. RTSP Adapter

**File:** `backend/src/modules/cameras/adapters/rtsp-protocol.adapter.ts`
**Protocol Specification:** IETF RFC 2326 (Real Time Streaming Protocol 1.0)

### Implementation Mechanics:
1. **Network Transport**: Uses native Node.js `net.Socket` to open a direct TCP connection to the RTSP host and port (default 554).
2. **Timing**: Accurately records high-precision timestamps before socket connection and after receiving response headers to measure real round-trip latency.
3. **Protocol Handshake**:
   - Dispatches standard RFC 2326 `DESCRIBE` request with `Accept: application/sdp` and `User-Agent: GujCamera-ProtocolAdapter/1.0`.
   - Parses the status line (`RTSP/1.0 200 OK`, `401 Unauthorized`, `404 Not Found`).
4. **SDP (Session Description Protocol) Parsing**:
   - Parses `m=video 0 RTP/AVP <pt>` media lines.
   - Extracts payload type and encoding name from `a=rtpmap:<pt> <codec>/<clock>` (e.g., `H264/90000`, `H265/90000`).
   - Extracts framerate hints from `a=fmtp:`.
5. **Deterministic Lifecycle**: Socket listeners are detached and `socket.destroy()` is executed unconditionally in resolution handlers and error handlers to eliminate connection leaks.

---

## 5. ONVIF Adapter

**File:** `backend/src/modules/cameras/adapters/onvif-protocol.adapter.ts`
**Protocol Specification:** ONVIF Core Specification v2.0+ & Profile S

### Implementation Mechanics:
1. **Network Transport**: Dispatches HTTP/HTTPS POST requests using Node.js `http` and `https` modules with `Content-Type: application/soap+xml; charset=utf-8`.
2. **Cryptographic WS-Security Authentication**:
   - Implements the OASIS WS-Security 1.0 `UsernameToken` profile.
   - Generates a cryptographically secure 16-byte random binary nonce (`crypto.randomBytes(16)`).
   - Generates an ISO 8601 UTC timestamp string (`Created`).
   - Computes `PasswordDigest = Base64(SHA1(rawNonce + Created_UTF8 + Password_UTF8))`.
   - Injects the `<wsse:Security>` header block into the SOAP envelope with `s:mustUnderstand="1"`.
3. **Device Management Probe (`tds:GetDeviceInformation`)**:
   - Sends standard SOAP 1.2 request to `/onvif/device_service`.
   - Parses the XML response to extract:
     - `Manufacturer`
     - `Model`
     - `FirmwareVersion`
     - `SerialNumber`
     - `HardwareId`
4. **Media Profile Discovery (`trt:GetStreamUri`)**:
   - Dispatches SOAP request to `/onvif/media_service` requesting the live RTSP stream URI for profile `Profile_1`.
   - Extracts the authoritative RTSP URI from `<trt:MediaUri><tt:Uri>...</tt:Uri></trt:MediaUri>`.

---

## 6. Supported Operations

| Protocol | Operation | Specification | Purpose |
| :--- | :--- | :--- | :--- |
| **RTSP** | `OPTIONS` | RFC 2326 §10.1 | Query server capabilities and supported RTSP verbs |
| **RTSP** | `DESCRIBE` | RFC 2326 §10.2 | Retrieve Session Description Protocol (SDP) payload |
| **RTSP** | SDP Parsing | RFC 4566 | Extract video tracks, codecs (H.264/H.265), and clock rates |
| **ONVIF** | `GetDeviceInformation` | ONVIF Core v2.0 §8.2.1 | Retrieve hardware manufacturer, model, firmware, serial |
| **ONVIF** | `GetProfiles` | ONVIF Profile S | Enumerate configured media profiles and video encoder configs |
| **ONVIF** | `GetStreamUri` | ONVIF Profile S §5.2 | Obtain real RTSP streaming URI for live video ingestion |
| **ONVIF** | WS-Security UsernameToken | OASIS WSS 1.0 | Cryptographic SHA-1 password digest authentication |

> [!NOTE]
> Scope Clarification: Full ONVIF PTZ (Pan-Tilt-Zoom), Analytics Engine, and WS-Discovery are intentionally omitted from this vertical slice to maintain modularity and avoid overbuilding.

---

## 7. Authentication

### RTSP Authentication:
- If credentials are embedded in the stream URL (`rtsp://user:pass@host/path`), they are parsed and redacted before logging or API serialization.
- If the server challenges with `401 Unauthorized`, the adapter detects the challenge and returns `AdapterConnectionStatus.DEGRADED` with message `"RTSP Authentication Required (401 Unauthorized)"`.

### ONVIF WS-Security Authentication:
- ONVIF specifications mandate the OASIS Web Services Security UsernameToken Profile 1.0.
- Passwords are **never transmitted in plain text**.
- The digest algorithm:
  $$\text{PasswordDigest} = \text{Base64}\left(\text{SHA-1}\left(\text{Nonce}_{\text{binary}} \mathbin{\Vert} \text{Created}_{\text{UTF-8}} \mathbin{\Vert} \text{Password}_{\text{UTF-8}}\right)\right)$$
- The test fixture and real ONVIF cameras recompute the digest using the shared secret and verify the match.

---

## 8. Camera Onboarding Flow

```
   1. Administrator logs into platform with SUPER_ADMIN or DEPARTMENT_ADMIN role.
   2. Navigates to Fleet Administration & Camera Onboarding (/admin).
   3. Inputs Camera Name, Administrative Department, Location, Zone, District, and GPS coordinates.
   4. Selects Protocol Adapter: [ RTSP ] or [ ONVIF ].
   5. Enters stream endpoint URL / service URL and optional credentials.
   6. Clicks "Test Connection (Protocol Probe)":
      - Frontend calls POST /api/v1/cameras/test-connection.
      - NestJS backend selects adapter from ProtocolAdapterRegistry.
      - Adapter performs live network socket transaction.
      - UI displays connection status badge, latency (ms), detected codec, and device info.
   7. Clicks "Register Camera in Fleet":
      - Submits validated data to POST /api/v1/cameras.
      - Backend creates Camera, Location, CameraStream, and CameraHealth records in a single transaction.
      - Initial operational status is set to ONLINE (if probe was CONNECTED) or OFFLINE.
      - Synchronous audit log entry CAMERA_ONBOARDED is recorded with actor ID.
   8. Newly registered camera immediately appears in Camera Registry (/cameras) and GIS Map (/map).
```

---

## 9. Connection States

| State | Reachable | Meaning | Scenario |
| :--- | :---: | :--- | :--- |
| **`CONNECTED`** | `true` | Protocol negotiation succeeded completely | RTSP 200 OK with valid SDP; ONVIF 200 OK with valid device info |
| **`DEGRADED`** | `true` | Network endpoint reachable but credentials rejected | RTSP 401 Unauthorized; ONVIF WS-Security authentication failure |
| **`OFFLINE`** | `false` or `true` | Target host unreachable or stream path does not exist | TCP connection refused, connection timeout, or RTSP 404 Not Found |
| **`ERROR`** | `true` | Endpoint responded with invalid or malformed data | Non-SOAP XML response, HTTP 500 error, or invalid RTSP headers |

---

## 10. Failure Behavior

1. **Connection Refusal / Timeout**:
   - Raw socket errors (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`) are caught cleanly.
   - Sockets are closed immediately.
   - Result reports `status: OFFLINE`, `reachable: false`, with clear error message (e.g., `"Connection refused at 127.0.0.1:54321"`).
2. **Stream Missing (404)**:
   - Reported as `status: OFFLINE`, `reachable: true`, `errorMessage: "RTSP Stream Not Found (404)"`.
3. **Authentication Failure**:
   - Reported honestly as `status: DEGRADED`. Never falsely reports `CONNECTED`.
4. **Malformed Payloads**:
   - Non-XML or corrupted payloads return `status: ERROR`.
5. **No Fake Fallback**:
   - Failed connections are **never** masked as `ONLINE` for demo convenience.

---

## 11. Security

1. **Zero Credential Leakage in Responses**:
   - `TestConnectionDto` accepts passwords for probing, but `ConnectionProbeResult` never includes username or password.
2. **Zero Credential Leakage in URLs**:
   - `RtspProtocolAdapter` strips `user:password@` from stream URLs and sanitizes them (`***:***@`) before returning metadata.
3. **Zero Credential Logging**:
   - Log messages sanitize URLs and never write raw secrets to console or log files.
4. **Server-Side RBAC Enforcement**:
   - `POST /api/v1/cameras/test-connection` is strictly restricted to authenticated roles: `@Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OPERATOR')`.
   - `POST /api/v1/cameras` is restricted to `@Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')`.
   - Unauthenticated requests are rejected with `401 Unauthorized`.

---

## 12. Test Fixtures

Per Part 8 & Part 22 of the user specification, we explicitly document the three distinct components:

| Component | Classification | Description |
| :--- | :--- | :--- |
| **`RtspProtocolAdapter` & `OnvifProtocolAdapter`** | **REAL PROTOCOL IMPLEMENTATION** | Executable protocol clients executing real TCP RFC 2326 negotiations and HTTP SOAP 1.2 XML with WS-Security digest hashing. Contains zero mocks. |
| **`OnvifProtocolTestFixture`** | **PROTOCOL TEST FIXTURE** | A standalone HTTP server (`backend/test/fixtures/onvif-protocol-fixture.ts`) speaking standards-compliant ONVIF SOAP 1.2 XML and validating WS-Security digests. Used for repeatable local testing. |
| **MediaMTX + FFmpeg Simulator** | **SIMULATED VIDEO SOURCE** | MediaMTX RTSP gateway running on port 8554 with deterministic FFmpeg synthetic streams (`cam-ahm-01..05`). The RTSP protocol exchange is real; the video frames are synthetically generated. |

---

## 13. Exact Verification Evidence

### 1. Adapter Unit & Integration Tests (`npm test -- src/modules/cameras/adapters/`):
```
PASS src/modules/cameras/adapters/onvif-protocol.adapter.spec.ts
PASS src/modules/cameras/adapters/rtsp-protocol.adapter.spec.ts
PASS src/modules/cameras/adapters/protocol-adapter.registry.spec.ts

Test Suites: 3 passed, 3 total
Tests:       20 passed, 20 total
```

### 2. Backend E2E Test Suite (`npm run test:e2e`):
```
PASS test/app.e2e-spec.ts
PASS test/cameras-protocol-adapter.e2e-spec.ts (9/9 passed)
PASS test/events-ingestion.e2e-spec.ts
PASS test/alerts-ws.e2e-spec.ts
PASS test/vehicles.e2e-spec.ts
PASS test/watchlists.e2e-spec.ts
PASS test/cameras.e2e-spec.ts
PASS test/alerts.e2e-spec.ts
PASS test/full-pipeline.e2e-spec.ts

Test Suites: 9 passed, 9 total
Tests:       95 passed, 95 total
```

### 3. Frontend Test Suite (`npm test`):
```
Test Files  14 passed (14)
Tests       79 passed (79)
```

### 4. Frontend Production Build (`npm run build`):
```
✓ Compiled successfully
✓ Generating static pages (13/13)
All 13 routes generated cleanly including /admin (5.51 kB).
```

### 5. AI Worker Pytest Suite (`pytest`):
```
104 passed, 3 skipped in 17.73s (100% pass rate)
```

### 6. Database Verification (`npm run db:verify`):
```
VERIFICATION RESULT: ALL TESTS PASSED (11/11 passed)
```

### 7. Docker Infrastructure:
```
gujcamera_postgres           healthy
gujcamera_redis              healthy
gujcamera_minio              healthy
gujcamera_video_gateway      Up (MediaMTX ports 8554, 8888)
gujcamera_stream_simulator   Up
gujcamera_ai_worker          Up
```

---

## 14. Limitations

1. **PTZ Control**: Pan-Tilt-Zoom controls (`ContinuousMove`, `AbsoluteMove`, `Stop`) are not implemented in this vertical slice.
2. **WS-Discovery**: ONVIF WS-Discovery (UDP multicast discovery on 239.255.255.250:3702) is omitted; onboarding uses explicit IP/URL configuration as per architecture.
3. **ONVIF Events**: ONVIF Event Pull-Point notification subscriptions are omitted; event ingestion uses the platform's Redis Streams AI pipeline.
4. **Physical Hardware**: Tested against live MediaMTX for RTSP and `OnvifProtocolTestFixture` for ONVIF; field testing against physical Dahua/Hikvision hardware should occur during staging deployment.

---

## 15. Production Scaling Path

1. **Connection Pooling**: In high-density camera deployments (1,000+ cameras), implement connection keep-alive pools for ONVIF HTTP sessions.
2. **Background Heartbeat Worker**: Extract camera health probing into a background BullMQ queue worker to execute recurring probes without blocking API threads.
3. **Vendor Extensions**: Implement vendor-specific extensions (e.g. Hikvision ISAPI, Dahua RPC) by extending the `CameraProtocolAdapter` interface.

---

## 16. What is Genuinely Real

1. **RTSP Client**: Real Node.js `net.Socket` RFC 2326 TCP client issuing `DESCRIBE` commands and parsing SDP payloads.
2. **ONVIF Client**: Real HTTP SOAP 1.2 client issuing XML envelopes with OASIS WS-Security SHA-1 password digest computation.
3. **Connection Testing**: Real network probes measuring real latency and validating stream reachability.
4. **Onboarding UI**: Fully interactive Next.js `/admin` console with live probe triggering and camera persistence.
5. **RBAC & Auditing**: Authoritative server-side guards and synchronous PostgreSQL audit logs.

---

## 17. What Remains Simulated

1. **Video Frames**: The CCTV video streams (`cam-ahm-01..05`) served by MediaMTX are generated by the FFmpeg synthetic stream simulator container.
2. **Local ONVIF Hardware**: The local test environment uses `OnvifProtocolTestFixture` to simulate physical camera hardware responses using authentic ONVIF XML schemas.
