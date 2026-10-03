# NETRAVAHA — Phase 10: Vehicle Observation Correlation
## Hybrid Fuzzy-Plate & Spatio-Temporal Candidate Discovery

**Platform:** Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026  
**Status:** COMPLETE  
**Scope:** Deterministic, explainable candidate correlation — no ML/ReID/embeddings

---

## 1. Purpose

NETRAVAHA Phase 10 allows an investigator to take a **queried vehicle observation** (a
sighting of a license plate) and find **historically related candidate observations** that may
have originated from the same physical vehicle — while **explicitly refusing to claim identity**
between any two observations.

The system surfaces ranked candidates with structured, human-readable explanations so
that an officer can decide what warrants follow-up investigation.

---

## 2. Terminological Discipline

The following terminology is enforced throughout all code, API responses, and UI labels:

| Term | Meaning | NEVER use |
|------|---------|-----------|
| **Vehicle Observation** | A `VehicleSighting` record | "sighting match", "vehicle location" |
| **Correlation Candidate** | An observation surfaced for investigator review | "matched vehicle", "same vehicle" |
| **OCR Similarity** | Lexical plate string similarity | "plate match", "identity confirmed" |
| **Spatio-Temporal Consistency** | Whether camera distance + time gap are physically plausible | "route confirmed", "proven path" |
| **Correlation Confidence** | Weighted signal score [0.0–1.0] | "identity probability", "match certainty" |

> ⚖️ A high correlation score indicates **observational similarity**. It does NOT establish
> that the observations belong to the same physical vehicle.
> All conclusions require independent verification by a qualified officer.

---

## 3. Architecture Overview

```
AI Worker (Python)                    Backend (NestJS)                  Frontend (Next.js)
─────────────────                    ────────────────                   ────────────────
YoloVehicleDetector                  VehicleSightingCreatedEvent        CorrelationCandidatesPanel
  └─ DetectedObject{vehicle_class}     └─ vehicle_class propagated        └─ Tab 6: "Obs. Correlation"
PlateLocalizer                       SightingEventConsumer
  └─ DetectedPlate{vehicle_class}      └─ vehicle_sightings.vehicle_class
ConsensusAggregator                  VehicleCorrelationService
  └─ ConsensusResult{vehicle_class}    └─ findCorrelationCandidates()
DomainConverter                      GET /vehicles/:plate/correlation-candidates
  └─ VehicleSightingRecord            └─ Query params: window_days, limit
EventPublisher
  └─ VehicleSightingCreatedEvent{vehicle_class}
```

---

## 4. Correlation Algorithm

### 4.1 Plate Fuzzy Matching

**Step 1 — Length Gate (O(1) fast reject)**
Any candidate plate whose length differs from the query by more than 1 is immediately
rejected before running Levenshtein.

**Step 2 — OCR Confusion Matrix**
Characters that are routinely confused by camera OCR systems (based on Indian license
plate ANPR font analysis):

| Digit | Confused with |
|-------|--------------|
| `0`   | `O`, `Q`     |
| `1`   | `I`, `L`     |
| `5`   | `S`          |
| `6`   | `G`          |
| `8`   | `B`          |
| `2`   | `Z`          |
| `D`   | `O`          |
| `U`   | `V`          |
| `P`   | `R`          |

**Step 3 — Plate Similarity Score**

| Condition | Score |
|-----------|-------|
| Exact normalized plate match | `1.00` |
| 1-char OCR confusion substitution or 1-char length deletion | `0.85` |
| Edit-distance 1 (non-OCR-explained) | `0.70` |
| Edit-distance ≥ 2 | `0.00` (rejected) |

### 4.2 Spatio-Temporal Consistency Scoring

Given a candidate sighting relative to the **most recent reference sighting** of the query plate:

| Condition | Score | Reason Code |
|-----------|-------|-------------|
| Same camera vicinity (< 50 m) | `0.80` | `SAME_VICINITY` |
| Teleportation (> 100 m in < 5 s) | `0.05` | `PHYSICALLY_IMPLAUSIBLE:TELEPORTATION` |
| Implied speed > 120 km/h | `0.10` | `PHYSICALLY_IMPLAUSIBLE:SPEED_EXCEEDED` |
| Implied speed < 5 km/h, > 5 min elapsed | `0.30` | `ANOMALOUS:STATIONARY_OR_VERY_SLOW` |
| Plausible speed, ≤ 2 h gap | `0.90` | `SPATIO_TEMPORAL_CONSISTENT` |
| Plausible speed, 2–6 h gap | `0.75` | `SPATIO_TEMPORAL_CONSISTENT` |
| Plausible speed, 6–12 h gap | `0.60` | `SPATIO_TEMPORAL_CONSISTENT` |
| Plausible speed, > 12 h gap | `0.40` | `SPATIO_TEMPORAL_CONSISTENT` |
| No GIS coordinates available | `0.60–0.15` | `NO_GIS_DATA:TIME_*` |

