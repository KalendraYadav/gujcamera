# REST API Specification (Version 1.0)
**Gujarat Police Innovation Challenge 2026 — Unified CCTV Intelligence Platform**  
*Source of Truth: `master_architecture.md` (Section 8: API Contract)*

---

## 1. Global Conventions

* **Base URL Prefix**: `/api/v1`
* **Transport**: HTTPS (HTTP allowed in local development)
* **Authentication**: Bearer token via `Authorization: Bearer <JWT_ACCESS_TOKEN>`
* **Traceability**: All requests accept an optional `X-Request-Id: <uuid>` header. If omitted, the server automatically generates one and returns it in the response header and error payload.
* **Standard Error Schema**:
```json
{
  "error_code": "STRING_IDENTIFIER",
  "message": "Human readable explanation of the error",
  "request_id": "c1f7c320-3578-43db-b276-8094b9e25d21",
  "timestamp": "2026-09-09T07:30:00.000Z"
}
```
* **Pagination**: Standard cursor pagination using `?cursor=<id>&limit=20` (max limit: 100).
* **Role Hierarchy**:
  `SUPER_ADMIN` > `DEPARTMENT_ADMIN` > `INVESTIGATOR` > `OPERATOR` > `SYSTEM_AUDITOR` > `VIEWER`

---

## 2. Authentication & Session Endpoints

