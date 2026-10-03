# NETRAVAHA — PHASE 10 PRE-IMPLEMENTATION AUDIT
## Vehicle Observation Correlation & Identity Confidence
### Gujarat Police Innovation Challenge 2026

---

## 1. Executive Summary

This document presents a comprehensive, grounded architectural and code-level audit of the **NETRAVAHA** platform regarding **vehicle observation correlation**, **identity confidence**, and the feasibility of multi-camera vehicle tracking under uncertain, partial, or absent license plate reads.

### Core Finding
The existing NETRAVAHA platform operates strictly on **"Plate-Only Correlation"**:
1. Two observations are considered to belong to the same vehicle **if and only if** their normalized alphanumeric plate strings (`plateNormalized`) match identically.
2. The primary key of the database `Vehicle` entity is `plateNormalized`.
3. If an OCR read contains a single-character error (e.g., `GJ01AB1234` misread as `GJ01A81234`), the system treats it as an entirely separate vehicle.
4. If a vehicle plate is cloned or physically swapped onto another car, the system merges their sightings into a single route timeline, relying exclusively on downstream physical velocity checks (`RouteIntelligenceEngine`) to flag impossible transit hops.
5. In-memory vehicle detection data produced by YOLO (such as vehicle class and vehicle bounding boxes) is **completely discarded** at the Redis event publication boundary and is **never persisted** to PostgreSQL.
6. The AI vision worker currently has **no object tracker** (no ByteTrack, DeepSORT, or SORT); each video frame is evaluated as an isolated, independent detection event.
7. No vehicle appearance descriptors (color, make, model, embeddings, or visual feature vectors) are extracted by the AI pipeline.

This audit details the exact current data flow, catalogs available versus discarded signals, evaluates future correlation options, and defines the recommended engineering boundary for Phase 10.

---

## 2. Current AI Pipeline Dataflow

The AI vision worker processes incoming video streams through a multi-stage sequential pipeline. Below is the exact dataflow trace from video ingestion to PostgreSQL persistence:

```
[RTSP / Demo Video Stream]
         │
         ▼
[StreamConsumer / decord/OpenCV]
   • Frame sampling at configured rate (SAMPLE_FPS = 5.0)
   • Produces in-memory FramePayload (numpy BGR array, frame_sequence, timestamp, camera_id)
         │
         ▼
[YoloVehicleDetector (ultralytics YOLOv8n)]
   • Runs on full frame (conf_threshold = 0.40)
   • Filters for COCO classes: CAR (2), MOTORCYCLE (3), BUS (5), TRUCK (7)
   • Produces: List[DetectedObject] (object_id, vehicle_class, confidence, bbox [x1, y1, x2, y2])
         │
         ▼
[PlateLocalizer]
   • Iterates over vehicle bounding boxes; extracts vehicle crop: frame[y1:y2, x1:x2]
   • Operates in DEDICATED_ML mode (YOLO) or HEURISTIC mode (morphological contours)
   • Produces: List[DetectedPlate] (plate_id, bbox [x1, y1, x2, y2], confidence, vehicle_id)
         │
         ▼
[License Plate OCR (TesseractOCREngine)]
   • Crops plate bounding box from full frame: frame[py1:py2, px1:px2]
   • Preprocessing: grayscale, contrast enhancement, adaptive thresholding
   • Tesseract recognition: raw_text, single float confidence, preprocessing_variant
   • Normalization (ocr/normalizer.py): uppercase, strip non-alphanumeric, strip HSRP "IND" prefix
   • Format validation: Regex check against standard Indian or Bharat (BH) formats
   • Produces: OCRResult (plate_id, raw_text, normalized_text, confidence, format_valid, success)
         │
         ▼
[MultiFrameConsensusAggregator]
   • Sliding window per camera (window_size = 5 frames, min_observations = 3)
   • Ingests PlateObservation (camera_id, frame_sequence, timestamp, normalized_text, confidence, frame, plate_bbox)
   • Aggregates votes strictly by normalized_text:
       plate_weighted_scores[p] += confidence
       plate_counts[p] += 1
   • Enforces 4 acceptance rules:
       1. Observations in window >= min_observations (3)
       2. Winning agreement ratio >= min_agreement_ratio (0.60 / 60%)
       3. Consensus weighted confidence >= min_confidence (0.60)
       4. Normalized text length >= 4 characters
   • Selects best frame: observation with highest single-frame OCR confidence among winning reads
   • Produces: ConsensusResult (status, consensus_plate, consensus_confidence, consensus_of, best_frame)
         │
         ▼
[Evidence Capture (EvidenceSnapshotGenerator)]
   • Encodes best_frame (FULL FRAME, quality 90 JPEG)
   • Computes SHA-256 cryptographic hash over raw JPEG bytes
   • Produces: EvidenceArtifact (artifact_id, plate_normalized, image_bytes, sha256_hash)
         │
         ▼
[MinIO Evidence Vault (MinioEvidenceVault)]
   • Uploads JPEG to bucket: frames/{YYYY}/{MM}/{DD}/{camera_id}/{artifact_id}.jpg
   • Returns: storage_ref ("s3://police-evidence-vault/...")
         │
         ▼
[Redis Event Publication (RedisEventPublisher)]
   • Stream: gujcamera:events:vehicle-sightings
   • Canonical Event: vehicle.sighting_created (Schema v1.0)
   • Payload fields: event_id, sighting_id, evidence_id, camera_id, plate_normalized,
     confidence, consensus_of, total_observations, storage_ref, evidence_hash, captured_at
   ──────────────────────────────────────────────────────────────────────────
   ⚠ CRITICAL BOUNDARY: Vehicle class, vehicle bbox, plate bbox, raw OCR text,
     and detection confidence are DISCARDED here and NOT included in the event!
   ──────────────────────────────────────────────────────────────────────────
         │
         ▼
[NestJS Ingestion (SightingEventConsumer)]
   • Reads from Redis Stream via consumer group
   • Resolves camera ID in Camera Registry
   • Re-validates canonical plate string
   • Idempotency check via sighting_id
   • PostgreSQL Transaction:
       1. Vehicle: Upsert (plate_normalized = PK, first_seen, last_seen)
       2. VehicleSighting: Create (id, plate_normalized, camera_id, ts, confidence, consensus_of, frame_ref)
       3. Evidence: Create (id, source_type='SIGHTING', source_id, storage_ref, hash, captured_at)
   • Triggers AlertsService for watchlist evaluation
```

