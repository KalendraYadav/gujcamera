# Phase 4E: Watchlist Management & Real-Time Alert Delivery

**Gujarat Police Innovation Challenge 2026 — Unified CCTV Intelligence Platform**
*Source of Truth: `master_architecture.md` (Sections 6.2, 6.3, 7.1, 8.2, 14.2)*

---

## 1. Executive Summary & Objective

Phase 4E closes the core police command-room operational loop:

```
CCTV RTSP / Stream
       ↓
AI Worker (YOLO + Plate Consensus OCR)
       ↓
Vehicle Sighting Ingestion (Redis Stream)
       ↓
Backend Watchlist Matcher (AlertsService)
       ↓
Authoritative PostgreSQL Alert Persistence
       ↓
Native WebSocket Broadcast (`WS /ws/alerts`)
       ↓
Operator Alert UI (Next.js Command Console)
       ↓
Triage & Lifecycle Transitions (Acknowledge / Investigate / Resolve / Dismiss)
       ↓
Investigation Link (`/vehicles/[plate]`)
```

The backend watchlist matching and alert persistence engines were already built and verified in Phase 2E. Phase 4E establishes:
1. Native NestJS WebSocket Gateway at `WS /ws/alerts` for instantaneous, event-driven alert delivery to authorized police operators.
2. In-band JWT WebSocket handshake authentication preventing token exposure in URLs or query strings.
3. Strict Server-Side RBAC (`OPERATOR`, `INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`) guarding the alert feed.
4. Resilient frontend WebSocket client with auto-reconnection and seamless REST polling fallback (6-second intervals).
5. Comprehensive Watchlist Management UI at `/watchlist`.
6. Live Alert Triage Console at `/alerts` with audio alerts, alert deduplication, and direct investigation deep-links.

---

## 2. Architecture & Delivery Semantics

### Real-Time Best-Effort Push

WebSocket delivery is designed as **real-time best-effort push**, NOT durable event storage or guaranteed delivery:
* **Authoritative Persistence**: PostgreSQL remains the single source of truth for all alert records and state transitions.
* **Transient Push**: Newly detected matches are broadcast directly from `AlertsService.processSightingMatch` and `AlertsService.transitionAlertStatus`.
* **State Recovery**: If a client disconnects, reconnects, or packet loss occurs, the client immediately requests the authoritative alert list from `GET /api/v1/alerts`.
* **Payload Discipline**: WebSocket alert payloads contain strictly metadata (alert ID, plate, severity, status, timestamps, camera ID, watchlist category, confidence, and evidence crop URL where available). Under no circumstances are raw video frames, full binary JPEGs, JWT tokens, or credentials transmitted over WebSocket.

```
+-------------------------------------------------------------------------+
|                              Backend Layer                              |
|                                                                         |
|  [Sighting Event] ---> [AlertsService] ---> [PostgreSQL DB (Authoritative)]
|                               |                                         |
|                               v                                         |
|                       [AlertsGateway]                                   |
|                     (WS /ws/alerts)                                     |
+------------------------------|------------------------------------------+
                               | Native WebSocket Push
                               v
+-------------------------------------------------------------------------+
|                             Frontend Layer                              |
|                                                                         |
|  [AlertWebSocketClient]                                                 |
|    |                                                                    |
|    +---> Connection Status: LIVE (Primary)                              |
|    |                                                                    |
|    +---> On Disconnect / Failure:                                       |
|    |       -> Reconnection attempts with exponential backoff           |
|    |       -> Fallback to REST Polling (GET /api/v1/alerts every 6s)   |
|    |       -> State indicator: POLLING FALLBACK                         |
|    |                                                                    |
|    +---> Deduplication:                                                 |
|            -> Authoritative deduplication by Alert ID                   |
|            -> Zero duplicate cards rendered                             |
+-------------------------------------------------------------------------+
```

---

## 3. Backend WebSocket Implementation

### Package Dependencies Added
- `@nestjs/websockets@^10.4.15` and `@nestjs/platform-ws@^10.4.15`: Official NestJS WebSocket gateway integration using native `ws`.
- `ws` (`^8.21.3`) and `@types/ws`: High-performance, lightweight, standards-compliant WebSocket library.
- *Rationale*: Native `ws` avoids the heavy engine.io overhead of Socket.IO, introduces zero external brokers, and integrates seamlessly with NestJS dependency injection.

### Gateway Details (`AlertsGateway`)
- **Canonical Endpoint**: `WS /ws/alerts`
- **Adapter**: NestJS `WsAdapter(app)` registered in `backend/src/main.ts`.
- **In-Band Authentication**:
  1. Client establishes connection without passing sensitive JWTs in the query string or URL (preventing token leakage in reverse proxy access logs, browser history, and WAF logs).
  2. Gateway grants a strict **5-second authentication window**.
  3. Client transmits:
     ```json
     { "type": "auth", "token": "<JWT_ACCESS_TOKEN>" }
     ```
  4. Gateway validates token via `JwtService.verifyAsync()`.
  5. Gateway verifies user identity in PostgreSQL and asserts valid role (`OPERATOR`, `INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`).
  6. If valid: client is tagged as authenticated and receives:
     ```json
     { "event": "connection_ack", "data": { "authenticated": true, "user_id": "...", "role": "..." } }
     ```
  7. If invalid, unauthenticated, unauthorized role, or authentication timeout expires: Gateway terminates socket with explicit close codes (`4401 Unauthorized`, `4403 Forbidden`, or `4408 Timeout`).