### 2.1 Login
* **Method & Path**: `POST /api/v1/auth/login`
* **Auth**: Public
* **Request Body**:
```json
{
  "email": "operator.demo@gujcamera.local",
  "password": "PoliceDemo@2026!"
}
```
* **Success Response** (`200 OK`):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
  "refresh_token": "dGhpcy1pcy1hLXJlZnJlc2gtdG9rZW4...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "7f8b9c10-1234-4567-89ab-cdef01234567",
    "email": "operator.demo@gujcamera.local",
    "role": "OPERATOR",
    "department_id": "11111111-2222-3333-4444-555555555555",
    "mfa_enabled": false
  }
}
```
* **Notable Errors**:
  * `401 Unauthorized`: `INVALID_CREDENTIALS` (Generic error to prevent user enumeration).
  * `429 Too Many Requests`: `RATE_LIMIT_EXCEEDED` (Lockout after 5 consecutive failures).
* **Audit**: Synchronous `USER_LOGIN_SUCCESS` or `USER_LOGIN_FAILURE`.

### 2.2 Refresh Token
* **Method & Path**: `POST /api/v1/auth/refresh`
* **Auth**: Public
* **Request Body**:
```json
{
  "refresh_token": "dGhpcy1pcy1hLXJlZnJlc2gtdG9rZW4..."
}
```
* **Success Response** (`200 OK`): Returns refreshed `access_token` and new `refresh_token`.

### 2.3 Current User Profile
* **Method & Path**: `GET /api/v1/auth/me`
* **Auth**: Authenticated (Any Role)
* **Success Response** (`200 OK`): Returns current user details, role permissions, and department info.

---

## 3. System & Analytics Endpoints

### 3.1 System Health Probe
* **Method & Path**: `GET /api/v1/health`
* **Auth**: Public
* **Success Response** (`200 OK`):
```json
{
  "status": "HEALTHY",
  "version": "0.1.0",
  "timestamp": "2026-09-09T07:30:00.000Z",
  "services": {
    "database": "CONNECTED",
    "postgis": "OPERATIONAL",
    "redis": "CONNECTED",
    "minio": "CONNECTED"
  }
}
```

### 3.2 Command Center Summary Dashboard
* **Method & Path**: `GET /api/v1/analytics/summary`
* **Auth**: Authenticated (Viewer+)
* **Success Response** (`200 OK`):
```json
{
  "total_cameras": 5,
  "cameras_online": 4,
  "cameras_degraded": 1,
  "cameras_offline": 0,
  "active_alerts_count": 1,
  "detections_last_24h": 1420,
  "watchlists_active_count": 3
}
```

---

## 4. Camera Registry & GIS Spatial Endpoints

### 4.1 List Cameras (with GIS Viewport & Filters)
* **Method & Path**: `GET /api/v1/cameras`
* **Auth**: Authenticated (`SUPER_ADMIN`, `DEPARTMENT_ADMIN`, `INVESTIGATOR`, `OPERATOR`, `SYSTEM_AUDITOR`, `VIEWER`)
* **Query Parameters**:
  * `bbox`: Bounding box formatted as `minLong,minLat,maxLong,maxLat` in WGS-84 decimal degrees (e.g. `72.45,22.98,72.60,23.08`). Evaluated server-side in PostgreSQL using native PostGIS GiST spatial indexing (`ST_Within(st_setsrid(st_makepoint(long, lat), 4326), ST_MakeEnvelope(...))`).
  * `status`: Filter by `OperationalStatus` (`ONLINE`, `CONNECTING`, `DEGRADED`, `OFFLINE`, `ERROR`).
  * `department_id`: Filter by owning department UUID.
  * `cursor`: UUID for keyset pagination.
  * `limit`: Items per page (default: 20, minimum: 1, maximum: 100).
  * `is_active`: Filter by active status (boolean, default: `true`). Decommissioned cameras are excluded by default.
* **Success Response** (`200 OK`):
```json
{
  "data": [
    {
      "id": "c1111111-0000-0000-0000-000000000001",
      "name": "CAM-AHM-01: SG Highway - Pakwan Crossroad Junction",
      "department_id": "d1111111-0000-0000-0000-000000000001",
      "department_name": "Ahmedabad City Police Commissionerate",
      "lat": 23.0338142,
      "long": 72.5073289,
      "protocol": "RTSP",
      "connector_type_id": "conn-001-uuid",
      "operational_status": "ONLINE",
      "is_active": true,
      "created_at": "2026-09-09T00:00:00.000Z",
      "updated_at": "2026-09-09T00:00:00.000Z",
      "location": {
        "address": "Pakwan Crossroad, Sarkhej - Gandhinagar Hwy, Bodakdev",
        "zone": "West Zone",
        "district": "Ahmedabad"
      },
      "streams": [
        {
          "id": "s1111111-0000-0000-0000-000000000001",
          "codec": "h264",
          "resolution": "1920x1080",
          "fps": 25,
          "url_or_handle": "rtsp://simulator:8554/live/cam-ahm-01"
        }
      ],
      "health": {
        "status": "ONLINE",
        "last_heartbeat": "2026-09-09T07:30:00.000Z",
        "fps_actual": 25,
        "packet_loss": 0
      }
    }
  ],
  "pagination": {
    "limit": 20,
    "total": 5,
    "next_cursor": "c1111111-0000-0000-0000-000000000005"
  }
}
```
* **Notable Errors**:
  * `400 Bad Request`: `INVALID_BBOX` (Bounding box string is malformed, coordinates outside WGS-84 ranges, or min exceeds max).
  * `401 Unauthorized`: Missing or invalid Bearer token.

---

### 4.2 Find Nearby Cameras (PostGIS Geodesic Proximity)
* **Method & Path**: `GET /api/v1/cameras/nearby`
* **Auth**: Authenticated (All Roles)
* **Query Parameters**:
  * `lat`: Center point latitude in WGS-84 decimal degrees (between `-90.0` and `90.0`).
  * `lng` (or `long`): Center point longitude in WGS-84 decimal degrees (between `-180.0` and `180.0`).
  * `radius`: **Proximity search radius in METERS** (e.g. `5000` = 5 km, `10000` = 10 km). Must be greater than 0 and maximum `500,000` meters (500 km).
  * `limit`: Maximum results to return (default: 20, max: 100).
* **Spatial Calculation**: Evaluated via PostGIS `ST_DWithin` and `ST_Distance` over WGS-84 `geography` type, performing true Great-Circle geodesic distance calculations on the spheroid (unit: **meters**). Results are strictly ordered ascending by distance.
* **Success Response** (`200 OK`):
```json
{
  "data": [
    {
      "id": "c1111111-0000-0000-0000-000000000002",
      "name": "CAM-AHM-02: C.G. Road - Swastik Char Rasta",
      "department_id": "d1111111-0000-0000-0000-000000000001",
      "lat": 23.035412,
      "long": 72.559281,
      "protocol": "ONVIF",
      "operational_status": "ONLINE",
      "is_active": true,
      "distance_meters": 1894.14,
      "location": {
        "address": "Swastik Cross Road, Chimanlal Girdharlal Rd, Navrangpura",
        "zone": "West Zone",
        "district": "Ahmedabad"
      }
    }
  ],
  "query": {
    "lat": 23.0225,
    "lng": 72.5714,
    "radius_meters": 10000,
    "unit": "meters"
  },
  "total": 1
}
```
* **Notable Errors**:
  * `400 Bad Request`: `INVALID_COORDINATES` (Latitude must be -90..90, Longitude must be -180..180).
  * `400 Bad Request`: `INVALID_RADIUS` (Radius must be a positive number between 1 and 500,000 meters).

---

### 4.3 Onboard New Camera
* **Method & Path**: `POST /api/v1/cameras`
* **Auth**: Authenticated (`SUPER_ADMIN`, `DEPARTMENT_ADMIN`)
  * `SUPER_ADMIN`: Can onboard cameras for any police department.
  * `DEPARTMENT_ADMIN`: Can strictly onboard cameras only for their own assigned department (`user.departmentId === body.department_id`).
* **Request Body**:
```json
{
  "name": "CAM-AHM-06: Iscon Crossroad Junction",
  "department_id": "d1111111-0000-0000-0000-000000000001",
  "lat": 23.0298410,
  "long": 72.5042180,
  "protocol": "RTSP",
  "connector_type_id": "c0000000-0000-0000-0000-000000000001",
  "operational_status": "ONLINE",
  "location": {
    "address": "Iscon Flyover Link, SG Highway",
    "zone": "West Zone",
    "district": "Ahmedabad"
  },
  "stream": {
    "codec": "h264",
    "resolution": "1920x1080",
    "fps": 25,
    "url_or_handle": "rtsp://simulator:8554/live/cam-ahm-06"
  }
}
```
* **Success Response** (`201 Created`): Returns created `Camera` object with generated UUID, location, stream, and initial health.
* **Notable Errors**:
  * `400 Bad Request`: `BAD_REQUEST` (Missing required fields, validation error, non-whitelisted property).
  * `400 Bad Request`: `DEPARTMENT_NOT_FOUND` / `CONNECTOR_NOT_FOUND`.
  * `403 Forbidden`: `DEPARTMENT_ACCESS_DENIED` (Department Admin attempted to create camera in a different department).
  * `409 Conflict`: `DUPLICATE_STREAM_ENDPOINT` (Stream URL or handle is already claimed by another camera).
* **Audit**: Synchronous `CAMERA_ONBOARDED` record stored in `audit_logs`.

---

### 4.4 Get Single Camera Deep-Dive
* **Method & Path**: `GET /api/v1/cameras/:id`
* **Auth**: Authenticated (All Roles)
* **Success Response** (`200 OK`): Returns complete camera record including location, streams, and operational health telemetry. Sensitive connector credentials and tokens are strictly excluded.
* **Notable Errors**:
  * `400 Bad Request`: `BAD_REQUEST` (Invalid UUID format).
  * `404 Not Found`: `CAMERA_NOT_FOUND` (Camera does not exist).

---

### 4.5 Update Camera
* **Method & Path**: `PATCH /api/v1/cameras/:id`
* **Auth**: Authenticated (`SUPER_ADMIN`, `DEPARTMENT_ADMIN`)
  * `DEPARTMENT_ADMIN`: Can only update cameras belonging to their own department.
* **Request Body** (Partial updates supported):
```json
{
  "name": "CAM-AHM-06: Iscon Flyover Link Updated",
  "operational_status": "DEGRADED",
  "location": {
    "address": "Iscon Flyover Link Updated, Bodakdev",
    "zone": "West Zone",
    "district": "Ahmedabad"
  }
}
```
* **Success Response** (`200 OK`): Returns updated camera record.
* **Notable Errors**:
  * `400 Bad Request`: Validation failure.
  * `403 Forbidden`: `DEPARTMENT_ACCESS_DENIED`.
  * `404 Not Found`: `CAMERA_NOT_FOUND`.
* **Audit**: Synchronous `CAMERA_UPDATED` record capturing before/after state diff.

---

### 4.6 Soft Decommission Camera
* **Method & Path**: `DELETE /api/v1/cameras/:id`
* **Auth**: Authenticated (`SUPER_ADMIN`, `DEPARTMENT_ADMIN`)
* **Behavior**: Soft-decommissions camera by setting `is_active = false` and `operational_status = 'OFFLINE'`. Preserves all historical telemetry, vehicle sightings, detections, and evidence intact.
* **Success Response** (`200 OK`):
```json
{
  "message": "Camera successfully decommissioned (soft deletion)",
  "id": "c1111111-0000-0000-0000-000000000006",
  "is_active": false,
  "operational_status": "OFFLINE"
}
```
* **Notable Errors**:
  * `403 Forbidden`: `DEPARTMENT_ACCESS_DENIED`.
  * `404 Not Found`: `CAMERA_NOT_FOUND`.
* **Audit**: Synchronous `CAMERA_DECOMMISSIONED` record stored in `audit_logs`.

---

### 4.7 Camera Health & Operational Telemetry
* **Method & Path**: `GET /api/v1/cameras/:id/health`
  * **Auth**: Authenticated (All Roles)
  * **Success Response** (`200 OK`):
  ```json
  {
    "camera_id": "c1111111-0000-0000-0000-000000000001",
    "name": "CAM-AHM-01: SG Highway - Pakwan Crossroad Junction",
    "operational_status": "ONLINE",
    "is_active": true,
    "health": {
      "status": "ONLINE",
      "last_heartbeat": "2026-09-09T07:30:00.000Z",
      "fps_actual": 25,
      "packet_loss": 0,
      "updated_at": "2026-09-09T07:30:00.000Z"
    }
  }
  ```
* **Method & Path**: `GET /api/v1/cameras/health/summary`
  * **Auth**: Authenticated (All Roles)
  * **Success Response** (`200 OK`):
  ```json
  {
    "total_cameras": 5,
    "online": 4,
    "degraded": 1,
    "offline": 0,
    "connecting": 0,
    "error": 0,
    "decommissioned": 0,
    "note": "Camera operational health derived from registered camera telemetry and heartbeats, independent of API/database infrastructure health"
  }
  ```

---

## 5. Vehicle Search & Investigation Endpoints

### 5.1 Vehicle Search (Prefix / Exact Match)
* **Method & Path**: `GET /api/v1/vehicles/search`
* **Auth**: Authenticated (`INVESTIGATOR`, `SUPER_ADMIN`)
* **Query Parameters**:
  * `q`: Search string (e.g., `GJ01AB` or `GJ01AB1234`).
  * `limit`: Results limit (default: 10).
* **Success Response** (`200 OK`):
```json
{
  "data": [
    {
      "plate_normalized": "GJ01AB1234",
      "first_seen": "2026-09-09T01:40:00.000Z",
      "last_seen": "2026-09-09T01:50:00.000Z",
      "attributes": { "color": "White", "make": "Hyundai", "model": "Creta" },
      "total_sightings": 2,
      "is_watchlisted": true
    }
  ]
}
```

### 5.2 Chronological Vehicle Timeline & GIS Route
* **Method & Path**: `GET /api/v1/vehicles/:plate/timeline`
* **Auth**: Authenticated (`INVESTIGATOR`, `SUPER_ADMIN`)
* **Query Parameters**:
  * `from`: Optional ISO timestamp start.
  * `to`: Optional ISO timestamp end.
* **Success Response** (`200 OK`):
```json
{
  "plate_normalized": "GJ01AB1234",
  "total_sightings": 2,
  "route_plausibility_score": 0.95,
  "sightings": [
    {
      "id": "vs-001-uuid",
      "camera_id": "cam-001-uuid",
      "camera_name": "CAM-AHM-01: SG Highway - Pakwan Crossroad Junction",
      "coordinates": { "lat": 23.0338142, "long": 72.5073289 },
      "timestamp": "2026-09-09T01:40:32.000Z",
      "confidence": 0.9450,
      "consensus_frames": 6,
      "frame_snapshot_url": "s3://police-evidence-vault/frames/..."
    },
    {
      "id": "vs-002-uuid",
      "camera_id": "cam-002-uuid",
      "camera_name": "CAM-AHM-02: C.G. Road - Swastik Char Rasta",
      "coordinates": { "lat": 23.0354120, "long": 72.5592810 },
      "timestamp": "2026-09-09T01:50:32.000Z",
      "confidence": 0.9620,
      "consensus_frames": 7,
      "frame_snapshot_url": "s3://police-evidence-vault/frames/..."
    }
  ],
  "route_segments": [
    {
      "from_camera_id": "cam-001-uuid",
      "to_camera_id": "cam-002-uuid",
      "distance_meters": 5320.4,
      "travel_time_seconds": 600,
      "estimated_speed_kmh": 31.9,
      "is_plausible": true,
      "segment_confidence": 0.9450
    }
  ]
}
```
* **Notable Errors**:
  * `404 Not Found`: `VEHICLE_NOT_FOUND` (Plate has never been observed by the system).
* **Audit**: Synchronous `VEHICLE_TIMELINE_SEARCH` (Sensitive investigative read).

---

## 6. Watchlist & Alert Management Endpoints

### 6.1 List Watchlists
* **Method & Path**: `GET /api/v1/watchlist`
* **Auth**: Authenticated (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Success Response** (`200 OK`): Returns array of active watchlist groups and entry counts.

### 6.2 Add Plate to Watchlist
* **Method & Path**: `POST /api/v1/watchlist/:id/entries`
* **Auth**: Authenticated (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Request Body**:
```json
{
  "plate": "GJ01XY9999",
  "category": "STOLEN_VEHICLE",
  "reason": "Red Fortuner reported stolen from Prahladnagar - FIR #204/2026",
  "priority": "CRITICAL",
  "expires_at": "2026-10-09T00:00:00.000Z"
}
```
* **Success Response** (`201 Created`): Returns created `WatchlistEntry`.
* **Audit**: Synchronous `WATCHLIST_ENTRY_CREATED`.

### 6.3 List Live Alerts
* **Method & Path**: `GET /api/v1/alerts`
* **Auth**: Authenticated (`OPERATOR`, `INVESTIGATOR`, `SUPER_ADMIN`)
* **Query Parameters**:
  * `status`: Filter by `AlertStatus` (`NEW`, `ACKNOWLEDGED`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`).
  * `severity`: Filter by `AlertSeverity` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
  * `cursor`, `limit`.
