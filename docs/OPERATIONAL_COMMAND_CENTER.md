# NETRAVAHA — Operational Intelligence Command Center
## Unified CCTV Intelligence Platform — Phase 9 Documentation
### Gujarat Police Innovation Challenge 2026

---

## 1. Overview & Operational Problem
NETRAVAHA provides an end-to-end tactical CCTV federation platform across multiple Gujarat jurisdictions (Ahmedabad, Surat, Vadodara, Rajkot, Gandhinagar, and the NE-1 Expressway Corridor). 

Prior to Phase 9, individual subsystems—Camera Registry, GIS Spatial Map, Live CCTV Grid, ANPR Vehicle Timeline, Watchlist Management, Alert Engine, Audit Ledger, and Investigation Command Center—were accessed as disparate pages. 

The **Operational Intelligence Command Center** (`frontend/app/page.tsx`) serves as the central operational hub for control room operators, field investigators, department administrators, and statutory compliance auditors. It delivers instant, unified visibility into:
1. **What is happening right now across the CCTV network?**
2. **Which camera streams are Online, Degraded, Offline, or in Error?**
3. **Which active alerts require triage?**
4. **Which watchlist plate hits occurred recently?**
5. **Which prototype jurisdictions are active and generating sightings?**
6. **Which vehicles are generating recent ANPR observations with SHA-256 evidence?**
7. **Is the multi-tier intelligence pipeline (Stream Gateway, Redis, PostGIS, AI Worker) healthy?**

---

## 2. Command Center Architecture

```
                                  OPERATIONAL COMMAND CENTER
                             [frontend/app/page.tsx - React/Next.js]
                                              |
                             GET /api/v1/dashboard/operational-summary
                                              |
                   +--------------------------+--------------------------+
                   |                                                     |
             [JWT Auth Guard]                                    [Roles Guard]
                   |                                                     |
                   +--------------------------+--------------------------+
                                              |
                                   [DashboardController]
                                              |
                                     [DashboardService]
                                              |
       +-----------------------+--------------+---------------+-----------------------+
       |                       |                              |                       |
[Prisma / PostGIS]     [MediaGatewayService]         [Events / Redis]         [AuditLedger]
  - Cameras               - MediaMTX state             - Redis ping             - Audit logs
  - Alerts                - RTSP stream paths          - Stream registry        - Investigation
  - Watchlists                                         - ANPR events              actions
  - Observations
```

### Backend Aggregation Endpoint
- **Route:** `GET /api/v1/dashboard/operational-summary`
- **Controller:** `backend/src/modules/dashboard/dashboard.controller.ts`
- **Service:** `backend/src/modules/dashboard/dashboard.service.ts`
- **Design Principle:** Single round-trip aggregation preventing frontend N+1 API overhead. Reuses existing database models, `MediaGatewayService`, and `EventsModule`.

---

## 3. Subsystem Health Semantics

The operational health strip measures genuine system state and explicitly surfaces `STATUS NOT AVAILABLE` if a component cannot be measured:

| Subsystem | Measured Metrics | Health Status States |
| :--- | :--- | :--- |
| **CAMERA NETWORK** | State machine aggregation over all registered cameras | `ONLINE` (all online), `DEGRADED` (some degraded/offline/error), `OFFLINE` (none online) |
| **STREAM GATEWAY** | MediaMTX REST API `/v3/paths/list` connectivity & stream listener | `HEALTHY` (reachable), `DEGRADED` (control plane unreachable), `UNAVAILABLE` (gateway error) |
| **AI PIPELINE** | Redis stream connectivity & ANPR consumer telemetry | `HEALTHY` (connected, stream active), `DEGRADED` (connectivity issue) |
| **DATABASE & POSTGIS** | PostgreSQL `SELECT 1` & PostGIS spatial query validation | `HEALTHY` (connected), `UNAVAILABLE` (connection offline) |
| **EVENT PIPELINE** | Redis pub/sub and buffer registry health | `HEALTHY` (ping latency optimal), `DEGRADED` (timed out) |

---

## 4. Camera Network Overview
- **Total Registered Cameras:** Displays exact configured count (e.g. 15 prototype cameras).
- **Online Cameras:** Active streams transmitting readable RTSP/HLS data.
- **Degraded Streams:** Streams experiencing packet loss, reconnect backoff, or authentication challenges.
- **Offline Cameras:** Standby or non-broadcasting demo streams.
- **Error / Fault:** Streams exceeding maximum reconnection attempts requiring technical triage.
- **Notice:** Distinctly states *Configured Prototype Fleet* within an *Authorized Ingestion Boundary*.

---