---

## 3. Vehicle Attributes Inventory

Below is an exhaustive classification of all 24 vehicle-related attributes against the current NETRAVAHA codebase:

| Attribute | Classification | Source Code Location / Notes |
| :--- | :--- | :--- |
| **License Plate (Normalized)** | **AVAILABLE AND PERSISTED** | `Vehicle.plateNormalized`, `VehicleSighting.plateNormalized` |
| **Plate Confidence (Consensus)** | **AVAILABLE AND PERSISTED** | `VehicleSighting.confidence` (consensus weighted OCR score) |
| **Consensus Frames Count** | **AVAILABLE AND PERSISTED** | `VehicleSighting.consensusOf` (e.g. 5 agreeing frames) |
| **Frame Timestamp** | **AVAILABLE AND PERSISTED** | `VehicleSighting.ts`, `Evidence.capturedAt` |
| **Camera ID** | **AVAILABLE AND PERSISTED** | `VehicleSighting.cameraId` (FK to `Camera.id`) |
| **Camera Coordinates** | **AVAILABLE AND PERSISTED** | `Camera.lat`, `Camera.long` (PostGIS ST_Distance accessible) |
| **Evidence Frame Reference** | **AVAILABLE AND PERSISTED** | `VehicleSighting.frameRef`, `Evidence.storageRef` (MinIO S3 URI) |
| **Evidence SHA-256 Hash** | **AVAILABLE AND PERSISTED** | `Evidence.hash` (cryptographic integrity digest) |
| **Vehicle Class** | **AVAILABLE TEMPORARILY ONLY** | Detected by YOLO as `DetectedObject.vehicle_class` (`CAR`, `BUS`, `TRUCK`, `MOTORCYCLE`), but **discarded** before Redis event and DB. |
| **Vehicle Bounding Box** | **AVAILABLE TEMPORARILY ONLY** | Extracted by YOLO as `DetectedObject.bbox`, used for plate crop, then **discarded**. |
| **Vehicle Dimensions (Pixels)** | **AVAILABLE TEMPORARILY ONLY** | Calculated in memory as `bbox.width` and `bbox.height`, then **discarded**. |
| **Plate Bounding Box** | **AVAILABLE TEMPORARILY ONLY** | Extracted as `DetectedPlate.bbox` and `PlateObservation.plate_bbox`, then **discarded** at Redis publisher. |
| **Raw OCR Text** | **AVAILABLE TEMPORARILY ONLY** | Generated by Tesseract in `OCRResult.raw_text`, preserved in `PlateObservation.raw_text`, but **discarded** at Redis publisher. |
| **Vehicle Detection Confidence** | **AVAILABLE TEMPORARILY ONLY** | Output of YOLO detector `DetectedObject.confidence`, then **discarded**. |
| **Single-Frame Object ID** | **AVAILABLE TEMPORARILY ONLY** | Generated as ephemeral string `veh_{uuid}`, never tracked across frames, then **discarded**. |
| **Direction of Travel** | **DERIVABLE FROM EXISTING DATA** | Derivable at multi-camera route level (vector between Camera A and Camera B over elapsed time). Not available within a single camera frame. |
| **Estimated Transit Speed** | **DERIVABLE FROM EXISTING DATA** | Computed by `RouteIntelligenceEngine` as `(geodesic_distance / elapsed_time)`. Not measured locally by camera. |
| **Vehicle Type (Sedan/SUV/etc.)**| **NOT AVAILABLE** | No classifier exists. Field `Vehicle.attributes.type` exists only as a manually seeded demo mock. |
| **Make (Manufacturer)** | **NOT AVAILABLE** | No classifier exists. Field `Vehicle.attributes.make` exists only as a manually seeded demo mock. |
| **Model** | **NOT AVAILABLE** | No classifier exists. Field `Vehicle.attributes.model` exists only as a manually seeded demo mock. |
| **Vehicle Color** | **NOT AVAILABLE** | No color extraction module exists. `Vehicle.attributes.color` exists only as a manually seeded demo mock. |
| **Tracking ID (Multi-Frame)** | **NOT AVAILABLE** | No object tracker (ByteTrack/DeepSORT) exists in AI worker. |
| **Temporal Track** | **NOT AVAILABLE** | Detections are isolated per frame; no multi-frame tracklet association. |
| **Appearance Embedding** | **NOT AVAILABLE** | No ReID feature extraction network exists. |
| **Visual Feature Vector** | **NOT AVAILABLE** | No vector embeddings or descriptor vectors are extracted. |
| **Vehicle Orientation / Pose** | **NOT AVAILABLE** | No pose estimator or orientation model exists. |
| **Lane Information** | **NOT AVAILABLE** | No road segmentation or lane detector exists. |