- **Broadcast Events**:
  - `alert.created`: Triggered when an ANPR sighting matches an active watchlist entry.
  - `alert.updated`: Triggered when an operator or investigator changes alert status (e.g. `ACKNOWLEDGED`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`).

---

## 4. Frontend Architecture & Pages

### 1. Watchlist Management UI (`/watchlist`)
- Replaces former static placeholder with full master-detail console.
- **Catalog Navigation**: Filterable list of all registered watchlists displaying division, owner, and active plate counts.
- **RBAC Enforcement**:
  - `SUPER_ADMIN` and `DEPARTMENT_ADMIN`: Can create new watchlists (`POST /api/v1/watchlists`), activate/deactivate lists, and add/remove flagged vehicle entries.
  - `INVESTIGATOR`: Can flag license plates (`POST /api/v1/watchlists/:id/entries`) and deactivate entries (`POST /api/v1/watchlists/entries/:id/deactivate`).
  - `OPERATOR`: Read-only visibility into target watchlists; mutation buttons are hidden in UI and strictly blocked by backend guards.
- **Entry Details Table**: Normalized plate, severity priority badge (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), category, reason / FIR case reference, active status toggle.

### 2. Live Alerts Triage Console (`/alerts`)
- Replaces former static placeholder with command-center live alert triage console.
- **Live Feed**: Connects to `WS /ws/alerts` on mount; receives instant alert pushes.
- **Polling Fallback**: If WebSocket disconnects or fails, automatically engages 6-second REST polling fallback (`GET /api/v1/alerts`).
- **Connection Indicator**: Prominently displays connection health:
  - `LIVE`: Native WebSocket operational (green pulse).
  - `RECONNECTING`: Attempting socket recovery (yellow pulse).
  - `POLLING FALLBACK`: Operating via periodic REST synchronization (amber).
  - `OFFLINE`: Disconnected from all backend telemetry (red).
- **Deduplication Key**: Alert ID serves as authoritative deduplication key; identical alerts received via WebSocket and REST merge into a single UI card without jumping or flickering.
- **Triage Actions (Authoritative Server State Machine)**:
  - `NEW` → `ACKNOWLEDGED`: Operator / Super Admin action (`POST /alerts/:id/acknowledge`).
  - `ACKNOWLEDGED` → `INVESTIGATING`: Investigator / Super Admin action (`POST /alerts/:id/investigate`).
  - `INVESTIGATING` → `RESOLVED`: Investigator / Super Admin action (`POST /alerts/:id/resolve`).
  - `ANY` → `DISMISSED`: Mandatory audit dismissal reason modal (`POST /alerts/:id/dismiss`).
- **Tactical Audio Notification**: Discrete Web Audio API chime synthesizes high/low attention tones on new `CRITICAL` alerts with zero external audio assets and persistent mute toggle.
- **Investigation Deep-Link**: Each alert card links directly to `/vehicles/[plate]`, passing the operator into the cross-camera timeline and GIS route reconstruction.

---

## 5. Security & Governance

### RBAC Matrix

| Role | Watchlist Read | Watchlist Mutate | View Live Alerts | Acknowledge Alert | Investigate / Resolve Alert | Dismiss Alert |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **OPERATOR** | Yes | No | Yes | Yes | No | Yes (with reason) |
| **INVESTIGATOR** | Yes | Add/Deactivate Entry | Yes | No | Yes | Yes (with reason) |
| **DEPARTMENT_ADMIN** | Yes | Full CRUD | Yes | No | Yes | Yes (with reason) |
| **SUPER_ADMIN** | Yes | Full CRUD | Yes | Yes | Yes | Yes (with reason) |

### Synchronous Audit Logging
All state transitions (`ACKNOWLEDGE`, `INVESTIGATE`, `RESOLVE`, `DISMISS`) and watchlist mutations trigger synchronous records in the PostgreSQL `AuditLog` table capturing user ID, client IP, action name, and entity ID. No secrets, passwords, or JWTs are logged.

### Simulated Data Governance
The application maintains persistent visual labeling (`SIMULATED DATA`) on all screens. All match outputs represent synthetic demonstration datasets. The system explicitly disclaims facial recognition, visual re-identification, and person tracking; correlations are strictly based on normalized license plate strings.

---

## 6. Known Limitations & Scaling Path

### Single-Instance In-Memory WebSocket Broadcasting (PoC Scope)
- **Current Behavior**: `AlertsGateway` manages connected WebSocket clients in-memory on the active Node.js server instance.
- **Limitation**: In a multi-instance clustered deployment behind a load balancer, clients connected to Instance A will not receive broadcasts triggered on Instance B without an external pub/sub bus.
- **Production Scaling Path**:
  1. Introduce **Redis Pub/Sub** via a shared `alerts:broadcast` channel.
  2. Each backend instance subscribes to the channel and pushes to its local connected sockets.
  3. This maintains stateless NestJS backend pods while scaling to arbitrary operator connection counts.

---

## 7. Remaining Next-Phase Items

### Protocol Adapters Requirement
The architecture requires ≥2 real vendor protocol adapters (e.g. ONVIF Profile S and PSIA/vendor API). In accordance with Phase 4E instructions, no fake or mock adapters were fabricated. This requirement remains cleanly tracked for Phase 5.