Camera distance is calculated using the **Haversine formula** (great-circle distance between
two WGS-84 GPS coordinates). This is a fast in-process calculation — no PostGIS round-trip.

### 4.3 Vehicle Class Signal

| Condition | Adjustment |
|-----------|-----------|
| Same YOLO-detected class (e.g. both `CAR`) | `+0.05` |
| Different class (e.g. `CAR` vs `TRUCK`) | `−0.10` |
| Either class unknown | `0.00` |

Vehicle class is detected by the YOLOv8 model mapping COCO class IDs:

| COCO ID | NETRAVAHA Class |
|---------|-----------------|
| 2 | `CAR` |
| 3 | `MOTORCYCLE` |
| 5 | `BUS` |
| 7 | `TRUCK` |
| other | `OTHER_VEHICLE` |

### 4.4 Composite Correlation Score

```
correlationScore = clamp(
    0.55 × plateSimilarity +
    0.35 × spatioTemporalConsistency +
    0.10 × vehicleClassMatch +
    vehicleClassBonus,   # ±0.05 or ±0.10
    0.0, 1.0
)
```

**Weight rationale:**
- Plate similarity is the primary signal (55%) because license plates are the key identifier
- Spatio-temporal consistency is the secondary signal (35%) — a geographically and
  temporally plausible sequence is strong supporting evidence
- Vehicle class is a soft signal (10%) — YOLO classifications can differ across cameras
  and lighting conditions

---

## 5. API Reference

### `GET /api/v1/vehicles/:plate/correlation-candidates`

Returns ranked observation candidates for investigator review.

**Authorization:** `INVESTIGATOR`, `DEPARTMENT_ADMIN`, `SUPER_ADMIN`  
**Headers:** `Authorization: Bearer <token>`

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `plate` | Raw license plate string (normalized server-side) |

**Query Parameters:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `window_days` | `7` | `1–30` | Search window in days |
| `limit` | `50` | `1–200` | Maximum candidates to return |

**Example Request:**
```
GET /api/v1/vehicles/GJ01AB1234/correlation-candidates?window_days=7&limit=50
Authorization: Bearer eyJhbGci...
```

**Example Response:**
```json
{
  "queryPlate": "GJ01AB1234",
  "queryPlateClass": "CAR",
  "totalCandidates": 3,
  "searchWindowDays": 7,
  "candidates": [
    {
      "sightingId": "550e8400-e29b-41d4-a716-446655440000",
      "plateNormalized": "GJ01AB1235",
      "cameraId": "...",
      "cameraName": "Sarkhej Junction Cam 1",
      "cameraCity": "Ahmedabad",
      "ts": "2026-10-02T11:30:00Z",
      "vehicleClass": "CAR",
      "confidence": 0.9712,
      "correlationScore": 0.782,
      "plateSimilarity": 0.70,
      "matchType": "EDIT_DISTANCE_1",
      "spatioTemporalConsistency": 0.90,
      "impliedSpeedKmh": 42,
      "timeDiffSeconds": -3600,
      "distanceMeters": 4800,
      "reasons": [
        {
          "signal": "PLATE_SIMILARITY",
          "detail": "Plate 'GJ01AB1235' is 1 edit away from 'GJ01AB1234'",
          "score": 0.70
        },
        {
          "signal": "SPATIO_TEMPORAL",
          "detail": "SPATIO_TEMPORAL_CONSISTENT (implied 42 km/h)",
          "score": 0.90
        },
        {
          "signal": "VEHICLE_CLASS",
          "detail": "Both observations classified as CAR",
          "score": 1.0
        }
      ]
    }
  ],
  "disclaimer": "NETRAVAHA correlation candidates are presented for investigator review only. A high correlation score indicates observational similarity — it does NOT establish that the observations belong to the same physical vehicle. All conclusions require independent verification by a qualified officer."
}
```

---

## 6. Data Flow

### 6.1 vehicle_class Propagation Pipeline

