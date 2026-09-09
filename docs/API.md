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

### 5.0 Department Authorization & Cross-Department Investigation Architecture Rule
* **Architectural Rule**: Cross-Department Unified Intelligence Access (Rule A & C).
* **Architectural Justification (`master_architecture.md` §3.1, §3.2, §6.2, §14.2)**:
  * **Core Problem Statement**: Per `master_architecture.md` §3.1, Gujarat's 80,000+ cameras were historically fragmented across departmental and jurisdictional silos. A sighting on one camera could not be linked across jurisdictions, hindering investigations of stolen or fleeing vehicles where minutes matter.
  * **Entity Model**: The `Vehicle` entity represents a physical, mobile object traversing jurisdictions and carries no `department_id` in the canonical data schema (`master_architecture.md` §6.2). `VehicleSighting` records an observation event at a specific `Camera`.
  * **Role-Based Access Control (RBAC)**: All vehicle investigation endpoints (`/vehicles`, `/vehicles/:plate`, `/vehicles/:plate/sightings`, `/vehicles/:plate/timeline`) are restricted to authorized investigative roles (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`). Non-investigative roles (`OPERATOR`, `VIEWER`, `SYSTEM_AUDITOR`) are rejected server-side with `403 FORBIDDEN_RESOURCE`.
  * **Cross-Department Visibility**: An authorized `INVESTIGATOR` possesses state-wide visibility across cameras owned by different departments (e.g., Ahmedabad City Police and Gandhinagar District Police) to enable cross-district route reconstruction. Artificial department isolation on vehicle tracking is explicitly prohibited by the architecture as it defeats the primary mission of the unified platform.
  * **Optional Department Scoping**: Investigators may optionally filter sightings to a specific department by providing `?department_id=<UUID>` in query parameters.
  * **Accountability via Synchronous Auditing**: Every sensitive investigative read (`VEHICLE_SEARCH`, `VEHICLE_DETAIL_VIEW`, `VEHICLE_SIGHTINGS_VIEW`, `VEHICLE_TIMELINE_SEARCH`) is synchronously logged to `audit_logs` with actor ID, timestamp, plate, and search parameters.

### 5.1 Vehicle Search (Prefix / Exact Match / Time Range)
* **Method & Path**: `GET /api/v1/vehicles` & `GET /api/v1/vehicles/search`
* **Auth**: Authenticated (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Query Parameters**:
  * `q` (or `plate`): Search string (e.g. `GJ01AB` or `GJ01AB1234`). Automatically normalized (spaces, hyphens, and casing stripped).
  * `from`: Optional ISO-8601 timestamp start (`gte` on `last_seen`).
  * `to`: Optional ISO-8601 timestamp end (`lte` on `last_seen`).
  * `limit`: Results per page (default: 20, max: 100).
  * `page`: Page number (1-indexed, default: 1).
* **Success Response** (`200 OK`):
```json
{
  "data": [
    {
      "plate_normalized": "GJ01AB1234",
      "first_seen": "2026-09-09T01:40:00.000Z",
      "last_seen": "2026-09-09T01:50:00.000Z",
      "attributes": { "color": "White", "make": "Hyundai", "model": "Creta", "type": "SUV" },
      "total_sightings": 2,
      "is_watchlisted": true,
      "watchlist_category": "STOLEN_VEHICLE",
      "watchlist_priority": "CRITICAL"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "total_pages": 1
  }
}
```
* **Notable Errors**:
  * `400 Bad Request`: `BAD_REQUEST` (Malformed timestamp or invalid pagination parameter).
  * `401 Unauthorized`: Missing or invalid Bearer token.
  * `403 Forbidden`: `FORBIDDEN_RESOURCE` (Role lacking investigation privileges, e.g., `OPERATOR` or `VIEWER`).
* **Audit**: Synchronous `VEHICLE_SEARCH` record stored in `audit_logs`.

---

### 5.2 Single Vehicle Deep-Dive Record
* **Method & Path**: `GET /api/v1/vehicles/:plate`
* **Auth**: Authenticated (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Path Parameters**:
  * `plate`: Vehicle license plate string (e.g., `GJ01AB1234` or `gj-01-ab-1234`).
* **Success Response** (`200 OK`):
```json
{
  "plate_normalized": "GJ01AB1234",
  "first_seen": "2026-09-09T01:40:00.000Z",
  "last_seen": "2026-09-09T01:50:00.000Z",
  "attributes": { "color": "White", "make": "Hyundai", "model": "Creta", "type": "SUV" },
  "total_sightings": 2,
  "is_watchlisted": true,
  "watchlist_details": {
    "category": "STOLEN_VEHICLE",
    "priority": "CRITICAL",
    "reason": "White Hyundai Creta reported stolen from Vastrapur - FIR #102/2026",
    "flagged_at": "2026-09-09T00:00:00.000Z"
  },
  "first_known_sighting": {
    "id": "vs-001-uuid",
    "timestamp": "2026-09-09T01:40:32.000Z",
    "camera_name": "CAM-AHM-01: SG Highway - Pakwan Crossroad Junction",
    "location": "Pakwan Crossroad, Sarkhej - Gandhinagar Hwy, Bodakdev",
    "district": "Ahmedabad"
  },
  "last_known_sighting": {
    "id": "vs-002-uuid",
    "timestamp": "2026-09-09T01:50:32.000Z",
    "camera_name": "CAM-AHM-02: C.G. Road - Swastik Char Rasta",
    "location": "Swastik Cross Road, Chimanlal Girdharlal Rd, Navrangpura",
    "district": "Ahmedabad"
  }
}
```
* **Notable Errors**:
  * `404 Not Found`: `VEHICLE_NOT_FOUND` (Plate has never been observed by the system).
* **Audit**: Synchronous `VEHICLE_DETAIL_VIEW` record stored in `audit_logs`.

---

### 5.3 Vehicle Sighting History
* **Method & Path**: `GET /api/v1/vehicles/:plate/sightings`
* **Auth**: Authenticated (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Query Parameters**:
  * `from`: Filter sightings on or after ISO timestamp.
  * `to`: Filter sightings on or before ISO timestamp.
  * `camera_id`: Filter sightings captured by specific Camera UUID.
  * `department_id`: Filter sightings captured by cameras belonging to specified Department UUID.
  * `sort`: Sighting timestamp sort order (`asc` = chronological, `desc` = newest first, default: `asc`).
  * `limit`: Results per page (default: 20, max: 100).
  * `page`: Page number (default: 1).
* **Success Response** (`200 OK`):
```json
{
  "plate_normalized": "GJ01AB1234",
  "data": [
    {
      "id": "vs-001-uuid",
      "plate_normalized": "GJ01AB1234",
      "timestamp": "2026-09-09T01:40:32.000Z",
      "confidence": 0.9450,
      "consensus_frames": 6,
      "frame_ref": "s3://police-evidence-vault/frames/2026/09/09/cam-ahm-01-gj01ab1234-sighting1.jpg",
      "camera_id": "c1111111-0000-0000-0000-000000000001",
      "camera_name": "CAM-AHM-01: SG Highway - Pakwan Crossroad Junction",
      "department_id": "d1111111-0000-0000-0000-000000000001",
      "department_name": "Ahmedabad City Police Commissionerate",
      "coordinates": {
        "lat": 23.0338142,
        "long": 72.5073289
      },
      "location": {
        "address": "Pakwan Crossroad, Sarkhej - Gandhinagar Hwy, Bodakdev",
        "zone": "West Zone",
        "district": "Ahmedabad"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "total_pages": 1
  }
}
```
* **Notable Errors**:
  * `404 Not Found`: `VEHICLE_NOT_FOUND`.
* **Audit**: Synchronous `VEHICLE_SIGHTINGS_VIEW` record stored in `audit_logs`.

---

### 5.4 Chronological Vehicle Timeline & GIS Route Reconstruction
* **Method & Path**: `GET /api/v1/vehicles/:plate/timeline` & `GET /api/v1/vehicles/:plate/route`
* **Auth**: Authenticated (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Query Parameters**:
  * `from`: Optional ISO timestamp start.
  * `to`: Optional ISO timestamp end.
  * `max_speed_kmh`: PoC heuristic speed threshold for plausibility validation (default: 150 km/h).
* **Route Calculation & Plausibility Model**:
  * Consecutive observations are sorted chronologically (`ts ASC`).
  * Distances between consecutive cameras are calculated using PostGIS native WGS-84 `geography` Great-Circle distance (`ST_Distance(point1, point2)` in **meters**).
  * Travel time between sightings is calculated in **seconds**.
  * Implied average velocity is computed in **km/h** (`(meters / 1000) / (seconds / 3600)`).
  * If implied velocity exceeds the threshold or indicates a simultaneous observation at distinct locations (0s elapsed, >50m distance), the hop is flagged as `is_plausible: false` and `plausibility_status: 'REQUIRES_REVIEW'`.
  * Hop confidence follows `master_architecture.md` Section 10: `min(confidence_A, confidence_B, plausibility_score)`.
* **Success Response** (`200 OK`):
```json
{
  "plate_normalized": "GJ01AB1234",
  "total_sightings": 2,
  "route_plausibility_score": 1.0,
  "sightings": [
    {
      "id": "vs-001-uuid",
      "timestamp": "2026-09-09T01:40:32.000Z",
      "camera_id": "c1111111-0000-0000-0000-000000000001",
      "camera_name": "CAM-AHM-01: SG Highway - Pakwan Crossroad Junction",
      "coordinates": { "lat": 23.0338142, "long": 72.5073289 },
      "location": {
        "address": "Pakwan Crossroad, Sarkhej - Gandhinagar Hwy, Bodakdev",
        "zone": "West Zone",
        "district": "Ahmedabad"
      },
      "confidence": 0.9450,
      "consensus_frames": 6,
      "frame_ref": "s3://police-evidence-vault/frames/..."
    },
    {
      "id": "vs-002-uuid",
      "timestamp": "2026-09-09T01:50:32.000Z",
      "camera_id": "c1111111-0000-0000-0000-000000000002",
      "camera_name": "CAM-AHM-02: C.G. Road - Swastik Char Rasta",
      "coordinates": { "lat": 23.0354120, "long": 72.5592810 },
      "location": {
        "address": "Swastik Cross Road, Chimanlal Girdharlal Rd, Navrangpura",
        "zone": "West Zone",
        "district": "Ahmedabad"
      },
      "confidence": 0.9620,
      "consensus_frames": 7,
      "frame_ref": "s3://police-evidence-vault/frames/..."
    }
  ],
  "route_segments": [
    {
      "from_camera_id": "c1111111-0000-0000-0000-000000000001",
      "from_camera_name": "CAM-AHM-01: SG Highway - Pakwan Crossroad Junction",
      "from_coordinates": { "lat": 23.0338142, "long": 72.5073289 },
      "from_timestamp": "2026-09-09T01:40:32.000Z",
      "to_camera_id": "c1111111-0000-0000-0000-000000000002",
      "to_camera_name": "CAM-AHM-02: C.G. Road - Swastik Char Rasta",
      "to_coordinates": { "lat": 23.0354120, "long": 72.5592810 },
      "to_timestamp": "2026-09-09T01:50:32.000Z",
      "distance_meters": 5320.4,
      "elapsed_seconds": 600,
      "estimated_speed_kmh": 31.92,
      "is_plausible": true,
      "plausibility_status": "PLAUSIBLE",
      "plausibility_reason": "Plausible observed transit of 31.92 km/h over 5320.4m",
      "segment_confidence": 0.9450
    }
  ],
  "summary": {
    "total_distance_meters": 5320.4,
    "total_elapsed_seconds": 600,
    "average_speed_kmh": 31.92,
    "hops_count": 1,
    "implausible_hops_count": 0
  },
  "disclaimer": "Observed movement between camera observations; does not represent an exact physical driving route or turn-by-turn navigation."
}
```
* **Notable Errors**:
  * `404 Not Found`: `VEHICLE_NOT_FOUND` (Plate has never been observed by the system).
* **Audit**: Synchronous `VEHICLE_TIMELINE_SEARCH` (Sensitive investigative read).

---

## 6. Watchlist & Alert Management Endpoints

### 6.0 Fundamental Policing & Legal Disclaimer
> [!IMPORTANT]
> **Watchlist Plate Match ≠ Confirmed Human Identity**:
> A watchlist match confirms exclusively that a camera sensor captured a vehicle bearing a license plate matching an active watchlist record. It **does NOT** automatically confirm the identity or culpability of the driver or occupants. Corroborating physical evidence, visual frame inspection, and authorized investigative verification are mandatory before law enforcement action.

---

### 6.1 List Watchlists
* **Method & Path**: `GET /api/v1/watchlists` (Alias: `GET /api/v1/watchlist`)
* **Auth**: Authenticated (All Roles: `SUPER_ADMIN`, `DEPARTMENT_ADMIN`, `INVESTIGATOR`, `OPERATOR`, `SYSTEM_AUDITOR`, `VIEWER`)
* **Query Parameters**:
  * `department_id`: Optional UUID filter.
  * `search`: Search filter matching watchlist name or owner.
  * `cursor`: Keyset pagination cursor.
  * `limit`: Results per page (default: 20, max: 100).
* **Success Response** (`200 OK`):
```json
{
  "data": [
    {
      "id": "w1111111-0000-0000-0000-000000000001",
      "name": "Ahmedabad Stolen Vehicles Watchlist (DEMO)",
      "department_id": "d1111111-0000-0000-0000-000000000001",
      "department_name": "Ahmedabad City Police Commissionerate",
      "owner": "Crime Branch Unit 3",
      "entries_count": 2,
      "created_at": "2026-09-09T00:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "total": 2,
    "next_cursor": null
  }
}
```

---

### 6.2 Create Watchlist
* **Method & Path**: `POST /api/v1/watchlists` (Alias: `POST /api/v1/watchlist`)
* **Auth**: Authenticated (`SUPER_ADMIN`, `DEPARTMENT_ADMIN`)
  * `SUPER_ADMIN`: Can create watchlists for any department.
  * `DEPARTMENT_ADMIN`: Strictly restricted to own assigned department (`user.departmentId === body.department_id`).
* **Request Body**:
```json
{
  "name": "Statewide Contraband Interdiction Target List",
  "department_id": "d1111111-0000-0000-0000-000000000001",
  "owner": "State Intelligence Bureau"
}
```
* **Success Response** (`201 Created`): Returns created `Watchlist` object.
* **Notable Errors**:
  * `400 Bad Request`: `DEPARTMENT_NOT_FOUND` or input validation failure.
  * `403 Forbidden`: `DEPARTMENT_ACCESS_DENIED` (Department Admin targeting foreign department) or `FORBIDDEN_RESOURCE`.
* **Audit**: Synchronous `WATCHLIST_CREATE` recorded in `audit_logs`.

---

### 6.3 Get Single Watchlist
* **Method & Path**: `GET /api/v1/watchlists/:id`
* **Auth**: Authenticated (All Roles)
* **Success Response** (`200 OK`):
```json
{
  "id": "w1111111-0000-0000-0000-000000000001",
  "name": "Ahmedabad Stolen Vehicles Watchlist (DEMO)",
  "department_id": "d1111111-0000-0000-0000-000000000001",
  "department_name": "Ahmedabad City Police Commissionerate",
  "owner": "Crime Branch Unit 3",
  "total_entries": 2,
  "active_entries": 2,
  "inactive_entries": 0,
  "created_at": "2026-09-09T00:00:00.000Z"
}
```
* **Notable Errors**: `404 Not Found` (`WATCHLIST_NOT_FOUND`).

---

### 6.4 Update Watchlist
* **Method & Path**: `PATCH /api/v1/watchlists/:id`
* **Auth**: Authenticated (`SUPER_ADMIN`, `DEPARTMENT_ADMIN`)
* **Request Body**:
```json
{
  "name": "Ahmedabad Stolen Vehicles — High Priority",
  "owner": "Crime Branch Special Unit"
}
```
* **Success Response** (`200 OK`): Returns updated watchlist record.
* **Audit**: Synchronous `WATCHLIST_UPDATE`.

---

### 6.5 Activate / Deactivate Watchlist
* **Method & Path**: `POST /api/v1/watchlists/:id/activate` & `POST /api/v1/watchlists/:id/deactivate`
* **Auth**: Authenticated (`SUPER_ADMIN`, `DEPARTMENT_ADMIN`)
* **Behavior**: Bulk-toggles `active = true` or `active = false` across all entries in the target watchlist. Deactivated entries are retained for historical auditability but will not generate new alerts.
* **Success Response** (`200 OK`):
```json
{
  "message": "Watchlist successfully activated",
  "id": "w1111111-0000-0000-0000-000000000001",
  "entries_activated": 2
}
```
* **Audit**: Synchronous `WATCHLIST_ACTIVATE` or `WATCHLIST_DEACTIVATE`.

---

### 6.6 Add Flagged Plate to Watchlist
* **Method & Path**: `POST /api/v1/watchlists/:id/entries` (Alias: `POST /api/v1/watchlist/:id/entries`)
* **Auth**: Authenticated (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Request Body**:
```json
{
  "plate": "gj 01-ab 1234",
  "category": "STOLEN_VEHICLE",
  "reason": "White Hyundai Creta reported stolen from Vastrapur - FIR #102/2026",
  "priority": "CRITICAL",
  "expires_at": "2026-12-31T23:59:59.000Z"
}
```
* **Plate Normalization**: Automatically converts input to canonical uppercase alphanumeric representation (`GJ01AB1234`). Rejects invalid syntax with `400 INVALID_PLATE_FORMAT`.
* **Success Response** (`201 Created`):
```json
{
  "id": "e1111111-0000-0000-0000-000000000001",
  "watchlist_id": "w1111111-0000-0000-0000-000000000001",
  "plate_normalized": "GJ01AB1234",
  "category": "STOLEN_VEHICLE",
  "reason": "White Hyundai Creta reported stolen from Vastrapur - FIR #102/2026",
  "priority": "CRITICAL",
  "added_by": "investigator.demo@gujcamera.local",
  "expires_at": "2026-12-31T23:59:59.000Z",
  "active": true,
  "created_at": "2026-09-09T00:00:00.000Z"
}
```
* **Notable Errors**:
  * `400 Bad Request`: `INVALID_PLATE_FORMAT`.
  * `403 Forbidden`: `DEPARTMENT_ACCESS_DENIED` or `FORBIDDEN_RESOURCE` (`OPERATOR`, `VIEWER`).
  * `409 Conflict`: `DUPLICATE_WATCHLIST_ENTRY` (Plate is already actively flagged on this watchlist).
* **Audit**: Synchronous `WATCHLIST_ENTRY_CREATE`.

---

### 6.7 List Watchlist Entries
* **Method & Path**: `GET /api/v1/watchlists/:id/entries`
* **Auth**: Authenticated (All Roles)
* **Query Parameters**: `active` (boolean), `category` (string), `search` (plate or reason), `cursor`, `limit`.
* **Success Response** (`200 OK`): Returns paginated entries for the watchlist.

---

### 6.8 Update / Deactivate Watchlist Entry
* **Method & Path**: `PATCH /api/v1/watchlists/entries/:entryId` & `POST /api/v1/watchlists/entries/:entryId/deactivate`
* **Auth**: Authenticated (`INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Request Body** (`PATCH`):
```json
{
  "reason": "FIR amended with additional suspect details",
  "priority": "HIGH",
  "active": false
}
```
* **Success Response** (`200 OK`): Returns updated entry.
* **Audit**: Synchronous `WATCHLIST_ENTRY_UPDATE` or `WATCHLIST_ENTRY_DEACTIVATE`.

---

### 6.9 Evaluate Sighting & Generate Alert (Matching Engine)
* **Method & Path**: `POST /api/v1/alerts/match-sighting`
* **Auth**: Authenticated (`OPERATOR`, `INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Request Body**:
```json
{
  "sighting_id": "vs-001-uuid"
}
```
* **Matching Semantics**:
  * Evaluates `VehicleSighting.plate_normalized` against all `WatchlistEntry` records where `active = true` and `(expires_at IS NULL OR expires_at > NOW())`.
  * **Deduplication**: Strictly prevents duplicate alerts on `(source_sighting_id, watchlist_entry_id)`. If an alert already exists, it is returned without re-inserting.
* **Success Response** (`201 Created`):
```json
{
  "sighting_id": "vs-001-uuid",
  "plate_normalized": "GJ01AB1234",
  "matched": true,
  "alerts_generated": 1,
  "alerts": [
    {
      "id": "al-001-uuid",
      "severity": "CRITICAL",
      "status": "NEW",
      "timestamp": "2026-09-09T01:50:32.000Z",
      "source_sighting": {
        "id": "vs-001-uuid",
        "timestamp": "2026-09-09T01:50:32.000Z",
        "confidence": 0.9620,
        "consensus_frames": 7,
        "frame_ref": "s3://vault/frames/cam-ahm-02-gj01ab1234.jpg",
        "camera": {
          "id": "c1111111-0000-0000-0000-000000000002",
          "name": "CAM-AHM-02: C.G. Road - Swastik Char Rasta",
          "coordinates": { "lat": 23.035412, "long": 72.559281 },
          "location": { "address": "Swastik Cross Road, Navrangpura", "district": "Ahmedabad" }
        },
        "vehicle": {
          "plate_normalized": "GJ01AB1234",
          "attributes": { "color": "White", "make": "Hyundai", "model": "Creta" }
        }
      },
      "watchlist_match": {
        "entry_id": "e1111111-0000-0000-0000-000000000001",
        "plate_normalized": "GJ01AB1234",
        "category": "STOLEN_VEHICLE",
        "reason": "White Hyundai Creta reported stolen from Vastrapur - FIR #102/2026",
        "priority": "CRITICAL"
      },
      "disclaimer": "Watchlist plate match does not confirm human identity or suspect guilt; corroborating physical evidence and investigator verification required."
    }
  ]
}
```
* **Audit**: Synchronous `ALERT_CREATE`.

---

### 6.10 List Alerts
* **Method & Path**: `GET /api/v1/alerts`
* **Auth**: Authenticated (`OPERATOR`, `INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Query Parameters**:
  * `status`: Filter by `AlertStatus` (`NEW`, `ACKNOWLEDGED`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`).
  * `severity`: Filter by `AlertSeverity` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
  * `watchlist_id`: Filter by watchlist UUID.
  * `plate`: License plate search (exact or prefix).
  * `camera_id`: Camera UUID.
  * `department_id`: Department UUID.
  * `from` / `to`: Timestamp bounds on observation `ts`.
  * `page`, `limit` (default: 20, max: 100).
* **Ordering**: Ordered chronologically by indexed `(status ASC, ts DESC)`.
* **Success Response** (`200 OK`): Returns paginated alert summaries with sighting and camera metadata.

---

### 6.11 Get Single Alert Deep-Dive
* **Method & Path**: `GET /api/v1/alerts/:id`
* **Auth**: Authenticated (`OPERATOR`, `INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`)
* **Success Response** (`200 OK`): Returns full alert entity with observation details, camera coordinates, location, linked vehicle, and watchlist entry metadata.
* **Notable Errors**: `404 Not Found` (`ALERT_NOT_FOUND`).

---

### 6.12 Alert Lifecycle State Machine Transitions
* **Method & Path**:
  * Generic: `PATCH /api/v1/alerts/:id` & `PATCH /api/v1/alerts/:id/status`
  * Action Routes:
    * `POST /api/v1/alerts/:id/acknowledge` (OPERATOR, SUPER_ADMIN)
    * `POST /api/v1/alerts/:id/investigate` (INVESTIGATOR, SUPER_ADMIN)
    * `POST /api/v1/alerts/:id/resolve` (INVESTIGATOR, SUPER_ADMIN)
    * `POST /api/v1/alerts/:id/dismiss` (OPERATOR for NEW false positives, INVESTIGATOR for active cases; SUPER_ADMIN)
* **Auth**: Authenticated per state transition role rules.
* **State Machine Rules (Enforced Server-Side)**:
  ```
  NEW ────────► ACKNOWLEDGED ────────► INVESTIGATING ────────► RESOLVED (terminal)
   │                  │                      │
   ▼                  ▼                      ▼
  DISMISSED       DISMISSED              DISMISSED (terminal)
  ```
  * `NEW` ➔ `ACKNOWLEDGED`: Allowed for `OPERATOR`, `SUPER_ADMIN`. Sets `acknowledged_by_id`.
  * `NEW` ➔ `DISMISSED`: Allowed for `OPERATOR`, `SUPER_ADMIN`. Sets `dismissal_reason`.
  * `ACKNOWLEDGED` ➔ `INVESTIGATING`: Allowed for `INVESTIGATOR`, `SUPER_ADMIN`.
  * `ACKNOWLEDGED` ➔ `DISMISSED`: Allowed for `INVESTIGATOR`, `SUPER_ADMIN`.
  * `INVESTIGATING` ➔ `RESOLVED`: Allowed for `INVESTIGATOR`, `SUPER_ADMIN`. Sets `resolved_by_id`.
  * `INVESTIGATING` ➔ `DISMISSED`: Allowed for `INVESTIGATOR`, `SUPER_ADMIN`.
* **Notable Errors**:
  * `403 Forbidden`: `FORBIDDEN_RESOURCE` (Role not authorized for target transition, e.g. Operator attempting to resolve an alert).
  * `404 Not Found`: `ALERT_NOT_FOUND`.
  * `409 Conflict`: `INVALID_STATE_TRANSITION` (Illegal transition attempt, e.g., jumping from `NEW` to `RESOLVED`, or attempting to transition out of terminal `RESOLVED`/`DISMISSED` state).
* **Audit**: Synchronous `ALERT_ACKNOWLEDGE`, `ALERT_INVESTIGATE`, `ALERT_RESOLVE`, or `ALERT_DISMISS`.

---

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
* **Success Response** (`200 OK`): Returns synchronous audit records with before/after state capture.
