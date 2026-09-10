# Phase 2 Readiness Report — Backend Foundation & Modular API
**Gujarat Police Innovation Challenge 2026 — Unified CCTV Intelligence Platform**  
*Source of Truth: `master_architecture.md` (Sections 5.2, 6, 7, 8, 20, 26)*

---

## 1. Executive Summary & Phase 2 Scope

Phase 2 establishes the core application backend that connects the database foundation (completed in Phase 1) with the external world. Following **Section 5.2 of `master_architecture.md`**, the backend is constructed as a **Modular Monolith** using **NestJS (TypeScript)**. This architecture provides strict module boundaries, enterprise dependency injection, and centralized error/auth pipelines while avoiding the premature operational complexity of microservices during hackathon development.

### In Scope for Phase 2:
1. **Application Bootstrap & Architecture Core**:
   * NestJS application setup in `backend/src/` with structured configuration (`ConfigModule`), Prisma service lifecycle management, global logging, and global validation pipes.
   * Centralized HTTP error filter mapping all exceptions to the canonical schema: `{ "error_code": "string", "message": "string", "request_id": "uuid" }`.
   * Correlation ID middleware (`X-Request-Id`) propagating trace IDs across requests, database queries, and audit logs.
2. **Authentication & Server-Side RBAC**:
   * JWT authentication with 15-minute access tokens and refresh token rotation.
   * Server-side `JwtAuthGuard` and `RolesGuard` enforcing access rules based on user roles (`SUPER_ADMIN`, `DEPARTMENT_ADMIN`, `INVESTIGATOR`, `OPERATOR`, `SYSTEM_AUDITOR`).
   * Seamless authentication for development demo identities (`admin.demo@gujcamera.local`, `operator.demo@gujcamera.local`, `investigator.demo@gujcamera.local`).
3. **Core Modular Domain APIs**:
   * **Auth Module (`/api/v1/auth`)**: Login, refresh, profile inspection (`/me`), and logout.
   * **Camera Registry & GIS Module (`/api/v1/cameras`)**: CRUD operations, coordinate validation, spatial bounding-box (`bbox`) viewport filtering, and stream association.
   * **Camera Health Module (`/api/v1/cameras/health`)**: Fleet status summary, heartbeat ingestion, and status updates.
   * **Detections & Sightings Module (`/api/v1/detections`, `/api/v1/sightings`)**: Raw detection query endpoints and consensus sighting retrieval.
   * **Vehicle Search & Investigation Module (`/api/v1/vehicles`)**: Exact/prefix plate search, chronological timeline generation, and spatio-temporal route segment calculations.
   * **Watchlist Module (`/api/v1/watchlist`)**: Watchlist CRUD, active entry queries, and soft-delete/expiration.
   * **Alert Engine Module (`/api/v1/alerts`)**: Alert triage list, status transitions per the Section 6.3 state machine (`NEW` ➔ `ACKNOWLEDGED` ➔ `INVESTIGATING` ➔ `RESOLVED` / `DISMISSED`).
   * **Evidence & Audit Modules (`/api/v1/evidence`, `/api/v1/audit`)**: Tamper-evident frame lookup, SHA-256 verification, and compliance audit trail inspection.
   * **Health Check Endpoint (`/api/v1/health`)**: Live readiness probe verifying database, Redis, and MinIO connectivity.
4. **Automated Testing Suite**:
   * Unit tests for services and state machine transitions.
   * Integration tests with Supertest against live database endpoints covering auth, RBAC enforcement, input validation, spatial queries, and error handling.

---

## 2. Proposed Backend Module Structure

The project lives under `backend/src/` following idiomatic NestJS modular architecture:

```
backend/
├── src/
│   ├── main.ts                     # Application entrypoint & global middleware bootstrap
│   ├── app.module.ts               # Root module importing configuration & domain modules
│   │
│   ├── common/                     # Cross-cutting infrastructure utilities
│   │   ├── decorators/             # Custom decorators (@CurrentUser, @Roles, @Public)
│   │   ├── dto/                    # Standard pagination & filter DTOs
│   │   ├── filters/                # Global HttpExceptionFilter (standard error envelope)
│   │   ├── guards/                 # JwtAuthGuard, RolesGuard (RBAC)
│   │   ├── interceptors/           # LoggingInterceptor, TransformInterceptor (Request ID)
│   │   ├── middleware/             # RequestIdMiddleware
│   │   └── prisma/                 # PrismaService & global database provider
│   │
│   └── modules/                    # Domain vertical modules
│       ├── auth/                   # Authentication, JWT generation, password validation
│       ├── camera/                 # Camera registry, spatial queries, stream management
│       ├── health/                 # Camera fleet health & system probe endpoints
│       ├── vehicle/                # Vehicle search, sightings timeline, plausibility logic
│       ├── watchlist/              # Watchlist CRUD & active flagged plates
│       ├── alert/                  # Alert lifecycle state machine & operator feeds
│       ├── evidence/               # Evidence metadata & SHA-256 integrity checks
│       └── audit/                  # Synchronous/asynchronous audit log ingestion
│
├── prisma/                         # Managed in Phase 1 (schema.prisma, migrations, seeds)
├── test/                           # End-to-end integration test suites
├── package.json
└── tsconfig.json
```

