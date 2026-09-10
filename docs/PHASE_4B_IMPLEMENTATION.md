# Phase 4B Implementation & Verification Report
## Camera Registry, GIS Command Map & Equipment Telemetry
### Gujarat Police Unified CCTV Intelligence Platform — Innovation Challenge 2026

**Author**: Senior Systems Architect & AI Engineering Team
**Date**: September 10, 2026
**Status**: APPROVED & IMPLEMENTED
**Preceding Baseline**: Phase 4A Checkpoint (Frontend Foundation & Authenticated App Shell)

---

## 1. Executive Summary & Deliverables

Phase 4B establishes real backend data integration for the CCTV Camera Estate and delivers the primary geographic command-and-control surface for the Gujarat Police CCTV Intelligence Platform.

In strict compliance with `master_architecture.md` (Section 6.2, 8.2, 14.2, 15.2, and 20), Phase 4B transitions the platform from static placeholders to a live, desktop-first command interface powered by genuine PostGIS spatial queries, operational telemetry records, and MapLibre GL.

### Core Deliverables Implemented
1. **Camera Domain Models & API Service Layer (`types/camera.ts`, `lib/api/cameras.ts`)**: Strongly typed domain interfaces matching canonical backend contracts for cameras, streams, physical locations, and telemetry.
2. **GIS Camera Command Map (`app/map/page.tsx`, `components/cameras/GisCameraMap.tsx`)**: Dark tactical MapLibre GL map centered on the Ahmedabad–Gandhinagar corridor, supporting debounced viewport bounding-box querying, tactical status markers, and accessible side panel navigation.
3. **CCTV Camera Registry (`app/cameras/page.tsx`)**: Authoritative inventory catalog featuring operational health telemetry summary cards, live search, multi-axis filtering (status, jurisdiction), and an accessible data table.
4. **Camera Detail Drawer (`components/cameras/CameraDetailDrawer.tsx`)**: Slide-out metadata inspection card presenting physical location, WGS-84 coordinates, jurisdiction, hardware stream specs, and registered telemetry heartbeats.
5. **Zero Mock Fallback Enforcement**: All UI states strictly reflect real backend API responses. If network or authorization fails, actionable error states are displayed with retry triggers; no synthetic camera data is fabricated on failure.
6. **Simulated Data Governance**: Persistent `SIMULATED DATA (DEMO FIXTURES)` badge is displayed across all GIS and registry interfaces.

---

## 2. Camera API Integration & Backend Endpoints

The frontend communicates with the NestJS backend via the centralized `apiClient` (`lib/api/client.ts`) utilizing in-memory JWT bearer authentication.

