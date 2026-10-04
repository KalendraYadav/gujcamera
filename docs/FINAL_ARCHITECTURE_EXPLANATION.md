# NETRAVAHA — FINAL ARCHITECTURE EXPLANATION
**For Police and Government Evaluators**
**Gujarat Police Innovation Challenge 2026**

---

## What NETRAVAHA Does

NETRAVAHA is a Unified CCTV Intelligence Platform designed for law enforcement.

It receives video feeds from traffic cameras, runs automatic number-plate recognition (ANPR) using AI, stores captured evidence, and allows investigators to trace the movement of a specific vehicle across multiple camera locations.

---

## Current Demonstration Architecture

The demonstration uses representative recorded traffic footage replayed through a simulated camera gateway. This is honest and standard practice for prototype demonstrations before live infrastructure integration.

`
Representative Traffic Video (MP4/MKV fixture)
  ↓
FFmpeg stream looper
  ↓
RTSP (Real-Time Streaming Protocol)
  ↓
MediaMTX Media Gateway (running in Docker)
  ↓
AI Worker (YOLO-based vehicle detection + ANPR plate recognition)
  ↓
Evidence stored with SHA-256 integrity digest
  ↓
Redis Streams (event pipeline)
  ↓
NestJS Backend (REST API, RBAC, audit logging)
  ↓
PostgreSQL 16 + PostGIS (geospatial sighting database)
  ↓
Next.js Tactical Frontend (investigation command center)
`

**This demonstration does NOT connect to Gujarat Police CCTV infrastructure.**

The architecture is designed so that authorized CCTV feeds can enter through the same boundary later, without changing the AI, backend, or investigation interface.

---

## Current Demonstration — Honest Description

| Component | What it is |
|-----------|-----------|
| Video Source | Representative traffic corridor footage (Ahmedabad/Gandhinagar area) |
| RTSP Gateway | Simulated using MediaMTX (same software used in production NVR systems) |
| AI Pipeline | Real YOLO-based inference — actual detections, actual OCR |
| Evidence | Actual captured frames, actual SHA-256 digests, actual database records |
| Investigation | Actual vehicle traces from actual AI detections — not injected |
| Alerts | Triggered by actual watchlist matches from actual sightings |

**Nothing in the database is pre-populated for the demonstration.**
The pipeline runs in real-time and generates all sightings, evidence, and alerts during the demonstration.

---

## Future Deployment Architecture

When authorized for production integration:

`
Authorized Departmental NVR / VMS / IP Camera
  ↓
RTSP / ONVIF / VMS Adapter (authorized departmental credentials)
  ↓
Same MediaMTX Media Gateway
  ↓
Same AI Worker
  ↓
Same Evidence Storage
  ↓
Same Investigation Platform
  ↓
Same GIS and Route Intelligence
`

The boundary where live cameras would connect is clearly defined.  
Only the RTSP/ONVIF source changes. Everything downstream remains identical.

---

## What NETRAVAHA Does NOT Claim

| Claim | Status |
|-------|--------|
| Connected to Gujarat Police live CCTV | ❌ NOT in this demonstration |
| Statewide live camera coverage | ❌ NOT in this demonstration |
| 80,000 live cameras | ❌ NOT in any version — this is unverified |
| Continuous GPS vehicle tracking | ❌ NETRAVAHA does discrete CCTV sighting correlation, not GPS |
| Legal admissibility guarantee | ❌ SHA-256 integrity verification is a data integrity check. Admissibility requires judicial procedural review |
| Nationwide police network integration | ❌ NOT in this demonstration |

---

## Key Capabilities Already Implemented

| Capability | Status |
|------------|--------|
| RTSP/HLS live stream ingestion | ✅ Working |
| YOLO vehicle detection | ✅ Working |
| ANPR (Indian HSRP plate format) | ✅ Working |
| Multi-frame plate consensus | ✅ Working |
| SHA-256 evidence integrity | ✅ Working |
| Spatio-temporal sighting correlation | ✅ Working (Phase 10 algorithm) |
| Vehicle timeline and GIS visualization | ✅ Working |
| Watchlist matching and CRITICAL alerts | ✅ Working |
| Audit logging (all access logged) | ✅ Working |
| Role-Based Access Control (RBAC) | ✅ Working |
| Camera health monitoring | ✅ Working |
| Evidence export with integrity chain | ✅ Working |

---

## Terminology Guide (For Evaluators)

| Term | Meaning |
|------|---------|
| **SIMULATED LIVE CCTV** | Representative footage replayed over RTSP. Same protocol used by real cameras. |
| **REPRESENTATIVE CORRIDOR DEPLOYMENT** | Demonstration cameras map to real Ahmedabad-Gandhinagar corridor locations. |
| **SPATIO-TEMPORAL SIGHTING CORRELATION** | Matching camera observations by plate similarity + time window + geographic distance — not GPS. |
| **CORRELATION CANDIDATE** | A pair of sightings that may be the same vehicle, scored by algorithm. Requires investigator judgment. |
| **INTEGRITY VERIFIED** | SHA-256 hash of stored evidence frame matches the digest recorded at capture time. |
| **AUTHORIZED INGESTION BOUNDARY** | The RTSP entry point where live departmental camera feeds would connect in production. |

---

## Summary for Evaluators

NETRAVAHA demonstrates a **complete, working, end-to-end intelligence pipeline** — from camera to investigation — using representative data. The platform is architecturally ready to receive authorized live CCTV feeds through the same RTSP boundary without any redesign of the AI, backend, or investigation interface.

---

*NETRAVAHA — Gujarat Police Innovation Challenge 2026*  
*PHASE 15 — FINAL ARCHITECTURE EXPLANATION*
