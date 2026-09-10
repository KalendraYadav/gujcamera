# Phase 3E Architecture & Technical Specification: Multi-Frame Consensus & Evidence Vault
**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**

---

## 1. Phase 3E Objective & Strict Scope Boundaries

Phase 3E implements temporal multi-frame license plate consensus, cryptographic evidence snapshot generation, SHA-256 integrity fingerprinting, MinIO S3 evidence vaulting, and canonical domain linkage (`VehicleSighting` and `Evidence`).

### A. Intended Conceptual Flow
```
RTSP Video Feed
  │
  ▼
Frame Sampling (3 FPS)
  │
  ▼
Vehicle Detection (YOLOv8n)
  │
  ▼
Plate Localization (PlateLocalizer)
  │
  ▼
License Plate OCR (Tesseract 5 LSTM)
  │
  ▼
MULTI-FRAME CONSENSUS (Weighted 5–8 Frame Window)
  │
  ▼
Normalized Plate Result (GJ01AB1234)
  │
  ▼
Evidence Snapshot Capture (Best-Confidence Frame)
  │
  ▼
SHA-256 Integrity Fingerprint
  │
  ▼
MinIO S3 Evidence Vault (police-evidence-vault)
  │
  ▼
Canonical Domain Record Linkage (VehicleSighting + Evidence)
```

### B. Strict Scope Boundary Enforcement

| IN SCOPE (Phase 3E) | STRICTLY EXCLUDED (Deferred to Phase 3F or Future) |
|---|---|
| Temporal multi-frame OCR consensus aggregator | Redis / Redis Streams |
| Confidence-weighted voting algorithm | Sighting domain event bus publishing (`vehicle.sighting_created`) |
| Conservative acceptance/rejection rules | Watchlist database matching |
| Deterministic normalization reuse from Phase 3D | Automated alert creation (`Alert` entity creation) |
| Evidence frame selection (highest confidence) | Real-time WebSocket alerts to operator UI |
| JPEG evidence snapshot encoding | Cross-camera tracking / route reconstruction changes |
| SHA-256 cryptographic byte hashing | Visual re-identification or person/face recognition |
| MinIO S3 object storage upload & metadata | Database schema modifications (ZERO schema changes) |
| Resilient failure isolation (no AI worker crash) | Production Kubernetes / cloud orchestration |
| Canonical `VehicleSighting` & `Evidence` record conversion | Distributed task queues (Kafka/Celery/Airflow) |
| Controlled unit fixtures and benchmarks | Production-grade ANPR accuracy claims |

---

## 2. Multi-Frame Consensus Specification

### A. Problem Statement
In real-world traffic surveillance, single-frame OCR is inherently prone to intermittent artifacts: motion blur, headlight glare, exhaust smoke, acute camera viewing angles, and physical plate dirt. Trusting a single frame generates unacceptable false positives.

### B. Sliding Temporal Observation Window
- **Per-Camera Window**: Observations are buffered in an isolated temporal window per camera stream.
- **Window Size ($N$)**: Default $N = 5$ frames (strictly constrained to 5–8 frames via `CONSENSUS_WINDOW_SIZE`; values $< 5$ or $> 8$ are rejected with validation error).
- **Temporal Timeout**: $\Delta t \le 3.0$ seconds (configurable via `CONSENSUS_MAX_WINDOW_SECONDS`). If the time between observations exceeds this span, the window resets to avoid conflating different vehicles.

### C. Normalization & Glyph Policy
- Every raw OCR read is normalized deterministically via `normalize_license_plate`:
  - Strips spaces, hyphens, dots, slashes, and non-alphanumerics.
  - Converts to uppercase.
  - Strips leading HSRP `"IND"` country identifier when followed by a valid Indian state series.
- **Strict Conservative Policy**: Ambiguous characters are **never silently morphed** (no guessing `O` $\to$ `0`, `I` $\to$ `1`, `Z` $\to$ `2`, `B` $\to$ `8`). Uncertainty is preserved.

### D. Confidence-Weighted Voting Algorithm
For a window containing observations $O_1, O_2, \dots, O_M$:
1. For each candidate normalized plate string $P$, calculate:
   $$\text{Weighted Score: } S(P) = \sum_{i: P_i = P} \text{confidence}_i$$
   $$\text{Observation Count: } C(P) = \sum_{i: P_i = P} 1$$
2. Identify the candidate plate $P_{\text{win}}$ with the highest weighted score $S(P)$.