---

## 4. Database Persistence Inventory

Inspection of `backend/prisma/schema.prisma` confirms the exact persisted fields across all core tables:

### 1. `Vehicle`
- `plateNormalized` (`String`, Primary Key): Canonical uppercase license plate.
- `firstSeen` (`DateTime`): Timestamp of first recorded sighting.
- `lastSeen` (`DateTime`): Timestamp of most recent sighting.
- `attributes` (`Json?`, Nullable): JSON field intended for metadata.
  - *Audit Finding:* In active operation, `SightingEventConsumer` performs an upsert updating only `lastSeen`. `attributes` is **never populated** by the event consumer and remains `null` for all live-detected vehicles (populated solely in `seed.ts` for demo vehicles).

### 2. `VehicleSighting`
- `id` (`Uuid`, Primary Key): Sighting identifier generated by AI worker.
- `plateNormalized` (`String`): Foreign key referencing `Vehicle.plateNormalized`.
- `cameraId` (`Uuid`): Foreign key referencing `Camera.id`.
- `ts` (`DateTime`): Timestamp of sighting capture.
- `confidence` (`Decimal(5, 4)`): Multi-frame consensus OCR confidence score (0.0000 - 1.0000).
- `consensusOf` (`Int`): Number of agreeing frames within the consensus window.
- `frameRef` (`String`): Object storage URI (`s3://...`).
- `createdAt` (`DateTime`): Ingestion timestamp.
  - *Audit Finding:* `VehicleSighting` has **no columns** for vehicle class, color, bounding boxes, make/model, detection confidence, raw OCR text, or tracking IDs.