---

## 3. Architecture-to-Implementation Mapping Table

| Architecture Domain | Module | Target Entity | Core Endpoints | Min Role Required | Audit Write Mode |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Authentication** | `AuthModule` | `User`, `Role` | `POST /auth/login`<br>`POST /auth/refresh`<br>`GET /auth/me` | Public<br>Public<br>Authenticated | Synchronous (Security) |
| **Camera Registry** | `CameraModule` | `Camera`, `Location`, `CameraStream`, `Connector` | `POST /cameras`<br>`GET /cameras`<br>`GET /cameras/:id`<br>`PATCH /cameras/:id`<br>`DELETE /cameras/:id` | Dept Admin<br>Viewer+<br>Viewer+<br>Dept Admin<br>Super Admin | Synchronous |
| **GIS & Spatial Viewport**| `CameraModule` | `Camera` (PostGIS) | `GET /cameras?bbox=minX,minY,maxX,maxY` | Viewer+ | None (Read) |
| **Camera Health** | `HealthModule` | `CameraHealth` | `GET /cameras/health/summary`<br>`POST /cameras/:id/heartbeat` | Viewer+<br>System/Connector | Asynchronous |
| **Vehicle Search** | `VehicleModule` | `Vehicle`, `VehicleSighting` | `GET /vehicles/search?q=`<br>`GET /vehicles/:plate/timeline` | Investigator+ | Synchronous on Timeline read |
| **Watchlists** | `WatchlistModule` | `Watchlist`, `WatchlistEntry` | `GET /watchlist`<br>`POST /watchlist/entries`<br>`PATCH /watchlist/entries/:id` | Viewer+<br>Investigator+<br>Investigator+ | Synchronous (SENSITIVE) |
| **Alert Engine** | `AlertModule` | `Alert`, `VehicleSighting` | `GET /alerts`<br>`GET /alerts/:id`<br>`PATCH /alerts/:id/status` | Operator+<br>Operator+<br>Operator / Investigator | Synchronous (SENSITIVE) |
| **Evidence Vault** | `EvidenceModule`| `Evidence` | `GET /evidence/:id`<br>`POST /evidence/verify` | Investigator+<br>Auditor+ | Synchronous (SENSITIVE) |
| **Audit Logs** | `AuditModule` | `AuditLog` | `GET /audit`<br>`GET /audit/:id` | System Auditor | Synchronous |
| **System Probe** | `HealthModule` | Infrastructure | `GET /health` | Public | None |

---

## 4. Authentication & RBAC Strategy

1. **Authentication Flow**:
   * Operators and investigators submit email/password to `POST /api/v1/auth/login`.
   * Passwords are verified against the stored bcrypt hash (`bcrypt.compare`).
   * On success, the server issues:
     * **Access Token**: Short-lived (15 minutes), signed with `JWT_SECRET`, containing `sub` (userId), `email`, `role`, and `departmentId`.
     * **Refresh Token**: Long-lived (7 days), signed with `JWT_REFRESH_SECRET`, stored in memory/cache with rotation.
   * `User.passwordHash` is excluded from all user-facing responses using DTO transformation (`@Exclude()`).
2. **Server-Side Authorization**:
   * Authorization is **never client-trusted**. A custom decorator `@Roles(RoleName.INVESTIGATOR, RoleName.SUPER_ADMIN)` attaches metadata to controllers.
   * `RolesGuard` inspects the verified JWT payload and rejects unauthorized requests with HTTP `403 Forbidden`.
3. **Demo Identity Support**:
   * The system ships with pre-seeded demo credentials verified in Phase 1:
     * `admin.demo@gujcamera.local` (Role: `SUPER_ADMIN`)
     * `operator.demo@gujcamera.local` (Role: `OPERATOR`)
     * `investigator.demo@gujcamera.local` (Role: `INVESTIGATOR`)
   * Seed password: `PoliceDemo@2026!`

---

## 5. Error-Handling & API Envelope Strategy

Per Section 8.1 of `master_architecture.md`, all errors must adhere to a standardized schema:

