# Database Architecture & Operations Guide (Phase 1)
**Gujarat Police Innovation Challenge 2026 — Unified CCTV Intelligence Platform**

Source of Truth: [`master_architecture.md`](../master_architecture.md) (Section 6)

---

## 1. Database Architecture Overview

* **Engine**: PostgreSQL 16.4 on Alpine Linux
* **Spatial Extension**: PostGIS 3.4.3
* **ORM & Migration Tool**: Prisma 5.22 with PostgreSQL Extensions preview
* **Spatial Index**: PostGIS GiST index on camera GPS coordinates `(long, lat)` with SRID 4326 (WGS 84)

---

## 2. Canonical Entity Inventory (19 Entities)

| Category | Table Name | Purpose | Key Relationships & Indexes |
| :--- | :--- | :--- | :--- |
| **Organizational Core** | `departments` | Gujarat Police hierarchy (DGP, Commissionerates, Zones) | Self-referencing parent-child hierarchy |
| | `roles` | Named permission bundles (Super Admin, Investigator, Operator, etc.) | Unique `name` index |
| | `permissions` | Granular resource-action grants | FK to `roles` (Cascade) |
| | `users` | Police personnel credentials & access control | Unique `email`, FK to `roles` & `departments` |
| **Camera Registry & GIS** | `connectors` | Protocol adapter configurations (RTSP, ONVIF, Vendor APIs) | Unique adapter types & vault references |
| | `cameras` | Central CCTV camera catalog with high-precision GPS | GiST spatial index on `(long, lat)`, B-Tree on `(department_id, operational_status)` |
| | `locations` | Denormalized civic addresses, police zones, and districts | FK to `cameras` (Cascade) |
| | `camera_streams` | Stream handles, RTSP URLs, codecs, and target frame rates | FK to `cameras` (Cascade) |
| | `camera_health` | Rolling heartbeat, actual FPS, packet loss, and status | FK to `cameras` (Cascade) |
| **AI Vision & Sighting Store** | `detections` | Raw computer vision bounding boxes (vehicle/person) | Composite index on `(camera_id, ts)` |
| | `plate_detections` | Raw per-frame OCR text reads feeding consensus | FK to `detections` (Cascade) |
| | `vehicles` | Plate-anchored identity entity with physical attributes | PK on `plate_normalized`, index on `last_seen` |
| | `vehicle_sightings` | Canonical multi-frame consensus sightings | Composite indexes on `(plate_normalized, ts)` & `(camera_id, ts)` |
| **Watchlists & Alerts** | `watchlists` | Target watchlists (e.g., Stolen Vehicles, Hit & Run) | FK to `departments` |
| | `watchlist_entries` | Flagged vehicle plates with reasons and expiry dates | Composite index on `(plate_normalized, active)` |
| | `alerts` | Real-time events surfaced to operators on watchlist hit | Composite index on `(status, ts)`, FKs to `vehicle_sightings` & `watchlist_entries` |
| | `incidents` | Case escalations grouping alerts for formal investigation | FK to `users` |
| **Evidence & Compliance** | `evidence` | Immutable frame snapshots with SHA-256 integrity hashes | Index on `source_id`, storage reference in MinIO |
| | `audit_logs` | Tamper-evident ledger of user actions and state diffs | Composite index on `(resource, ts)`, FK to `users` |

---

## 3. Database Operations & CLI Commands

All commands should be executed from the `backend/` directory.

### Apply Migrations to PostgreSQL
To apply versioned migrations on any database instance:
```powershell
npx prisma migrate deploy
```

### Seed Development & Demo Fixtures
To populate the database with realistic demo fixtures (cameras, watchlists, test vehicles, police roles):
```powershell
npm run prisma:seed
```

### Run Automated Database Verification
To execute the 11-point diagnostic test suite:
```powershell
npm run db:verify
```

### Reset Database (Wipe & Re-migrate)
To reset the development database from scratch:
```powershell
npx prisma migrate reset --force
```

---

## 4. PostGIS Spatial Query Examples

### Bounding-Box Viewport Query (Used by GIS Map UI)
```sql
SELECT id, name, lat, long, operational_status
FROM cameras
WHERE ST_Contains(
  ST_MakeEnvelope(72.45, 22.95, 72.65, 23.15, 4326),
  ST_SetSRID(ST_MakePoint(long::float, lat::float), 4326)
);
```

### Proximity Search (Find Cameras within X meters of an incident)
```sql
SELECT 
  id, name, lat, long,
  ROUND(ST_Distance(
    ST_SetSRID(ST_MakePoint(long::float, lat::float), 4326)::geography,
    ST_SetSRID(ST_MakePoint(72.5714, 23.0225), 4326)::geography
  )::numeric, 2) AS distance_meters
FROM cameras
WHERE ST_DWithin(
  ST_SetSRID(ST_MakePoint(long::float, lat::float), 4326)::geography,
  ST_SetSRID(ST_MakePoint(72.5714, 23.0225), 4326)::geography,
  5000 -- 5 km radius
)
ORDER BY distance_meters ASC;
```
