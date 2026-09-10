# PHASE 3F — Event Boundary, Redis Streams & Persistent Sighting Ingestion

**Gujarat Police Innovation Challenge 2026 — Unified CCTV Intelligence Platform**  
**Document Reference:** `docs/PHASE_3F_EVENT_INGESTION.md`  
**Source of Truth:** `master_architecture.md` (Sections 5.2, 5.3, 6.2, 7.1, 7.3, 8.1, 11, 13)  
**Status:** HARDENED & VERIFIED  

---

## 1. Executive Architectural Summary & Delivery Semantics

Phase 3F establishes the canonical, decoupled **Event Boundary** between the high-throughput Python AI Vision Worker and the NestJS Backend.

### Strict Delivery Semantics
> **Canonical Architectural Statement:**  
> **"Redis Streams provides at-least-once delivery. Application-level idempotency prevents duplicate canonical domain records from duplicate deliveries."**

The system does **NOT** claim true "exactly-once messaging" across network partitions. Instead, it provides **effectively idempotent processing for the protected domain operation** through deterministic primary key constraints and domain-level deduplication.

### Strict Architectural Boundaries
1. **AI Worker Invariant:** The AI Worker operates asynchronously on video streams. It **MUST NOT** directly access, query, or mutate PostgreSQL. No PostgreSQL client or outbox table exists in the AI worker.
2. **Backend Persistence Ownership:** The NestJS modular monolith is the sole custodian of PostgreSQL state, entity lifecycles, and domain invariants (`Vehicle`, `VehicleSighting`, `Evidence`, `Watchlist`, `Alert`).
3. **Transport Boundary:** Redis Streams serves as the message broker decoupling AI Worker ingestion from NestJS persistence and watchlist evaluation.
4. **False-Success Guarantee Preservation:** An event is emitted to Redis **only if** multi-frame consensus was accepted **and** the JPEG forensic snapshot was successfully committed to MinIO with SHA-256 integrity hash.
5. **Application-Level Idempotency:** The NestJS consumer enforces idempotency via primary key constraints on `VehicleSighting.id` (UUID PK) and deduplication on `(source_sighting_id, watchlist_entry_id)` in the Alert Engine.

```
[ CCTV Streams / MediaMTX ]
            ↓
   [ AI Vision Worker ]
            ↓
  Vehicle Detection (YOLO)
            ↓
  Plate Localization
            ↓
  Tesseract OCR & Normalization
            ↓
  5–8 Frame Majority Consensus
            ↓
  MinIO Evidence Snapshot Upload + SHA-256 Hash
            ↓
  Construct vehicle.sighting_created Event
            ↓
  In-Process Bounded Retry Buffer (if Redis offline)
            ↓
  [ Redis Stream: gujcamera:events:vehicle-sightings ]
            ↓
   (XREADGROUP via gujcamera:backend:sightings-group)
            ↓
   [ NestJS Backend Consumer ]
            ↓
  Validate Schema ("1.0") & Unambiguous Camera Resolution
            ↓
  PostgreSQL Transaction ($transaction):
    ├── Upsert Vehicle (plate_normalized, last_seen)
    ├── Insert VehicleSighting (sighting_id PK)
    └── Insert Evidence (evidence_id PK, sha256, storage_ref)
            ↓
  AlertsService.processSightingMatch:
    ├── Active Watchlist Plate Match
    └── Alert Created (Deduplicated on sourceSightingId + watchlistEntryId)
            ↓
  XACK message (Acknowledged strictly AFTER DB commit and alert processing)
```

---

## 2. Redis Streams Infrastructure Configuration