### 3. `Evidence`
- `id` (`Uuid`, Primary Key): Artifact identifier.
- `sourceType` (`EvidenceSourceType`): Enum (`SIGHTING` | `ALERT`).
- `sourceId` (`Uuid`): Foreign key referencing `VehicleSighting.id`.
- `storageRef` (`String`): S3 URI pointing to the full JPEG frame.
- `hash` (`String`): SHA-256 cryptographic digest (64 hex characters).
- `capturedAt` (`DateTime`): Frame capture timestamp.
- `createdAt` (`DateTime`): Persistence timestamp.

### 4. `Camera`
- `id` (`Uuid`, Primary Key)
- `name` (`String`)
- `lat` (`Decimal(10, 7)`)
- `long` (`Decimal(10, 7)`)
- `operationalStatus` (`OperationalStatus`: `ONLINE`, `CONNECTING`, `DEGRADED`, `OFFLINE`, `ERROR`)
- Linked via 1:1 relation to `Location` (`address`, `zone`, `district`).

### 5. `Alert` & `WatchlistEntry`
- `WatchlistEntry`: `plateNormalized`, `category`, `reason`, `priority`, `active`, `expiresAt`.
- `Alert`: `sourceSightingId`, `watchlistEntryId`, `severity`, `status`, `ts`, `dismissalReason`.

---

## 5. Redis / Event Payload Audit

### A. AI Worker Publisher (`ai-worker/app/events/contract.py`)
The AI worker emits a single Redis Stream event upon accepted consensus:
- **Stream Key:** `gujcamera:events:vehicle-sightings`
- **Payload Schema (`VehicleSightingCreatedPayload`):**
  ```json
  {
    "event_id": "uuid",
    "event_type": "vehicle.sighting_created",
    "schema_version": "1.0",
    "occurred_at": "ISO-8601 UTC",
    "producer": "ai-worker",
    "sighting_id": "uuid",
    "evidence_id": "uuid",
    "camera_id": "uuid",
    "plate_normalized": "GJ01AB1234",
    "confidence": 0.9450,
    "consensus_of": 5,
    "total_observations": 5,
    "storage_ref": "s3://police-evidence-vault/frames/...",
    "evidence_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "captured_at": "ISO-8601 UTC",
    "correlation_id": "uuid",
    "source_type": "SYNTHETIC_STREAM"
  }
  ```

### B. What is Available to the Backend Before Persistence?
Only the 16 fields defined in `VehicleSightingCreatedPayload`.

### C. What is Discarded by the AI Worker Prior to Event Emission?
1. `vehicle_class`: YOLO class label (`CAR`, `BUS`, `TRUCK`, `MOTORCYCLE`) is known in `pipeline.py` but dropped when creating `VehicleSightingCreatedEvent`.
2. `vehicle bbox`: Coordinates `[x1, y1, x2, y2]` are known in `DetectedObject.bbox` but dropped.
3. `plate bbox`: Coordinates `[px1, py1, px2, py2]` are known in `DetectedPlate.bbox` but dropped.
4. `raw OCR text`: Unnormalized text (e.g. `IND GJ-01-AB-1234`) is known in `OCRResult.raw_text` but dropped.
5. `vehicle detection confidence`: YOLO confidence score is known in `DetectedObject.confidence` but dropped.
6. `individual window observations`: Per-frame timestamps and confidence scores are aggregated and dropped.

### D. What is Transformed?
- `plate_normalized`: The AI worker strips punctuation and leading HSRP "IND" via `ocr/normalizer.py`.
- At the backend boundary (`sighting-event.consumer.ts`), `normalizeLicensePlate()` is applied a second time defensively to ensure strict canonical formatting.

---

## 6. Current Plate Correlation Logic

### A. Exact Matching Key
In the current system, two observations belong to the same vehicle **if and only if**:
$$\text{Observation}_A.\text{plateNormalized} == \text{Observation}_B.\text{plateNormalized}$$

### B. Normalization Rules (`modules/vehicles/utils/plate-normalizer.ts`)
1. Converts all characters to uppercase.
2. Strips all whitespace, dashes, slashes, dots, underscores, and special characters:
   - `re.sub(r"[^a-zA-Z0-9]", "", input_str).upper()`
3. Strips leading `IND` HSRP country code if followed by a valid Indian plate pattern.
4. Examples:
   - `"gj 01-ab 1234"` $\rightarrow$ `"GJ01AB1234"`
   - `"IND GJ01AB1234"` $\rightarrow$ `"GJ01AB1234"`
   - `"GJ.01/AB/1234"` $\rightarrow$ `"GJ01AB1234"`