## 5. Active Alert Center
- Real-time aggregation of non-resolved incidents (`OPEN`, `ACKNOWLEDGED`, `INVESTIGATING`).
- Severity breakdown: `CRITICAL` (e.g. amber alerts, stolen vehicles), `HIGH` (e.g. speed violations), `MEDIUM`.
- Each alert card provides:
  - Alert ID & timestamp (IST formatted).
  - Target plate (with direct deep-link to `/vehicles/{plate}`).
  - Detection camera & jurisdiction city.
  - Reason & Category summary.
  - `OPEN ALERT` action navigating directly to the triage alert console (`/alerts`).

---

## 6. Watchlist Intelligence
- Displays configured watchlist catalogs and active monitored plate entries.
- Real-time matches: Surfaces recent plate matches localized by the ANPR worker against flagged lists.
- Interactive deep link: Clicking any matched plate instantly launches the Investigation Command Center (`/vehicles/{plate}`).

---

## 7. Recent CCTV Sightings (Observation Stream)
- **Terminology Discipline:** Strictly titled `RECENT CCTV SIGHTINGS` / `RECENT VEHICLE OBSERVATIONS`.
- **Prohibited Terminology:** Never describes observations as "Live vehicle positions" or "Continuous GPS tracking".
- Exposes:
  - Timestamp (IST).
  - Monospace plate number.
  - Detection camera and city.
  - Multi-frame consensus count (e.g. 4 frames consensus).
  - ANPR model confidence score (e.g. 95% CONF).
  - Cryptographic evidence badge: `SHA-256 HASH VERIFIED` linking to stored frame packages.

---

## 8. Jurisdiction Activity (Gujarat Corridor)
The command center tracks 6 canonical prototype jurisdictions across Gujarat:
1. **Ahmedabad (AMD):** Urban arterial corridors & SG Highway junctions.
2. **Surat (SUR):** Ring Road and commercial zones.
3. **Vadodara (BDQ):** Central transit junctions and express entry points.
4. **Rajkot (RAJ):** Saurashtra regional gateway.
5. **Gandhinagar (GND):** State capital administrative grid.
6. **NE-1 Expressway Corridor (EXP):** High-speed inter-city toll checkpoints.

Metrics per jurisdiction:
- Total cameras & online camera ratio.
- Active alerts requiring operator action.
- Recent ANPR sightings localized.
- Direct link to GIS Camera Map or Camera Registry filtered by city.

---

## 9. Recent Investigation & Audit Activity
Provides a tamper-evident audit ledger for supervisory roles (`SUPER_ADMIN`, `SYSTEM_AUDITOR`, `INVESTIGATOR`, `DEPARTMENT_ADMIN`):
- Action types: `VEHICLE_SEARCH`, `VEHICLE_DETAIL_VIEW`, `VEHICLE_TIMELINE_SEARCH`, `EVIDENCE_VIEW`, `ALERT_CREATE`.
- Officer identity & role badge.
- Timestamp & target resource.
- Link to statutory immutable audit log (`/audit`).

---

## 10. Role-Based Access Control (RBAC) Behavior

| Role | Command Bar Actions | Audit Ledger | Evidence Export Links |
| :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | All (Vehicle, Alerts, GIS, Live, Cameras, Watchlists) | Full View | Authorized |
| **DEPARTMENT_ADMIN** | All (Vehicle, Alerts, GIS, Live, Cameras, Watchlists) | Full View | Authorized (Within Dept) |
| **INVESTIGATOR** | Vehicle, Alerts, GIS, Live, Cameras, Watchlists | Full View | Authorized |
| **OPERATOR** | Alerts, GIS, Live, Cameras, Watchlists | Hidden | Restricted |
| **SYSTEM_AUDITOR** | GIS, Cameras | Full View | Authorized (Read-Only) |
| **VIEWER** | GIS, Cameras | Hidden | Restricted |

---

## 11. Live Telemetry & Refresh Strategy
- **Initial Load:** Immediate aggregation upon mounting.
- **Background Sync:** Conservative 30-second polling interval avoiding aggressive server load.
- **Manual Sync:** Dedicated `REFRESH` button with animated spinner state.
- **Real-Time Alert Feed:** Integrates with `AlertWebSocketClient` via `/ws/alerts` for immediate alert triage without polling overhead.

---

## 12. Strategic Claim Discipline & Demo Data Boundaries
1. **Configured Prototype Sources:** The application explicitly displays that all data represents a configured prototype demonstration fleet (15 representative sources).
2. **No False Scale Claims:** Prohibits assertions of "80,000 cameras live", "nationwide continuous tracking", or "statewide police network integration".
3. **Legal Admissibility Integrity:** Conforms with Phase 8.1 standards. Netravaha computes and verifies SHA-256 digests and tamper-evident audit hashes; admissibility in judicial proceedings remains subject to independent statutory verification by competent authorities.