| Method | Backend Endpoint | Function in `lib/api/cameras.ts` | Usage & Semantics |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cameras` | `camerasApi.getCameras(query)` | Full registry listing with pagination and optional filtering. |
| `GET` | `/api/v1/cameras?bbox=minLong,minLat,maxLong,maxLat` | `camerasApi.getCameras({ bbox })` | Viewport-bounded query executing database-side PostGIS `ST_Within` over GiST spatial index. |
| `GET` | `/api/v1/cameras/health/summary` | `camerasApi.getCameraHealthSummary()` | Equipment telemetry counts (`total_cameras`, `online`, `degraded`, `offline`, `connecting`, `error`). |
| `GET` | `/api/v1/cameras/:id` | `camerasApi.getCameraById(id)` | Single camera deep-dive record with physical location, streams, and health. |
| `GET` | `/api/v1/cameras/:id/health` | `camerasApi.getCameraHealth(id)` | Operational heartbeat and telemetry for a specific camera. |
| `GET` | `/api/v1/cameras/nearby` | `camerasApi.getNearbyCameras(...)` | Great-Circle geodesic distance queries (WGS-84 meters). |

### Actual Response Contract Verification
Responses adhere strictly to the backend `sanitizeCamera` DTO:
```json
{
  "id": "3c93c2d0-adea-484c-a813-9d2fb65d6df5",
  "name": "CAM-AHM-01: SG Highway - Pakwan Crossroad Junction",
  "department_id": "08c817f0-e809-4b46-9e63-8bab51000deb",
  "department_name": "Ahmedabad City Police Commissionerate",
  "lat": 23.0338142,
  "long": 72.5073289,
  "protocol": "RTSP",
  "connector_type_id": "81f6f0a3-bd05-4097-af70-546012ff29db",
  "operational_status": "ONLINE",
  "is_active": true,
  "created_at": "2026-09-09T01:58:24.045Z",
  "updated_at": "2026-09-09T01:58:24.045Z",
  "location": {
    "address": "Pakwan Crossroad, Sarkhej - Gandhinagar Hwy, Bodakdev",
    "zone": "West Zone",
    "district": "Ahmedabad"
  },
  "streams": [
    {
      "id": "709f705e-d785-4536-bbfd-27c1c0903668",
      "codec": "h264",
      "resolution": "1920x1080",
      "fps": 25,
      "url_or_handle": "rtsp://simulator:8554/live/cam-ahm-01"
    }
  ],
  "health": {
    "status": "ONLINE",
    "last_heartbeat": "2026-09-09T01:58:24.044Z",
    "fps_actual": 25,
    "packet_loss": 0
  }
}
```

---

## 3. GIS Technology & MapLibre GL Integration

### Technology Choice
- **MapLibre GL (`^6.9.0`)**: Open-source, BSD-licensed WebGL map engine.
- **Why MapLibre GL**: Eliminates proprietary API keys, usage metering, and vendor lock-in associated with Mapbox or Google Maps, matching governmental deployment guidelines.
- **Tile Styling**: Carto Dark Matter raster tiles based on OpenStreetMap (`https://*.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`). Delivers high contrast, low-light tactical command center aesthetics without requiring external authentication tokens.

### Next.js Client-Side Initialization
MapLibre GL requires browser DOM and WebGL contexts:
- Initialized strictly inside client component `GisCameraMap.tsx` using `useEffect`.
- Uses named ESM exports (`Map as MapLibreMap, Marker as MapLibreMarker, NavigationControl, AttributionControl`).
- Full lifecycle cleanup: When unmounted, all active markers are detached via `marker.remove()` and the map instance is destroyed via `map.remove()`, preventing browser WebGL context exhaustion or memory leaks.

---

## 4. Map Viewport Querying Strategy

In compliance with the architecture's scalability principles for large-scale camera fleets (up to 80,000 statewide cameras):
1. **Bounding Box Calculation**:
   On map initialization and pan/zoom events, the bounding box is computed from the map's visible coordinate envelope:
   $$\text{bbox} = \text{minLong}, \text{minLat}, \text{maxLong}, \text{maxLat}$$
2. **Debounce Strategy**:
   Map `moveend` and `zoomend` events are debounced by **350ms**. Rapid pan or continuous zoom gestures do not trigger repetitive HTTP requests; network requests are dispatched only when the operator pauses movement.
3. **Database-Side GiST Filtering**:
   The backend executes an indexed PostGIS spatial query:
   ```sql
   ST_Within(
     ST_SetSRID(ST_MakePoint(c.long::float, c.lat::float), 4326),
     ST_MakeEnvelope(minLong, minLat, maxLong, maxLat, 4326)
   )
   ```
   Ensuring only cameras physically present within the visible rectangle are transmitted over the network.

---

## 5. Camera Marker Architecture

Each camera marker in the MapLibre view is rendered as an accessible tactical DOM element:
- **Visual Status Signals**:
  - `ONLINE`: Emerald green border (`#10b981`) with soft glowing shadow.
  - `DEGRADED`: Amber border (`#f59e0b`) with cautionary pulse.
  - `OFFLINE`: Slate gray border (`#64748b`).
  - `ERROR`: Crimson red border (`#ef4444`).
  - `CONNECTING`: Tactical blue border (`#3b82f6`).
- **Accessible Attributes**:
  - `role="button"`
  - `tabindex="0"`
  - `aria-label="Camera {name}, Status: {status}"`
  - Accessible title tooltip
- **Keyboard Navigation**:
  - Operators can press `Tab` to navigate through markers and `Enter` or `Space` to inspect metadata.