### C. Duplicate & Grouping Rules (`RouteIntelligenceEngine`)
When reconstructing routes for a normalized plate:
1. **Duplicate Delivery Check:** If two sightings share the exact same `cameraId` and their timestamps are within $< 1.0\text{s}$, they are deduplicated (the observation with higher confidence is kept).
2. **Same-Camera Temporal Grouping:** If consecutive sightings occur at the same camera within `sameCameraGroupingWindowSeconds` (default: 30 seconds), they are merged into a single observation hop to prevent false zero-distance velocity calculations.

### D. Route Constraints & Anomaly Detection
Once grouped, consecutive observations at distinct cameras ($C_1 \rightarrow C_2$) are evaluated:
- **Spatial Separation:** Computed via PostGIS geodesic distance (`ST_Distance(geography, geography)`) or Haversine fallback.
- **Elapsed Time:** $\Delta t = t_2 - t_1$.
- **Average Velocity:** $v = \frac{\Delta d}{\Delta t} \times 3.6\text{ km/h}$.
- **Status Classification:**
  - `PLAUSIBLE`: $v \le 120\text{ km/h}$ and $\Delta t \ge 5\text{s}$.
  - `SUSPICIOUS`: $120\text{ km/h} < v \le 180\text{ km/h}$.
  - `IMPOSSIBLE`: $v > 180\text{ km/h}$, or $\Delta t < 5\text{s}$ across distinct cameras ($> 50\text{m}$), or $\Delta t < 0$ (chronology reversal), or $0\text{s}$ elapsed across distinct cameras.
  - `INSUFFICIENT_DATA`: Missing coordinates or unparseable timestamps.

---

## 7. OCR Uncertainty Audit

| Capability | Current Status | Detailed Code Analysis |
| :--- | :--- | :--- |
| **Confidence Score** | **SUPPORTED** | Tesseract output confidence is captured as a float (`0.0 - 1.0`) and propagated to `VehicleSighting.confidence`. |
| **Multi-Frame Consensus** | **SUPPORTED** | 5-frame sliding window requires $\ge 3$ observations and $\ge 60\%$ agreement on the same normalized string. |
| **Format Validation** | **SUPPORTED** | Diagnostic regex validates standard Indian (`^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`) and Bharat series patterns. |
| **Multiple OCR Candidates** | **NOT SUPPORTED** | Only the single top string output from Tesseract is returned. Alternative interpretations are not captured. |
| **Character-Level Uncertainty** | **NOT SUPPORTED** | Tesseract character-level bounding boxes and per-character confidence scores are not requested or parsed. |
| **Partial Plate Handling** | **NOT SUPPORTED** | Consensus rejects strings with $< 4$ characters (`FORMAT_INVALID`). Database search allows prefix substring matching (`contains`), but sightings ingestion requires full string equality. |
| **Fuzzy Matching** | **NOT SUPPORTED** | No Levenshtein, Damerau-Levenshtein, or Hamming distance algorithms are implemented in the database or backend. |
| **OCR Substitution Invariance** | **NOT SUPPORTED** | No character confusion matrix (e.g. `8` $\leftrightarrow$ `B`, `0` $\leftrightarrow$ `O`, `1` $\leftrightarrow$ `I`) is applied. |

### Concrete Test Cases
- **Case 1:** `GJ01AB1234` vs `GJ01AB123?`
  - Normalizer strips `?`, yielding `GJ01AB123`.
  - Result: Stored as two distinct vehicle records. Will never correlate automatically.
- **Case 2:** `GJ01AB1234` vs `GJ01A81234` (OCR confusion of `B` for `8`):
  - Normalizer retains both valid alphanumeric strings.
  - Result: Stored as two completely different vehicles. Watchlist on `GJ01AB1234` will not trigger on `GJ01A81234`.

---

## 8. Temporal + Spatial Signal Audit

The table below evaluates the suitability of existing spatial/temporal data to support future multi-camera vehicle correlation:

| Signal | Evaluation | Technical Rationale |
| :--- | :--- | :--- |
| **Capture Timestamp** | **STRONG SIGNAL** | Stored with millisecond precision in PostgreSQL (`VehicleSighting.ts`). Enables deterministic ordering and $\Delta t$ calculation. |
| **Camera Geocoordinates** | **STRONG SIGNAL** | Accurate `Decimal(10, 7)` latitude and longitude stored for all cameras in PostgreSQL. |
| **Geodesic Distance** | **STRONG SIGNAL** | PostGIS `ST_Distance(geography, geography)` computes physical straight-line ground separation in meters. |
| **Pairwise Velocity Check** | **STRONG SIGNAL** | Deterministic $v = d / \Delta t$ classification exists in `RouteIntelligenceEngine` (`PLAUSIBLE`, `SUSPICIOUS`, `IMPOSSIBLE`). |
| **City / Jurisdiction** | **MODERATE SIGNAL** | Available via `Camera` $\rightarrow$ `Location.district` hierarchy. Distinguishes urban vs inter-city expressway transit. |
| **Camera Adjacency / Topology**| **WEAK SIGNAL** | No road network graph exists. The system does not know which cameras are direct road neighbors versus across physical barriers. |
| **Direction of Travel (Camera)**| **NOT AVAILABLE** | Cameras have point locations but no field-of-view vector (e.g., Eastbound vs Westbound). |
| **Road Network Routing (OSRM)** | **NOT AVAILABLE** | Straight-line geodesic distance is used; true driving distance along Gujarat road geometry is not modeled. |

---

## 9. Vehicle Appearance Signal Audit

A thorough search across all Python (`ai-worker`) and TypeScript (`backend`) files confirms:

| Appearance Signal | Status | Findings |
| :--- | :--- | :--- |
| **Vehicle Color** | **NOT CURRENTLY AVAILABLE** | No color extraction, histogram analysis, or HSV clustering exists in the AI worker. |
| **Vehicle Make / Model** | **NOT CURRENTLY AVAILABLE** | No secondary fine-grained vehicle classification model is integrated. |
| **Vehicle Sub-Type** | **NOT CURRENTLY AVAILABLE** | Only coarse COCO classes (`CAR`, `BUS`, `TRUCK`, `MOTORCYCLE`) exist in YOLO; sub-types (Sedan, SUV, Hatchback) do not exist. |
| **Visual Feature Embeddings** | **NOT CURRENTLY AVAILABLE** | No deep feature extractor (e.g. ResNet, OSNet, CLIP, Swin) exists in the pipeline. |
| **Crop Preservation** | **NOT CURRENTLY AVAILABLE** | Only full video frames are stored in MinIO. Vehicle-only and plate-only crops are discarded after OCR inference. |
| **Vector Storage (pgvector)** | **NOT CURRENTLY AVAILABLE** | PostgreSQL has PostGIS enabled, but no vector extension (`pgvector`) is installed or configured in Prisma. |

---

## 10. Tracking Audit

### Does the AI Worker Perform Object Tracking?
**NO.**
- The AI worker runs inference on sampled frames ($5.0\text{ FPS}$) independently.
- `YoloVehicleDetector` invokes `self.model.predict(source=frame)` on individual frames. It does **not** invoke `self.model.track()`.
- Neither ByteTrack, DeepSORT, SORT, Norfair, nor OpenCV optical flow is implemented.
- The `object_id` field in `DetectedObject` is an ephemeral string (`veh_{uuid}`) generated anew on every frame and discarded before event publication.

### Architectural Statement
> Vehicle observations in NETRAVAHA are currently **independent, discrete detection events** rather than continuous object tracks.

---

## 11. Evidence Availability Audit

For any recorded sighting in the system, manual review capabilities are as follows:

| Evidence Component | Availability | Location & Method |
| :--- | :--- | :--- |
| **Original Full Frame** | **AVAILABLE** | Stored in MinIO (`s3://police-evidence-vault/...`). Accessible via `EvidenceService.getSignedUrl()`. |
| **Cropped Vehicle Image** | **NOT STORED** | Not saved to storage. Can only be retroactively cropped on the fly if bounding box coordinates were preserved (which they currently are not). |
| **Cropped Plate Image** | **NOT STORED** | Not saved to storage. |
| **Timestamp (UTC/IST)** | **AVAILABLE** | Persisted in `VehicleSighting.ts` and `Evidence.capturedAt`. |
| **Camera Name & City** | **AVAILABLE** | Resolved via `VehicleSighting.camera` relation to `Location`. |
| **Normalized Plate** | **AVAILABLE** | Persisted in `VehicleSighting.plateNormalized`. |
| **Raw OCR String** | **NOT STORED** | Discarded during event publication. |
| **Consensus Frames Count** | **AVAILABLE** | Persisted in `VehicleSighting.consensusOf`. |
| **SHA-256 Digest** | **AVAILABLE** | Persisted in `Evidence.hash`. Cryptographically verifiable on demand. |

