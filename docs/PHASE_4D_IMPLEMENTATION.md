# Phase 4D: Vehicle Investigation, Cross-Camera Timeline & Route Visualization

**Gujarat Police Innovation Challenge 2026 — Unified CCTV Intelligence Platform**
*Source of Truth: `master_architecture.md` (Sections 10, 14.2)*

---

## 1. Objective

Phase 4D implements the complete vehicle investigation frontend workflow on top of the verified Phase 3
backend APIs. It does NOT introduce any new backend functionality; all data comes from existing endpoints.

**Implemented Flow:**

```
LOGIN
  → /vehicles (Plate Search)
  → Search results list with watchlist flags
  → /vehicles/[plate] (Vehicle Detail)
    → Overview Tab: Attributes, watchlist details, first/last sighting
    → Sighting Timeline Tab: Chronological camera hops + route analytics
    → Route Map Tab: MapLibre GL GIS polyline + numbered sighting markers
```

---

## 2. Tracking Governance (Mandatory Compliance Statement)

> [!IMPORTANT]
> **Plate-Based Correlation Only.**
>
> All cross-camera sighting correlation in Phase 4D is achieved exclusively through normalized license
> plate ANPR reads. Each `VehicleSighting` record represents an independent camera observation event
> where the ANPR OCR identified the plate string.
>
> The following are **NOT implemented** and **must NOT be represented or implied** in the UI:
>
> - Visual re-identification (visual feature matching across cameras)
> - Face recognition (persons inside or near vehicles)
> - Same-camera temporal object tracking (following a vehicle within one camera feed)
>
> Every UI string that describes the correlation logic uses the phrase
> **"plate-based cross-camera correlation"** or **"ANPR plate match"** to make this explicit.

---

## 3. Backend APIs Consumed

All endpoints require `INVESTIGATOR`, `DEPARTMENT_ADMIN`, or `SUPER_ADMIN` role.
All endpoints trigger synchronous audit log records on the backend.

| Endpoint | Method | Audit Event | Used In |
|---|---|---|---|
| `/api/v1/vehicles` | GET | `VEHICLE_SEARCH` | Search page |
| `/api/v1/vehicles/:plate` | GET | `VEHICLE_DETAIL_VIEW` | Detail page Overview tab |
| `/api/v1/vehicles/:plate/route` | GET | `VEHICLE_TIMELINE_SEARCH` | Detail page Timeline & Map tabs |

### Data Flow: Vehicle Detail Page

```
useEffect → Promise.all([
  vehiclesApi.getVehicleByPlate(plate),   → VEHICLE_DETAIL_VIEW
  vehiclesApi.getVehicleTimeline(plate),  → VEHICLE_TIMELINE_SEARCH
])
```

Both are fetched in parallel to minimize latency. If either fails with 404, an
appropriate error state is shown. If the role is unauthorized (403), a role-specific
error message is displayed.

---

## 4. New Files

### Types

| File | Description |
|---|---|
| `frontend/types/vehicle.ts` | All vehicle domain types matching backend API response shapes |

### API Service

| File | Description |
|---|---|
| `frontend/lib/api/vehicles.ts` | `vehiclesApi`: searchVehicles, getVehicleByPlate, getVehicleSightings, getVehicleTimeline |

### Components

| File | Description |
|---|---|
| `frontend/components/vehicles/VehicleSearchBar.tsx` | Plate input with normalization preview and keyboard shortcuts |
| `frontend/components/vehicles/VehicleResultCard.tsx` | Search result card with watchlist badge + navigation link |
| `frontend/components/vehicles/SightingsTimeline.tsx` | Chronological sighting rows + route segment analytics |
| `frontend/components/vehicles/RouteMap.tsx` | MapLibre GL GIS route map with polyline + numbered markers |

### Pages

| File | Description |
|---|---|
| `frontend/app/vehicles/page.tsx` | Vehicle search page (replaces Phase 4D placeholder) |
| `frontend/app/vehicles/[plate]/page.tsx` | Vehicle detail page: Overview + Timeline + Route Map tabs |

### Modified Files

| File | Change |
|---|---|
| `frontend/app/page.tsx` | Updated Vehicle Investigation card: Phase 4D (Live) + active border |

---

## 5. Component Architecture

### VehicleSearchBar
- Monospace plate input field with `textTransform: uppercase`
- Live normalization preview: strips spaces, hyphens, lowercases before showing canonical form
- Keyboard: `Enter` submits, `Escape` clears
- Quick-fill example buttons: `GJ01AB1234`, `GJ05`, `MH12DE4567`

### VehicleResultCard
- Clickable card → `Link` to `/vehicles/[plate]`
- Watchlisted vehicles: red left-accent border + `CRITICAL`/`HIGH` priority badge + category badge
- Non-watchlisted: green `CLEAR` badge
- Shows: sighting count, relative last-seen time, vehicle attributes if available