- **Marker Hover/Focus**:
  - Scale enlargement (1.25x) and elevated z-index (100) on hover or keyboard focus.

---

## 6. Camera Detail Drawer

Clicking any camera marker or registry row opens the `CameraDetailDrawer` (`components/cameras/CameraDetailDrawer.tsx`):
- **Role**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="camera-detail-title"`.
- **Keyboard Interactivity**: Supports `Escape` key to close, auto-focuses container on open.
- **Rendered Attributes**:
  1. **Identity & Status**: Camera name, short code, protocol badge, and pulsing status badge.
  2. **Physical Location**: Address, Police Zone, District, WGS-84 coordinates (with One-Click Copy and "Fly To" center on map action).
  3. **Authority**: Department name, Active/Decommissioned status, Camera UUID (copyable), Registration date.
  4. **Hardware Streams**: Codec (`h264`, `h265`), resolution (`1080p`, `1440p`), target FPS, endpoint handle (`rtsp://simulator:8554/...`).
  5. **Operational Telemetry**: Measured FPS (`fps_actual`), Packet loss percentage (`packet_loss`), and Last recorded heartbeat timestamp.
  6. **Disclaimers**:
     - *Telemetry Disclaimer*: Health metrics reflect registered database heartbeats, not proof of an active live socket.
     - *Phase Notice*: Live video preview is explicitly disabled until Phase 4C.

---

## 7. Camera Registry Page (`/cameras`)

The Camera Registry page provides the statewide equipment inventory:
- **Telemetry Summary Cards**:
  - **Total Registered Cameras** (5 seeded in DB)
  - **Online & Operational** (4 seeded)
  - **Degraded Performance** (1 seeded: CAM-GND-02, 15 FPS / 4.5% packet loss)
  - **Offline / Error** (0 seeded)
- **Multi-Axis Filters**:
  - Search input: Text query filtering across Camera Code, Junction, District, and Address.
  - Operational Status Dropdown: `ALL`, `ONLINE`, `DEGRADED`, `OFFLINE`, `CONNECTING`, `ERROR`.
  - Jurisdiction Dropdown: Scoped dynamically to departments present in the registry (`Ahmedabad City Police`, `Gandhinagar District Police`).
  - "Reset Filters" action button.
- **Accessible Table**:
  - Tab-accessible rows with `role="row"` and `aria-label`.
  - Pressing `Enter` or clicking "Inspect" opens the `CameraDetailDrawer`.
- **Quick Links**:
  - Header button "Open GIS Map" (`/map`) for immediate spatial cross-reference.

---

## 8. Camera Health & Telemetry Visibility

The platform consumes the backend telemetry endpoint `GET /api/v1/cameras/health/summary`.
- **Truthful Architecture Labeling**:
  The UI explicitly informs officers:
  > *"Operational health derived from registered camera telemetry and heartbeats, independent of API/database infrastructure health. Live video playback is scheduled for Phase 4C."*
- **No Fabricated Telemetry**:
  Uptime percentages, AI confidence scores, or fake detection counts are **strictly prohibited** and omitted. Only real database attributes (`fps_actual`, `packet_loss`, `last_heartbeat`) are shown.

---

## 9. RBAC & Department Scoping

Phase 4B honors the 5-tier police authorization model established in Phase 4A:
- **Navigation Filtering**:
  - Both `/map` and `/cameras` are accessible to `SUPER_ADMIN`, `DEPARTMENT_ADMIN`, `INVESTIGATOR`, `OPERATOR`, `SYSTEM_AUDITOR`, and `VIEWER`.
  - Module links are dynamically filtered in the sidebar (`getAuthorizedNavItems`).
- **Backend Authority**:
  - All camera creation, update, and decommissioning operations (`POST /cameras`, `PATCH /cameras/:id`, `DELETE /cameras/:id`) enforce `Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')`.
  - `DEPARTMENT_ADMIN` can only modify cameras assigned to their department; cross-department modifications return `403 FORBIDDEN (DEPARTMENT_ACCESS_DENIED)`.
- **Audit Access**:
  - `SYSTEM_AUDITOR` can view map and registry without access to live video or vehicle tracking.