---

## 12. Future Correlation Design Options

Based strictly on existing capabilities, the table below evaluates technical options for correlating vehicle observations across cameras:

| Approach | Required Existing Data | Missing Prerequisites | Implementation Complexity | False-Positive Risk | False-Negative Risk | Explainability | Suitability for NETRAVAHA | Requires AI Pipeline Change? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Exact Plate Correlation** *(Current)* | `plateNormalized` | None | Low (Already implemented) | Low (except cloned plates) | High (fails on any OCR error or obscured plate) | High (100% deterministic) | Baseline only | No |
| **B. Normalized / Fuzzy Plate Correlation** | `plateNormalized` | Levenshtein / Damerau distance function, OCR substitution weights | Low to Medium | Medium (can conflate distinct similar plates in large fleets) | Low on minor OCR typos | High (character edit distance is transparent) | High (standard police ANPR practice) | No (can be implemented entirely in backend) |
| **C. Plate + Temporal / Spatial Consistency** | `plateNormalized`, camera coordinates, timestamps | Candidate grouping query, route plausibility gating on fuzzy candidates | Medium | Low (spatio-temporal consistency filters out distant coincidental plate collisions) | Low | High (physical transit feasibility is mathematically verifiable) | Very High (aligns directly with Phase 7 Route Engine) | No (can build directly on `RouteIntelligenceEngine`) |
| **D. Plate + Vehicle Coarse Class Gating** | `vehicle_class` from YOLO | `vehicle_class` must be preserved in Redis event and DB schema | Medium | Low | Low | High (rejects matching a motorcycle plate candidate to a truck) | High | Yes (must persist `vehicle_class` from AI worker) |
| **E. Vehicle Appearance / Color Similarity** | Vehicle crop | Color extraction module in AI worker, color metadata in DB | Medium to High | Medium (lighting, shadow, day/night shifts distort color) | Medium | Moderate | Moderate (useful as secondary filter) | Yes (requires color analysis in AI worker) |
| **F. Deep ReID Embeddings** | Vehicle crop | Deep ReID model (OSNet/FastReID), vector DB (`pgvector`), embedding pipeline | High | High in unconstrained CCTV (viewing angle, occlusion) | Medium | Low (deep vector distances are opaque black boxes) | Low for near-term PoC; premature for current scale | Yes (major AI worker and infrastructure addition) |
| **G. Hybrid Multi-Signal Correlation** | Plate, coordinates, timestamps, vehicle class | Fuzzy plate matching + spatio-temporal route plausibility + vehicle class preservation | Medium | Very Low (multi-factor confirmation) | Very Low | High (scored across explainable dimensions) | **Highest** (production-grade police intelligence model) | Minor (preserve `vehicle_class` in event) |

---

## 13. Current Dataset / Demo Capability Audit

The current demonstration assets located in `video-gateway/fixtures` were evaluated:

1. **`cam-ahm-01.mp4` & `cam-ahm-02.mp4` (Synthetic Loops):**
   - Resolution: $1280 \times 720$, 25 FPS, 6 seconds duration.
   - Content: Simulated dark road with moving white vehicle block and yellow license plate `GJ01AB1234`.
   - *Correlation Capability:* Sufficient to demonstrate cross-camera exact plate matching between two junctions. Insufficient for testing dirty/occluded plates, color variation, or vehicle ReID.
2. **`demo-traffic.mp4` (Research Video):**
   - Resolution: 1080p, real-world Indian road traffic.
   - Content: Multi-lane mixed traffic (cars, auto-rickshaws, buses, motorcycles) with varying speeds, lighting, and viewing angles.
   - *Correlation Capability:* Excellent for vehicle detection and plate localization stress-testing. Lacks multi-camera calibrated feeds showing the *same* physical vehicle across two separate camera locations.
3. **Database Seed Fleet (`backend/prisma/seed.ts`):**
   - 15 cameras across 6 Gujarat jurisdictions.
   - 3 seeded vehicle identities (`GJ01AB1234`, `GJ05CD5678`, `GJ27EF9012`).
   - Sighting sequence for `GJ01AB1234` spanning Ahmedabad (`CAM-AHM-01`, `CAM-AHM-02`) and Gandhinagar (`CAM-GND-02`).
   - *Correlation Capability:* Demonstrates inter-city route intelligence and anomaly detection cleanly, but relies entirely on exact plate equality.