| Parameter | Environment Variable | Default Value | Description |
|---|---|---|---|
| Stream Name | `REDIS_STREAM_VEHICLE_SIGHTINGS` | `gujcamera:events:vehicle-sightings` | Dedicated stream for ANPR sighting domain events |
| Consumer Group | `REDIS_CONSUMER_GROUP_SIGHTINGS` | `gujcamera:backend:sightings-group` | Consumer group for scaled backend consumers |
| Redis Host | `REDIS_HOST` / `AI_WORKER_REDIS_HOST` | `localhost` (host) / `redis` (Docker) | Redis host endpoint |
| Redis Port | `REDIS_PORT` | `6379` | Redis TCP port |
| Connection Timeout | `REDIS_CONNECT_TIMEOUT_SECONDS` | `3.0` | Socket connect/read timeout |
| AI Publishing Flag | `REDIS_PUBLISH_ENABLED` | `true` | Toggle AI Worker event emission |
| Consumer Enabled | `REDIS_CONSUMER_ENABLED` | `true` | Toggle Backend stream consumer loop |
| Retry Buffer Size | `AI_EVENT_BUFFER_MAX_SIZE` | `100` | In-process FIFO buffer limit during Redis outages |
| Reconnect Backoff | `AI_EVENT_RECONNECT_BACKOFF` | `2.0` | Seconds to wait between reconnect attempts |

---

## 3. Canonical Domain Event Contract

### Event Specification
- **Event Name:** `vehicle.sighting_created`
- **Schema Version:** `"1.0"` (enforced strictly; unsupported versions rejected safely)
- **Producer:** `ai-worker`
- **Consumer:** `backend` (`SightingEventConsumer`)

```json
{
  "event_id": "c894b95f-3315-46aa-9d8a-6b45a6ff1a09",
  "event_type": "vehicle.sighting_created",
  "schema_version": "1.0",
  "occurred_at": "2026-09-10T09:14:00.000Z",
  "producer": "ai-worker",
  "sighting_id": "8f3bc421-4f40-4286-8ad3-9e41b21ec46b",
  "evidence_id": "31b017b2-601e-45fa-bb4b-325cfbfec522",
  "camera_id": "CAM-AHM-01",
  "plate_normalized": "GJ01AB1234",
  "confidence": 0.9452,
  "consensus_of": 5,
  "total_observations": 5,
  "storage_ref": "s3://police-evidence-vault/evidence/2026/09/10/CAM-AHM-01/snap_8f3bc421.jpg",
  "evidence_hash": "315cb76daa3caa030ef0de4aecbaafa8dd20c114901d940682cceb1a9fa42db7",
  "captured_at": "2026-09-10T09:13:58.200Z",
  "correlation_id": "c894b95f-3315-46aa-9d8a-6b45a6ff1a09"
}
```

### Critical Field Invariants
1. `sighting_id` and `evidence_id`: Pre-allocated UUIDs guaranteeing deterministic primary keys across retries.
2. `storage_ref`: Verified MinIO S3 object reference (`s3://...`), never a fake or fallback URI.
3. `evidence_hash`: 64-character lowercase SHA-256 hexadecimal string calculated over the exact bytes stored in MinIO.
4. **Zero Binary Payloads:** Raw video frames and JPEG binaries are strictly forbidden in the Redis stream message (< 1KB JSON metadata only).

---

## 4. AI-Worker Redis Publish Durability & Failure Policy

For this hackathon PoC, the AI worker operates an **in-process bounded retry buffer** (`deque(maxlen=100)`) with exponential/bounded backoff.

### Deterministic Failure Matrix
- **A. Redis is healthy:**  
  Event publishes immediately via `XADD`. Returns Redis message ID (e.g. `1710000000000-0`). `total_published` incremented. No buffering.
- **B. Redis becomes unavailable temporarily:**  
  Direct publication fails (`RedisConnectionError` or `RedisTimeoutError`). Event is placed into the in-process FIFO retry buffer. The AI worker does **NOT** crash. `total_publish_errors` and `total_buffered` are incremented.
- **C. Redis remains unavailable for several seconds:**  
  Subsequent accepted consensus events continue to be appended to the FIFO buffer (up to 100 events). Reconnect attempts obey a 2.0-second backoff delay (`_last_connect_attempt`), preventing tight CPU polling loops. `event_id`, `sighting_id`, `evidence_hash`, and payload remain completely immutable.
- **D. Redis becomes available again:**  
  On the next publish or explicit `flush_buffer()`, reconnection succeeds. The publisher flushes buffered events in strict FIFO order via `XADD`. Upon successful publication, items are popped from the buffer. `total_retried_success` is incremented.