* **Success Response** (`200 OK`): Returns ordered alerts with linked sighting metadata and matching watchlist rationale.

### 6.4 Transition Alert Status (State Machine Enforcement)
* **Method & Path**: `PATCH /api/v1/alerts/:id/status`
* **Auth**: Authenticated (`OPERATOR`, `INVESTIGATOR`)
* **Request Body**:
```json
{
  "status": "ACKNOWLEDGED",
  "reason": "Operator confirmed plate read matches visual crop"
}
```
* **State Transition Rules (Enforced Server-Side)**:
  * `NEW` ➔ `ACKNOWLEDGED` (Operator)
  * `NEW` ➔ `DISMISSED` (Operator — False Positive)
  * `ACKNOWLEDGED` ➔ `INVESTIGATING` (Investigator)
  * `ACKNOWLEDGED` ➔ `DISMISSED` (Investigator)
  * `INVESTIGATING` ➔ `RESOLVED` (Investigator)
  * `INVESTIGATING` ➔ `DISMISSED` (Investigator)
* **Success Response** (`200 OK`): Returns updated `Alert` record.
* **Notable Errors**:
  * `409 Conflict`: `INVALID_STATE_TRANSITION` (e.g., trying to transition `RESOLVED` back to `NEW`).
* **Audit**: Synchronous `ALERT_STATUS_TRANSITION`.

