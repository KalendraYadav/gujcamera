# Gujarat Police Innovation Challenge 2026 — Unified CCTV Intelligence Platform

> **A scalable, unified command & intelligence platform for correlating 80,000+ CCTV camera feeds across Gujarat.**

---

## 1. Problem Overview

Gujarat's 80,000+ public and police cameras are operated across multiple municipal corporations, police commissionerates, district headquarters, and private entities. These cameras are partitioned across incompatible Video Management Software (VMS), proprietary network enclaves, and varying camera hardware.

When an incident occurs (such as a vehicle theft, kidnapping, hit-and-run, or interstate suspect movement):
- Sightings on one camera cannot be automatically linked to sightings on another camera.
- Tracking suspect vehicles requires manual, multi-hour review of disconnected camera feeds.
- Operators suffer alert fatigue from low-accuracy OCR misreads.

## 2. The Solution

This platform implements a **Hybrid Architecture** combining:
1. **Model 1 (CCTV Registry + GIS Map)**: Central geospatial catalog of all cameras, GPS coordinates, and real-time operational health.
2. **Model 3 (Federation & Protocol Adapters)**: Protocol-agnostic adapters for RTSP/ONVIF and vendor APIs.
3. **AI Vision Pipeline**: Vehicle detection, plate localization, OCR, and **multi-frame consensus** (majority voting across 5–8 frames to eliminate misreads).
4. **Watchlist & Alert Engine**: Real-time matching against flagged police lists with deduplication cooldown windows.
5. **Vehicle Route Investigation**: Spatio-temporal plausibility tracking and route reconstruction rendered on interactive GIS maps.
6. **Tamper-Evident Evidence Vault**: Immutable frame snapshot storage with SHA-256 integrity hashes and audit logs.

---

## 3. Architecture Source of Truth

The primary architectural specification for this project is:
* [`master_architecture.md`](./master_architecture.md) (*Version 1.1 — Implementation-Ready, Design-Ready, Deployment-Ready*)

All data models, API endpoints, events, and security boundaries strictly follow this document.

---

## 4. Implementation Status (Phase 0 Complete)

| Capability / Tier | Status | Implementation Details |
| :--- | :---: | :--- |
| **Phase 0: Infrastructure Bootstrap** | 🟢 Complete | PostgreSQL 16 + PostGIS, Redis 7, MinIO S3 in Docker |
| **Phase 1: Database Foundation** | 🟡 Next Up | Entity schema migrations & test seed script |
| **Phase 2: Backend API Core** | 🔴 Planned | NestJS modular monolith (`/api/v1`) |
| **Phase 3: Camera Registry & GIS** | 🔴 Planned | Spatial camera indexing & MapLibre GL UI |
| **Phase 4: Video Feeds & Federation** | 🔴 Planned | RTSP adapter & FFmpeg synthetic stream generator |
| **Phase 5: AI Vision & ANPR** | 🔴 Planned | Vehicle detection, OCR, and multi-frame consensus |
| **Phase 6: Watchlists & Alerts** | 🔴 Planned | Cooldown engine & WebSocket instant push |
| **Phase 7: Investigation & Evidence** | 🔴 Planned | Timeline reconstruction & MinIO frame vault |
| **Phase 8: Demo Hardening** | 🔴 Planned | Seeded demo scenarios & failover tiers |

### Build vs. Simulate vs. Future Scope
* **Implemented (Current PoC)**: Dockerized storage layer (PostgreSQL 16 + PostGIS, Redis 7, MinIO).
* **Simulated (For Demo)**: Synthetic RTSP camera feeds via FFmpeg and mock vendor adapter.
* **Future Production**: Multi-region Kubernetes deployment, Kafka event streaming, and edge GPU pre-filtering.

---

## 5. Technology Stack