---

## 10. Accessibility (A11y) Architecture

Recognizing that map canvases (HTML5 canvas / WebGL) are inaccessible to screen readers and difficult for keyboard-only users, Phase 4B provides dual-mode interaction:
1. **Accessible Side Panel Dock (`components/cameras/GisCameraMap.tsx`)**:
   - Displays a structured, keyboard-navigable textual feed (`role="feed"`) of all cameras currently within the map bounds.
   - Operators can cycle through cameras using `Tab`, filter via search, and press `Enter` to focus a camera, automatically centering the map canvas and opening the detail drawer.
2. **Textual Status Badges**:
   - Statuses are never communicated by color alone. Every badge displays clear text (`ONLINE`, `DEGRADED`, etc.) with accessible screen-reader contrast ratios.
3. **Focus Outlines & ARIA Landmarks**:
   - Interactive elements feature high-visibility focus rings (`var(--border-focus)`).
   - Drawers and dialogs use `role="dialog"` with `aria-modal="true"` and `aria-labelledby`.

---

## 11. Performance Considerations

- **Debounced Network Requests**: 350ms throttling on spatial bounding-box queries eliminates request thrashing during map movements.
- **Marker Diffing & Recycling**: Markers are tracked in a `Map<string, Marker>` ref; existing markers within the viewport are reused, and only out-of-viewport markers are removed.
- **Viewport Bounds Scoping**: Only cameras intersecting the visible coordinate envelope are queried from PostGIS, preventing client memory exhaustion when scaling to thousands of cameras.
- **Clean Component Unmounting**: Timers, event listeners, markers, and WebGL map contexts are cleaned up on unmount.

---

## 12. Dependencies Added

| Package | Version | Purpose | Architectural Justification |
| :--- | :--- | :--- | :--- |
| `maplibre-gl` | `^6.9.0` | Open-source GIS WebGL map rendering | Replaces proprietary Google Maps and Mapbox APIs with open-source, sovereign mapping compliant with government architecture. |

*No other packages were added. TailwindCSS was avoided in strict accordance with instructions; Vanilla CSS tokens were used exclusively.*

---

## 13. Comprehensive Test Suite

### Frontend Vitest Suite (42 of 42 Tests Passed)
```
 ✓ __tests__/RbacNavigation.test.tsx (6 tests)
 ✓ __tests__/CameraApi.test.tsx (7 tests)
 ✓ __tests__/ApiClient.test.tsx (4 tests)
 ✓ __tests__/PlaceholderPage.test.tsx (1 test)
 ✓ __tests__/AuthContext.test.tsx (3 tests)
 ✓ __tests__/AppShell.test.tsx (3 tests)
 ✓ __tests__/GisCameraMap.test.tsx (6 tests)
 ✓ __tests__/CameraRegistry.test.tsx (7 tests)
 ✓ __tests__/LoginForm.test.tsx (5 tests)

Test Files:  9 passed (9)
Tests:       42 passed (42)
Duration:    2.34s
```

### Key Behaviors Verified in Tests
1. **`CameraApi.test.tsx`**:
   - Parameter serialization for `minLong,minLat,maxLong,maxLat` bbox queries.
   - Status and department filter queries.
   - Health summary and single camera retrieval.
   - Rejection without fallback to mock data on network failure.
2. **`CameraRegistry.test.tsx`**:
   - Real-shaped camera list rendering and health summary metrics.
   - Real-time search filtering and status dropdown filtering.
   - Opening `CameraDetailDrawer` on row click/keyboard enter.
   - EmptyState rendering on zero search results.
   - ErrorState rendering on API failure without mock fallback.
3. **`GisCameraMap.test.tsx`**:
   - Initial bounds fetch on map load.
   - Tactical HUD overlay, simulated data warning, and map legend.
   - Accessible side panel displaying viewport cameras with keyboard navigation.
   - Opening `CameraDetailDrawer` on camera selection.
   - EmptyState and ErrorState handling on map bounds queries.

---

## 14. Verification & Regression Results