```json
{
  "error_code": "INVALID_STATE_TRANSITION",
  "message": "Alert in status 'RESOLVED' cannot transition to 'ACKNOWLEDGED'",
  "request_id": "a5d8b721-39c4-42f1-b8d9-92c71048e712",
  "timestamp": "2026-09-09T07:30:00.000Z"
}
```

### HTTP Status Code Mapping:
* `400 Bad Request`: Validation errors (malformed GPS coordinates, invalid plate syntax).
* `401 Unauthorized`: Missing, expired, or invalid JWT token.
* `403 Forbidden`: Authenticated user lacks the necessary RBAC role or department scope.
* `404 Not Found`: Resource does not exist.
* `409 Conflict`: Duplicate entry (duplicate camera endpoint, illegal state machine transition).
* `429 Too Many Requests`: Rate limit exceeded on expensive reads (e.g., timeline query).
* `500 Internal Server Error`: Unhandled server exceptions (sanitized; stack traces never leak to client).

---

## 6. Validation & Security Strategy

1. **Input Validation**:
   * Global `ValidationPipe` with `whitelist: true` (strips untrusted fields to prevent mass-assignment vulnerabilities) and `forbidNonWhitelisted: true`.
   * Coordinate validation: Latitude strictly within `[-90, 90]`, Longitude strictly within `[-180, 180]`.
   * Plate normalization: Strips spaces, hyphens, and converts to uppercase regex `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`.
2. **SQL Injection Defense**:
   * Parameterized queries exclusively via Prisma ORM. Raw queries (`$queryRaw`) strictly use tagged template literals (`$queryRaw`\`SELECT ... WHERE id = ${id}\`), which automatically parameterize inputs.
3. **IDOR / BOLA Protection**:
   * Resource mutation endpoints verify department boundaries: Department Admins can only update cameras belonging to their own department (`req.user.departmentId === camera.departmentId`).
4. **Security Headers & CORS**:
   * `helmet` enabled to attach modern security headers (`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`).
   * CORS restricted to `CORS_ORIGINS` (`http://localhost:3000`).

---

## 7. Audit Logging Strategy (Sync vs Async)

Resolving Section 7.2 of the master architecture:
* **Synchronous Audit Logging**: Mandatory for security-sensitive operations. The database transaction rolls back if the audit row fails to write:
  * Authentication attempts (failed and successful).
  * Watchlist entry creation, modification, and deletion.
  * Alert status transitions (`ACKNOWLEDGED`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`).
  * Evidence access and export.
* **Asynchronous Audit Logging**: Applied to high-volume operational metrics (heartbeats, detection summaries) to preserve high ingestion throughput.

---

## 8. Implementation Phases & Order

To maintain stability, Phase 2 implementation will proceed in strict vertical slices:

1. **Milestone 2.1: Application Core & Shared Foundation**:
   * Install NestJS core dependencies, config module, and validation pipes.
   * Implement `PrismaService`, `HttpExceptionFilter`, `RequestIdMiddleware`, and `LoggingInterceptor`.
   * Implement system `/api/v1/health` endpoint.
2. **Milestone 2.2: Auth & RBAC Module**:
   * Implement `AuthModule`, JWT passport strategy, login/refresh/me endpoints, and `@Roles()` guard.
   * Verify authentication with all 3 demo accounts.
3. **Milestone 2.3: Camera Registry & GIS Spatial API**:
   * Implement `CameraModule` with full CRUD, PostGIS bounding-box filtering (`?bbox=`), and stream association.
4. **Milestone 2.4: Vehicle Search, Timeline & Plausibility API**:
   * Implement `VehicleModule` with plate query and chronological timeline route calculation.
5. **Milestone 2.5: Watchlist & Alert Engine APIs**:
   * Implement `WatchlistModule` and `AlertModule` with strict state machine validation.
6. **Milestone 2.6: Evidence & Compliance Audit APIs**:
   * Implement `EvidenceModule` and `AuditModule` with SHA-256 verification.
7. **Milestone 2.7: Automated Verification Suite**:
   * Write and execute comprehensive end-to-end integration tests covering all critical paths.

---

## 9. Explicit Assumptions & Identified Edge Cases

1. **PoC Service Boundary**: All core modules (`auth`, `cameras`, `vehicles`, `watchlists`, `alerts`, `audit`) are compiled into a single NestJS modular monolith (`api`), running on port 4000. Standalone microservice separation is deferred to production scale per Section 5.2.
2. **WebSocket Gateway**: Full bi-directional WebSocket alert push is paired with standard REST polling fallback (`GET /api/v1/alerts?since=...`) so operators are protected if WebSockets drop.
3. **Simulated Data Indicator**: All API responses serving demo records carry appropriate metadata flags or labels so the frontend can display the required `SIMULATED DATA` badge.