* **Geospatial Database**: PostgreSQL 16 + PostGIS 3.4
* **Cache & Event Queue**: Redis 7 (Streams + In-memory cache)
* **Evidence Storage**: MinIO (S3-compatible immutable object store)
* **Backend API**: NestJS (TypeScript, Node.js 20 LTS)
* **Frontend Command UI**: Next.js (React, TypeScript, Vanilla CSS, MapLibre GL)
* **AI / Computer Vision**: Python (YOLOv8, PaddleOCR / Open-Source OCR)
* **Container Orchestration**: Docker & Docker Compose

---

## 6. Repository Structure

```
gujcamera/
├── master_architecture.md   # Architectural source of truth (v1.1)
├── general.txt              # Architecture flow diagrams
├── README.md                # Project documentation & quickstart
├── .gitignore               # Ignored files (secrets, venvs, node_modules)
├── .env.example             # Configuration template
├── .env                     # Local environment config (ignored by git)
├── docker-compose.yml       # Local infrastructure stack
│
├── backend/                 # NestJS Modular Monolith API (Phase 2)
├── frontend/                # Next.js Police Command UI (Phase 3)
├── ai-worker/               # Python Computer Vision & ANPR Worker (Phase 5)
├── video-gateway/           # RTSP Simulation & Streaming Tools (Phase 4)
├── docker/                  # Dockerfiles & container assets
└── docs/                    # API specs, ADRs, and user journey guides
```

---

## 7. Prerequisites

Before running the project on your development machine, ensure you have:
1. **Git** (`git --version` ≥ 2.40)
2. **Node.js** (`node --version` ≥ 20.x LTS) and **npm** (`npm --version` ≥ 10.x)
3. **Docker Desktop** installed and running (`docker --version` ≥ 24.x)
4. **Python** (`python --version` ≥ 3.11)

---

## 8. Quickstart: Starting the Infrastructure (Beginner Guide)

### Step 1: Open Terminal
Navigate to the project root directory:
```powershell
cd "d:\web project\gujcamera"
```

### Step 2: Ensure Environment File Exists
If you haven't already, copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```

### Step 3: Start Docker Containers
Run Docker Compose in detached (background) mode:
```powershell
docker compose up -d
```
*Expected Output:*
```
[+] Running 3/3
 ✔ Container gujcamera_redis     Started
 ✔ Container gujcamera_postgres  Started
 ✔ Container gujcamera_minio     Started
```

### Step 4: Verify Service Health
Check that all three containers show `(healthy)`:
```powershell
docker compose ps
```

| Service | Port | Purpose | Verification Command |
| :--- | :--- | :--- | :--- |
| **PostgreSQL + PostGIS** | `5432` | Relational & GPS spatial data | `docker exec -i gujcamera_postgres psql -U gujcamera_admin -d gujcamera_db -c "SELECT PostGIS_Full_Version();"` |
| **Redis** | `6379` | Fast cache & event broker | `docker exec -i gujcamera_redis redis-cli ping` |
| **MinIO API** | `9000` | S3 evidence storage | `curl.exe -I http://localhost:9000/minio/health/live` |
| **MinIO Console** | `9001` | Web storage dashboard | Open `http://localhost:9001` in your browser |

---

## 9. Stopping the Infrastructure

To stop the containers safely without deleting your data:
```powershell
docker compose stop
```

To stop and remove containers while preserving data volumes:
```powershell
docker compose down
```
*(Your database records and evidence snapshots remain preserved in named Docker volumes: `gujcamera_postgres_data`, `gujcamera_redis_data`, `gujcamera_minio_data`)*.

---

## 10. Security Rules

1. **Never commit `.env`**: Always use `.env.example` as the checked-in template.
2. **Immutable Evidence**: All snapshots stored in MinIO must be accompanied by a SHA-256 cryptographic checksum.
3. **Audit Trails**: Every sensitive read or write operation (watchlist updates, camera changes, evidence views) must be synchronously logged to the `AuditLog` table.