- **E. AI worker is restarted while Redis is unavailable:**  
  **Honest Limitation:** Because this is an in-memory PoC mechanism, unflushed buffered events are lost if the AI worker process terminates before Redis reconnects. This is explicitly logged upon shutdown (`close()`). A fully durable outbox (e.g. local SQLite or NVMe write-ahead log) is deferred to production hardening.
- **F. Buffer reaches configured capacity (`max_buffer_size = 100`):**  
  Oldest event is dropped (`popleft()`), `total_buffer_drops` is incremented, and an error is logged with the dropped event's `sighting_id`. The newer event is admitted to ensure recent traffic is prioritized during extended outages.

---

## 5. Backend ACK Order, Idempotency & Transaction Boundaries

### A. Strict Acknowledgment Order
The NestJS consumer enforces the following linear processing pipeline:
```
Redis message received
    ↓
1. Deserialization & Contract Validation (validateVehicleSightingCreatedPayload)
    ↓
2. Unambiguous Camera Resolution (resolveCameraId)
    ↓
3. License Plate Re-normalization (normalizeLicensePlate)
    ↓
4. Idempotency Check (findUnique by sighting_id)
    ↓
5. Database Transaction ($transaction: Vehicle upsert, VehicleSighting insert, Evidence insert)
    ↓
6. Watchlist Matching & Alert Processing (AlertsService.processSightingMatch)
    ↓
7. Redis Stream XACK (Acknowledged strictly AFTER steps 5 and 6 complete)
```
- **Invariant:** `XACK` can **NEVER** happen before durable PostgreSQL persistence.
- **Database Failure Behavior:** If the database transaction fails, `safeAck` is **NOT** invoked. The transaction rolls back atomically, no partial database state is created, and the message remains in the Pending Entries List (PEL) for retry.

### B. Idempotency Under Concurrency
- **Single Delivery Re-run:** If an event is re-delivered, `findUnique({ where: { id: sighting_id } })` immediately identifies the existing record, skips insertion, logs an idempotent skip, and calls `safeAck`.
- **Concurrent Race (Consumer A vs Consumer B):** If two consumer threads process duplicate messages simultaneously, PostgreSQL's primary key constraint on `VehicleSighting.id` throws unique violation code `P2002`. The consumer catches `P2002`, logs a safe idempotent concurrent outcome, and acknowledges the message.
- **Prisma Schema Confirmation:** **Zero schema modifications** and **zero migrations** are required. Existing primary keys and unique indexes provide full idempotency.

### C. Alert Transaction Boundary
- **Service Boundary:** Sighting and evidence persistence occurs inside `prisma.$transaction`. Watchlist evaluation and alert creation occur immediately **after** the transaction via `AlertsService.processSightingMatch(sighting_id)`.
- **Atomicity Disclosure:** Sighting persistence and alert creation are **NOT** in a single distributed transaction. Sighting persistence is durable even if watchlist processing encounters an unexpected error.
- **Alert Deduplication:** Duplicate alert creation is strictly prevented by `AlertsService.processSightingMatch` checking for existing alerts with `(sourceSightingId, watchlistEntryId)`. Re-delivering a sighting event never produces duplicate alerts.

### D. Camera Resolution Invariant
`resolveCameraId(cameraIdOrCode)` guarantees deterministic 1-to-1 matching:
1. Exact UUID lookup via `prisma.camera.findUnique`.
2. Exact camera code lookup via `equals: trimmed`, `startsWith: "${trimmed}:"`, or `startsWith: "${trimmed} "`.
3. If multiple cameras match (ambiguity), resolution **fails and returns null**.
4. If resolution fails:
   - Does **NOT** create a new camera.
   - Does **NOT** silently map to another camera.
   - Does **NOT** acknowledge the message (`safeAck` is skipped). The message remains unacknowledged for retry once the camera is registered.

### E. Poison Message Handling
- If a message contains invalid JSON, an unsupported `schema_version` (e.g. `"2.0"`), or malformed fields (e.g. invalid SHA-256 hash length), it cannot be recovered by retrying.
- The consumer logs the error, rejects the event without database writes, and safely acknowledges the message (`safeAck`) to prevent an infinite retry loop blocking the consumer group.
- **Honest Disclosure:** No Dead Letter Queue (DLQ) is implemented in this hackathon PoC; malformed messages are safely acknowledged after structured error logging.

---

## 6. Testing & Verification Summary