### SightingsTimeline
- **Summary stats row:** Total distance (PostGIS meters), duration, avg speed (km/h), camera hops, plausibility %
- **Governance notice:** Blue info box explicitly states "Plate-Based Correlation Only — not visual re-identification"
- **Sighting rows:** Numbered (1, 2, ... N), green for first, red for last, blue for intermediate
- **Route hop rows:** Interleaved between sightings, show distance/duration/speed; implausible hops shown in red with reason
- **Implausible segment warning:** Persistent amber/red alert box if any hops exceed speed threshold

### RouteMap
- Uses same Carto Dark Matter tactical tile style as Phase 4B `GisCameraMap`
- Two line layers: outer blue glow + inner dashed blue path
- Implausible segments: additional red dashed line layer
- Numbered sighting markers: HTML custom elements matching SightingsTimeline numbering
- Auto-fits bounds via `LngLatBounds.extend()` for all sighting coordinates
- **Persistent disclaimer strip:** Backend's `disclaimer` field displayed at bottom of map
- `SimulatedDataBadge` (compact) always visible top-left

---

## 6. Route Plausibility Model (Backend-Computed)

The backend computes plausibility for each segment using:

```
implied_speed_kmh = (distance_meters / 1000) / (elapsed_seconds / 3600)
```

If `implied_speed_kmh > max_speed_kmh` (default 150 km/h), the segment is flagged:
- `is_plausible: false`
- `plausibility_status: 'REQUIRES_REVIEW'`
- Frontend shows this as a red dashed map segment + red warning row in the timeline

---

## 7. Watchlist Alert Display

When a vehicle is watchlisted, the detail page shows a persistent red alert box containing:
- Category (e.g., `STOLEN VEHICLE`) and priority (e.g., `CRITICAL`)
- The full reason text (e.g., `White Hyundai Creta reported stolen from Vastrapur - FIR #102/2026`)
- The flagged timestamp
- **Legal disclaimer:** "A watchlist plate match confirms only that a camera captured a vehicle
  bearing this plate. It does NOT confirm driver or occupant identity."

---

## 8. GIS Map Implementation Details

The `RouteMap` component reuses the same `TACTICAL_DARK_STYLE` MapLibre configuration as `GisCameraMap`.

GeoJSON sources added after `map.on('load')`:
1. `route-line` → `LineString` through all sighting coordinates
2. `route-glow` layer → Outer blue glow (opacity 0.25, blur 3)
3. `route-path` layer → Blue dashed line (dash array `[4, 2]`)
4. `route-implausible` → MultiLineString for flagged segments (if any) in red dashes

Map bounds auto-fitted using `LngLatBounds` expanded over all sighting coordinates.

---

## 9. Simulated Data Compliance

- `SimulatedDataBadge` is present on both the search page header and the Route Map overlay
- The backend `disclaimer` field from `/route` is displayed verbatim at the bottom of the RouteMap
- No results are fabricated, hardcoded, or mocked — all data comes from real backend API calls

---

## 10. Authorization & Error Handling

| Scenario | Behavior |
|---|---|
| 403 Forbidden | Error state with role-specific message about INVESTIGATOR requirement |
| 404 Vehicle Not Found | Error state explaining the plate has no camera observations |
| Network failure | `NETWORK_ERROR` from API client with retry button |
| Empty search results | Empty state with explanation (no fake data shown) |
| 0 sightings for route map | Empty state with Navigation icon (no map rendered) |

---

## 11. Verification

### Routes Compiled
- `GET /vehicles` → **200 OK** (Next.js dev server)
- `GET /vehicles/GJ01AB1234` → **200 OK** (Next.js dev server)
- `GET /` (Command Center) → **200 OK** (Phase 4D card active)

### Backend API Verified (pre-implementation)
- `GET /api/v1/vehicles?q=GJ01` → 39 results, real ANPR data
- `GET /api/v1/vehicles/GJ01AB1234` → Vehicle detail with watchlist (STOLEN_VEHICLE / CRITICAL)
- `GET /api/v1/vehicles/GJ01AB1234/route` → 2 sightings, 1 segment, 5327m, 31.97 km/h

### TypeScript
- `npx tsc --noEmit` — **zero errors** in Phase 4D files
  (One pre-existing error in `__tests__/AppShell.test.tsx` — not related to Phase 4D)

---

## 12. Phase Boundary — What is NOT Implemented

Per the Phase 4D brief, the following are **explicitly out of scope**:

- ❌ WebSocket real-time alert stream (Phase 4E)
- ❌ Watchlist management UI (Phase 4E)
- ❌ Alert acknowledgement workflows (Phase 4E)
- ❌ Visual re-identification (NOT in scope for any phase per architecture)
- ❌ Face recognition (NOT in scope for any phase per architecture)
- ❌ New backend endpoints (all Phase 4D data comes from Phase 3 verified APIs)