---

## 7. Evidence & Compliance Endpoints

### 7.1 Get Evidence Metadata
* **Method & Path**: `GET /api/v1/evidence/:id`
* **Auth**: Authenticated (`INVESTIGATOR`, `SYSTEM_AUDITOR`, `SUPER_ADMIN`)
* **Success Response** (`200 OK`): Returns evidence record with MinIO presigned URL, capture timestamp, and SHA-256 hash.
* **Audit**: Synchronous `EVIDENCE_VIEWED`.

### 7.2 Verify Evidence Integrity
* **Method & Path**: `POST /api/v1/evidence/:id/verify`
* **Auth**: Authenticated (`INVESTIGATOR`, `SYSTEM_AUDITOR`, `SUPER_ADMIN`)
* **Success Response** (`200 OK`):
```json
{
  "evidence_id": "ev-001-uuid",
  "stored_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "computed_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "is_tamper_free": true,
  "verified_at": "2026-09-09T07:30:00.000Z"
}
```
* **Audit**: Synchronous `EVIDENCE_INTEGRITY_VERIFIED`.

### 7.3 Compliance Audit Log Feed
* **Method & Path**: `GET /api/v1/audit`
* **Auth**: Authenticated (`SYSTEM_AUDITOR`, `SUPER_ADMIN`)
* **Query Parameters**:
  * `resource`: Filter by affected table (e.g. `User`, `WatchlistEntry`, `Alert`, `Camera`).
  * `actor_id`: Filter by actor UUID.
  * `from`, `to`, `cursor`, `limit`.
* **Success Response** (`200 OK`): Returns immutable audit records with before/after state diffs.