```
YOLO Detection
  → YoloVehicleDetector.detect()
  → DetectedObject{ vehicle_class: VehicleClass }
  → PlateLocalizer._localize_*()
  → DetectedPlate{ vehicle_class: str }      ← Phase 10 added
  → ConsensusAggregator.add_observation()
  → PlateObservation{ vehicle_class: str }   ← Phase 10 added
  → ConsensusResult{ vehicle_class: str }    ← Phase 10 added (from best_obs)
  → DomainConverter.build_sighting_record()
  → VehicleSightingRecord{ vehicle_class: str }  ← Phase 10 added
  → EventPublisher.publish_sighting()
  → VehicleSightingCreatedEvent{ vehicle_class: str }  ← Phase 10 added
  → Redis Stream (SIGHTINGS_STREAM)
  → SightingEventConsumer.process()
  → vehicle_sightings.vehicle_class (PostgreSQL)  ← Phase 10 migration
```

### 6.2 Database Migration

Migration: `20261003130000_add_vehicle_class_to_sightings`

```sql
ALTER TABLE "vehicle_sightings"
  ADD COLUMN "vehicle_class" TEXT;
```

To apply when database is available:
```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

> After running `prisma generate`, remove the `as any` casts in:
> - `sighting-event.consumer.ts` line ~209 (`} as any`)
> - `vehicle-correlation.service.ts` findMany call (`} as any`)

---

## 7. Frontend Integration

The **Observation Correlation** tab is the 6th tab in the Investigation Command Center
(`/vehicles/:plate`). It is only rendered when a vehicle dossier is fully loaded.

**Component:** [`CorrelationCandidatesPanel`](../frontend/components/vehicles/CorrelationCandidatesPanel.tsx)

**Features:**
- Window (1d, 3d, 7d, 14d, 30d) and limit (10, 25, 50, 100) selectors
- Ranked candidate cards with rank badge, plate label, match type badge, vehicle class tag
- Composite score bar with STRONG / MODERATE / WEAK / VERY WEAK label
- Expandable detail per candidate showing:
  - Signal Breakdown: PLATE_SIMILARITY, SPATIO_TEMPORAL, VEHICLE_CLASS scores with bars
  - Spatio-Temporal Metrics: time diff, camera distance, implied speed, plate similarity, OCR confidence
  - Per-card terminological disclaimer
- Persistent top-level disclaimer banner on every result set

---

## 8. Performance Characteristics

Benchmark (10,000 candidates, Python test, measured on dev machine):

| Metric | Value |
|--------|-------|
| Candidate pool size | 10,000 |
| Length gate rejection | ~95% immediately rejected |
| Levenshtein calls | ~5% of pool |
| Total scoring time | **~121 ms** |
| Performance threshold | 500 ms |
| Headroom | **4.1×** |

The algorithm is O(N × L) where N = candidate pool size and L = average plate length (10 chars).
No vector database, no GPU, no external inference service required.

---

## 9. Out-of-Scope (Phase 10 Boundary)

The following were **explicitly excluded** from Phase 10 per the scope boundary:

- OSNet, FastReID, CLIP, ResNet visual embeddings
- pgvector, Milvus, Qdrant vector databases
- ByteTrack, DeepSORT, SORT, Kalman filter object tracking
- Nationwide correlation (> 30-day windows)
- Face recognition, biometric analysis
- OSRM route calculation
- Kafka, Kubernetes, Citus distributed infrastructure

---

## 10. Test Coverage

Test file: [`ai-worker/tests/test_phase10_correlation.py`](../ai-worker/tests/test_phase10_correlation.py)

| Case | Description | Result |
|------|-------------|--------|
| A | Exact plate match → score 1.0 | ✅ PASS |
| B | OCR confusion 1↔I, two-confusion rejection | ✅ PASS |
| C | OCR confusion 5↔S | ✅ PASS |
| D | Edit-distance-1 non-OCR substitution → 0.70 | ✅ PASS |
| E | Edit-distance-1 deletion → 0.85 (OCR path) | ✅ PASS |
| F | Edit-distance-2 rejection → 0.0 | ✅ PASS |
| G | Physically impossible: teleportation + speed exceeded | ✅ PASS |
| H | Plausible urban transit: 30 km/h, same vicinity, no-GIS | ✅ PASS |
| I | Vehicle class: bonus, penalty, unknown | ✅ PASS |
| J | Performance: 10,000 candidates in 121 ms (<500 ms) | ✅ PASS |
| K | Composite score clamping [0.0, 1.0] | ✅ PASS |
| L | Levenshtein boundary conditions | ✅ PASS |

**Total: 40/40 assertions passed**