---

## 14. Privacy & Security Audit

Any evolution toward appearance-based or fuzzy correlation must adhere to statutory security and privacy safeguards:

1. **Bystander & Driver Privacy:**
   - The system must **not** perform facial recognition on vehicle occupants or pedestrians in the frame.
   - Cropping mechanisms must strictly isolate vehicle bounding boxes and plate regions.
2. **Data Minimization:**
   - Full video frames are stored with cryptographic SHA-256 hashes in MinIO.
   - If visual descriptors or embeddings are added, storing compact mathematical representations (e.g. 512-dim vectors or normalized attribute enums) is preferred over saving unbounded duplicate image crops.
3. **Auditability & Explainability:**
   - Any fuzzy or candidate match must log an immutable audit record in `AuditLog` indicating the query parameters, similarity score, and officer identity.
   - Black-box match scores must never be presented as "guaranteed identification"; they must be clearly labeled as **Correlation Candidates** with explicit confidence breakdowns.
4. **Access Control (RBAC):**
   - Triage of low-confidence or candidate matches should remain restricted to `INVESTIGATOR` and `SUPER_ADMIN` roles, preventing operational dispatch on unverified similarity scores.

---

## 15. Missing Capabilities Summary

The following capabilities are currently absent from the NETRAVAHA platform:
1. **No Fuzzy Plate Querying:** The backend cannot query plates with edit distance (e.g., Levenshtein distance 1 for OCR error tolerance).
2. **No Character Confusion Matrix:** Common optical character recognition substitutions (`B` $\leftrightarrow$ `8`, `O` $\leftrightarrow$ `0`, `Z` $\leftrightarrow$ `2`) are unmodeled.
3. **Discarded Vehicle Class:** YOLO identifies vehicle classes (`CAR`, `TRUCK`, `BUS`, `MOTORCYCLE`), but this information is dropped before reaching Redis or PostgreSQL.
4. **No Multi-Frame Object Tracker:** The AI worker evaluates frames independently without tracklet IDs (no ByteTrack).
5. **No Vehicle Appearance Extraction:** Color, make, model, and visual feature vectors are not extracted from video.
6. **No Road Network Adjacency:** Route plausibility relies on straight-line geodesic distance rather than road network topology.

---

## 16. Recommended Next Engineering Boundary

Based strictly on this audit, the recommended next engineering boundary for vehicle observation correlation is:

### Phase 10 Boundary: "Hybrid Fuzzy-Plate & Spatio-Temporal Candidate Correlation"

#### 1. What SHOULD Be Done in Phase 10:
- **Backend & Database:**
  - Preserve `vehicleClass` (from YOLO) through the Redis event into `VehicleSighting`.
  - Implement a deterministic **Fuzzy Plate Matcher** in the backend using bounded Levenshtein distance ($\le 1$ or $\le 2$) and OCR character confusion weighting.
  - Implement a **Candidate Correlation Service** that couples fuzzy plate candidates with the existing `RouteIntelligenceEngine` to verify spatio-temporal plausibility.
  - Expose a "Correlation Candidates" inspection view in the Investigation Command Center, allowing investigators to review potential matches with an explainable confidence breakdown (e.g. `Plate Similarity: 88%`, `Transit Plausibility: PLAUSIBLE (42 km/h)`, `Vehicle Class Match: CAR == CAR`).
- **Terminology:**
  - Strictly use `CORRELATION CANDIDATE`, `OBSERVATION MATCH`, `CORRELATION CONFIDENCE`, and `SPATIO-TEMPORAL CONSISTENCY`.

#### 2. What SHOULD NOT Be Done (Out of Scope):
- Do **NOT** install deep ReID models (OSNet, FastReID).
- Do **NOT** install vector databases (pgvector, Milvus).
- Do **NOT** install multi-camera tracking infrastructure or Kafka.
- Do **NOT** implement face recognition or biometric extraction.
- Do **NOT** claim automated guaranteed vehicle identity.

---
*Audit Completed on 2026-10-03 in accordance with Gujarat Police Innovation Challenge 2026 Engineering Specifications.*