| Test Suite | Command | Result | Verification Scope |
| :--- | :--- | :--- | :--- |
| **Frontend Tests** | `npm test` in `frontend/` | **42 / 42 PASSED** | All Phase 4A and Phase 4B tests |
| **Frontend Production Build** | `npm run build` in `frontend/` | **PASSED (Code 0)** | 13 static routes generated, zero type errors |
| **Backend TypeScript Build** | `npm run build` in `backend/` | **PASSED (Code 0)** | `tsc` compile check |
| **Database Verification** | `npm run db:verify` in `backend/` | **11 / 11 PASSED** | PostGIS 3.4, GiST index, schema, seed data |
| **Backend E2E Suite** | `npm run test:e2e` in `backend/` | **120 / 120 PASSED** | All 7 E2E test suites (events, pipeline, cameras, etc.) |
| **AI Worker Pytest** | `pytest -q` in container | **107 / 107 PASSED** | Consensus, OCR, MinIO, Redis publisher |

---

## 15. Manual Verification Guide

To manually verify Phase 4B in a standard web browser:

1. **Verify Services Running**:
   - PostgreSQL (Port 5432), Redis (6379), MinIO (9000), Video Gateway (8554/8888).
   - Backend API: `http://localhost:4000/api/v1` (`npm run start:dev` in `backend/`).
   - Frontend: `http://localhost:3000` (`npm run dev` in `frontend/`).
2. **Log In**:
   - Navigate to `http://localhost:3000/login`.
   - Credentials: `admin.demo@gujcamera.local` / `PoliceDemo@2026!`.
   - Verify landing on Command Center (`/`).
3. **GIS Camera Map (`/map`)**:
   - Click "GIS Camera Map" in the sidebar or Command Center quick card.
   - Confirm dark tactical MapLibre map renders centered on Ahmedabad/Gandhinagar.
   - Confirm `SIMULATED DATA (DEMO FIXTURES)` banner appears at top-left.
   - Confirm HUD indicates `5 Active in View`.
   - Confirm 5 color-coded markers appear on the map canvas.
   - Click "CAM-AHM-01: SG Highway" in the accessible side list.
   - Confirm `CameraDetailDrawer` slides out showing location, coordinates, stream specs, and Phase 4C notice.
   - Press `Escape` to close the drawer.
4. **Camera Registry (`/cameras`)**:
   - Click "Camera Registry" in the sidebar.
   - Confirm health summary cards show: Total (5), Online (4), Degraded (1), Offline (0).
   - Type "Gandhinagar" in search box; confirm only Gandhinagar cameras appear.
   - Set status dropdown to "DEGRADED"; confirm only `CAM-GND-02` appears.
   - Click `CAM-GND-02` row; confirm drawer indicates DEGRADED status, 15 FPS, and 4.5% packet loss.
5. **RBAC Role Check**:
   - Sign out and log in as `auditor.demo@gujcamera.local` / `PoliceDemo@2026!`.
   - Verify SYSTEM_AUDITOR can access `/map` and `/cameras`, while "Live Monitoring" and "Vehicle Tracking" are omitted from navigation.

---

## 16. Explicit Constraints & Scope Boundary

> [!IMPORTANT]
> **LIVE VIDEO PLAYBACK IS PHASE 4C**:
> In accordance with instructions, Phase 4B does **NOT** implement live HLS video playback, does not instantiate `hls.js`, and does not render live video tiles. All camera stream URLs are displayed strictly as technical configuration metadata with explicit notices indicating that multi-camera live video matrix playback will be delivered in Phase 4C.
>
> WebSockets, vehicle tracking UI, and watchlist/alert management UI are deferred to subsequent vertical slices.

---

## 17. Architecture Compliance Statement

This implementation complies with `master_architecture.md`:
- **Section 6.2 & 8.2**: Camera Registry and PostGIS GiST spatial indexing honored.
- **Section 14.2 & 15.2**: GIS Map client-side MapLibre GL implementation with dark tactical aesthetics.
- **Section 14.2**: Accessible dual-mode navigation (canvas + structured side panel).
- **Section 19.3**: Persistent `SIMULATED DATA` indicators maintained.
- **Section 20**: Role-based access control and zero mock fallback policies enforced.