### E. Acceptance Rules (All Must Pass)
1. **Minimum Observations**: $M \ge \text{MIN\_OBSERVATIONS}$ (default: 3). Single-frame reads are never accepted as multi-frame consensus.
2. **Agreement Ratio**:
   $$R = \frac{C(P_{\text{win}})}{M} \ge \text{MIN\_AGREEMENT\_RATIO} \quad (\text{default: } 0.60)$$
   At least 60% of observed reads (e.g., 3 out of 5 frames) must agree on the identical plate string.
3. **Consensus Confidence**:
   $$\text{Conf}_{\text{consensus}} = \frac{S(P_{\text{win}})}{C(P_{\text{win}})} \ge \text{MIN\_CONSENSUS\_CONFIDENCE} \quad (\text{default: } 0.60)$$
   The weighted average OCR confidence of the supporting reads must meet or exceed 0.60.
4. **Format Diagnostic Sanity**:
   The string must either match Indian registration patterns (`^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$` or Bharat series) or have alphanumeric length $\ge 4$.
5. **Tie-Break / Split Vote Rejection**:
   If two competing plate strings have identical highest weighted scores and counts (e.g. 2 reads for Plate A and 2 reads for Plate B), consensus is explicitly **REJECTED** with `SPLIT_VOTE_NO_MAJORITY`.

### F. Explainable Diagnostic Rejection
When consensus cannot be reached, the system returns `status: REJECTED` or `UNDECIDED` with an explicit reason:
- `INSUFFICIENT_OBSERVATIONS`: Fewer than 3 valid reads collected.
- `LOW_CONSENSUS_CONFIDENCE`: Average confidence below 0.60 threshold.
- `SPLIT_VOTE_NO_MAJORITY`: Conflicting plates without a majority winner.
- `BELOW_AGREEMENT_THRESHOLD`: Winning plate failed to achieve 60% agreement.
- `FORMAT_INVALID`: Plate string too short (<4 characters).

**Crucial Invariant**: Rejected or undecided consensus **NEVER** creates a `VehicleSighting` or `Evidence` record in the database.

---

## 3. Evidence Snapshot Capture & SHA-256 Integrity

### A. Deterministic Evidence Frame Selection Rule
- From all observations within the consensus window that supported the winning plate, the system selects the observation frame with the **highest OCR confidence**.
- *Rationale*: Higher OCR confidence directly correlates with optimal optical clarity, minimal motion blur, and optimal vehicle illumination.
- *Tie-Breaker*: If confidences are identical, the median sequence frame is chosen.

### B. JPEG Encoding
- Encoded from the in-memory OpenCV BGR array directly into standard JPEG bytes via `cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])`.
- Quality 90 delivers forensic clarity and legibility while maintaining a compact storage footprint (~80–180 KB).
- **Forensic Integrity**: The frame image is captured as-is from the video feed. No artificial overlays, fake license plate text, or synthetic graphics are ever injected.

### C. SHA-256 Integrity Fingerprint
- The SHA-256 digest is computed **strictly over the exact encoded JPEG bytes**:
  ```python
  sha256_hash = hashlib.sha256(jpeg_bytes).hexdigest()
  ```
- **What Is Hashed**: Strictly the raw binary file bytes. It does not include metadata, timestamps, or database IDs.
- **Reproducibility**: Given the identical JPEG byte stream, SHA-256 deterministically produces the identical 64-character lowercase hexadecimal string.
- **Tamper Detection**: Modifying a single pixel or bit in the file completely changes the digest.
- **Forensic Terminology**: SHA-256 provides an **integrity fingerprint** (verifying that stored bytes match captured bytes). In compliance with police standards, it is **not** described as making evidence "tamper-proof", "immutable", or "non-repudiable".

---

## 4. MinIO Evidence Vault Integration

### A. Architecture & Key Hierarchy
- Uses the local S3-compatible MinIO service running in Docker Compose (`police-evidence-vault` bucket).
- Deterministic, privacy-preserving object key convention:
  ```
  evidence/{YYYY}/{MM}/{DD}/{camera_id}/sighting_{artifact_id}.jpg
  ```
  *Example*: `evidence/2026/09/10/CAM-AHM-01/sighting_b1c2d3e4-5678-90ab-cdef-1234567890ab.jpg`
- Key names contain only temporal dates, camera ID, and UUIDs; no plaintext license plates, passwords, or personal identity information are exposed in paths.

### B. Metadata Preservation & Privacy Policy
Every uploaded evidence artifact includes HTTP S3 metadata headers strictly required for evidence verification:
- `x-amz-meta-sha256`: Cryptographic SHA-256 integrity fingerprint.
- `x-amz-meta-camera-id`: CCTV camera identifier.
- `x-amz-meta-frame-seq`: Video frame index.
- `x-amz-meta-captured-at`: POSIX capture timestamp.