### AI Worker Test Results
- **Publish & Resilience Suite:** `ai-worker/tests/test_event_publisher.py` (13 tests)
  - Valid event serialization & roundtrip
  - Schema version validation (`"1.0"` enforced, `"2.0"` rejected)
  - Field invariant constraints (hash format, confidence range, storage ref)
  - Zero raw video/frame transmission (< 1KB payload)
  - Immediate publish success via `XADD`
  - Offline resilience (no worker crash, error count tracked)
  - Socket timeout handling
  - In-process bounded retry buffer with payload and UUID immutability
  - Bounded buffer overflow handling (drops oldest event)
  - Backoff avoids tight polling loops
  - Accepted consensus + MinIO success -> Event published
  - Rejected consensus -> No event published
  - MinIO storage failure -> No event published (Phase 3E false-success guarantee)
- **All Container Tests:** `docker compose exec ai-worker python -m pytest tests/ -v`
- **Result:** **104 passed, 0 failed, 0 skipped**.

### Backend Test Results
- **E2E Ingestion Suite:** `backend/test/events-ingestion.e2e-spec.ts` (11 tests)
  - GET `/api/v1/health` reports Redis CONNECTED and event_consumer RUNNING
  - Schema version rejection (`2.0` rejected)
  - Contract validation rejection
  - Atomic persistence of `Vehicle`, `VehicleSighting`, and `Evidence`
  - Single-message duplicate delivery idempotency (zero duplicate DB records)
  - Active watchlist plate sighting creates Alert (`CRITICAL`, `NEW`)
  - Duplicate sighting for watchlisted plate creates zero duplicate alerts
  - Inactive watchlist plate creates Sighting but zero alerts
  - Full Redis Streams pipeline (`XADD` -> Consumer Group -> DB -> `XACK`)
  - Camera resolution failure causes non-ACK / retryable state
  - Poison message (malformed JSON) logged and safely acknowledged
- **All Backend E2E Tests:** `npm run test:e2e` (6 suites: App, Cameras, Vehicles, Watchlists, Alerts, Events Ingestion)
- **Result:** **6 passed, 6 total suites (108 tests passed, 0 failed)**.
- **Database Verification:** `npm run db:verify` (**11 passed, 0 failed**).

---

## 7. Commands to Run Locally

### Start Infrastructure
```bash
docker compose up -d
docker compose config
```

### Build & Run AI Worker Tests Inside Container
```bash
docker compose build ai-worker
docker compose exec ai-worker python -m pytest tests/ -v
```

### Run Backend Build & E2E Test Suite
```bash
cd backend
npm run build
npm run test:e2e
npm run db:verify
```

### Inspect Health Endpoint
```bash
curl http://localhost:3000/api/v1/health
```
*(Response confirms application UP, database CONNECTED, postgis OPERATIONAL, redis CONNECTED, and event_consumer RUNNING)*

---

## 8. Implemented Now vs Future Production Hardening

### IMPLEMENTED NOW (Phase 3F)
- Stream-based event boundary between AI Worker and Backend.
- `VehicleSightingCreatedEvent` contract with strict versioning `"1.0"`.
- Redis Streams publisher with in-process bounded retry buffer and reconnect backoff in AI Worker.
- Redis Streams consumer group reader with transaction-safe PostgreSQL persistence in Backend.
- Automatic integration with Phase 2E Watchlist and Alert Engine.
- End-to-end database idempotency with zero Prisma schema changes.
- Safe poison message termination preventing infinite consumer blocking.
- Unambiguous camera resolution with strict ambiguity detection.
- Health endpoint reporting Redis and consumer group status.
- Comprehensive automated unit and E2E test suites on both services.

### FUTURE PRODUCTION HARDENING (Post-PoC)
- Persistent write-ahead outbox log on AI Worker disk to survive worker process termination during extended Redis outages.
- Dedicated Dead-Letter Stream (`gujcamera:events:dead-letter`) for automated quarantine of poisoned events after N retries.
- Cross-camera identity clustering across non-overlapping streams (Phase 3G).
- Live WebSocket push of `alert.created` events to frontend operators (Phase 3G / Phase 4).
- Production Redis Sentinel / Cluster high-availability setup.