**Privacy & Metadata Policy**:
Plaintext license plates are **deliberately omitted** from MinIO object metadata headers and S3 keys. The canonical database schema already maintains the relational link `Evidence` → `VehicleSighting` → `Vehicle` → `plate_normalized`. Omitting plaintext vehicle identity from object storage prevents sensitive investigative data exposure in storage server logs or bucket inspection.

**Storage Semantics & Future Production WORM**:
MinIO object storage provides the evidence vault artifact. SHA-256 provides an integrity fingerprint over the exact stored bytes. Object locking (WORM / write-once-read-many retention) is not configured in this local PoC deployment and is documented as a future production hardening capability.

### C. Resilient Failure Handling
- If MinIO is offline, connection times out, credentials fail, or the bucket cannot be accessed:
  - The failure is caught, logged with warning severity, and returns a structured `EvidenceStorageResult(success=False, storage_ref=None, error_code=...)`.
  - **The AI worker does NOT crash.**
  - **The system does NOT falsely report success or emit fake storage references.**
  - An `EvidenceRecord` is **never created** when upload fails.
  - A `VehicleSightingRecord` is **never emitted** with a fake or fallback URI when evidence storage fails. Both domain records evaluate to `None`, ensuring no false claim of an evidence-backed sighting is persisted.
  - Storage failures are explicitly captured in `EvidenceStorageResult` and reflected in telemetry.

---

## 5. Canonical Database Linkage (ZERO Schema Changes)

An audit of `master_architecture.md` §6.2 and `backend/prisma/schema.prisma` confirmed that all canonical fields already exist:
- **`VehicleSighting`**: `id` (UUID), `plate_normalized` (FK), `camera_id` (FK), `ts` (DateTime), `confidence` (Decimal 5,4), `consensus_of` (Int), `frame_ref` (Text), `created_at` (DateTime).
- **`Evidence`**: `id` (UUID), `source_type` (Enum `SIGHTING`), `source_id` (UUID), `storage_ref` (Text), `hash` (SHA-256 Text), `captured_at` (DateTime), `created_at` (DateTime).
- **`Vehicle`**: `plate_normalized` (PK), `first_seen`, `last_seen`, `attributes`.

**Zero database migrations and zero schema changes were needed or made.** Exactly one `Evidence` record is created per accepted multi-frame consensus sighting.

---

## 6. Performance Benchmark Summary

Measured on CPU (`x86_64`, Intel Core):

### Phase 3E Component Latency Benchmark (25 Iterations, 1280x720 Frames)

| Component Stage | Cold-Start (Run 1) | Warmed-Up Average | Warmed-Up p50 | Warmed-Up p90 |
|---|---|---|---|---|
| **Multi-Frame Consensus** (5-frame window) | 0.116 ms | **0.027 ms** | 0.023 ms | 0.036 ms |
| **Evidence JPEG Encoding** (1280x720, Q=90) | 1.416 ms | **1.090 ms** | 1.055 ms | 1.203 ms |
| **SHA-256 Byte Hashing** (~140 KB image) | 0.010 ms | **0.008 ms** | 0.008 ms | 0.009 ms |
| **Domain Record Conversion** | 0.025 ms | **0.010 ms** | 0.009 ms | 0.013 ms |
| **Estimated Component-Sum Latency** | ~1.567 ms | **~1.135 ms** | — | — |

> [!NOTE]
> **Controlled Benchmark & Fixture Disclaimers**:
> 1. **Estimated Component-Sum Latency**: The ~1.135 ms figure represents an arithmetic sum of isolated CPU benchmarks. It does **not** represent an end-to-end benchmark on live moving vehicles.
> 2. **Controlled Fixture Protocol**: Benchmarks were measured using synthetic frame patterns and controlled OCR inputs. Current Phase 3A video feeds are synthetic countdown test patterns containing **zero genuine vehicles and zero license plates**; therefore, these benchmarks do not establish statewide ANPR accuracy or detection rates.
> 3. **Consensus Efficiency**: The consensus voting algorithm executes in ~0.027 ms per 5-frame window, ensuring video stream consumption is never bottlenecked by voting logic.

---

## 7. Licensing & Open-Source Compliance

- **MinIO Python SDK (`minio`)**: Licensed under **Apache License 2.0**.
- **OpenCV (`opencv-python-headless`)**: Licensed under **Apache License 2.0**.
- **NumPy (`numpy`)**: Licensed under **BSD-3-Clause**.
- **PyTesseract (`pytesseract`)**: Licensed under **Apache License 2.0**.

### Qualified Licensing Language:
*"Dependencies selected for PoC/hackathon evaluation subject to applicable open-source license terms and normal organizational, procurement, and legal review. This documentation does not provide formal legal clearance or commercial procurement certification."*
