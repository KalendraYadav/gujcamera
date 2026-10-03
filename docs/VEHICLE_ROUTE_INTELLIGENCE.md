# NETRAVAHA — Vehicle Route Intelligence & Spatio-Temporal Correlation
**Gujarat Police Innovation Challenge 2026**  
**Phase 7: Multi-Camera Vehicle Correlation & Route Intelligence Engine**

---

> [!IMPORTANT]
> **Core Concept & Boundary Disclaimer**  
> **This module reconstructs observed camera-to-camera movement from discrete sightings. It does not provide continuous GPS tracking.**  
> The system observes vehicles at discrete, fixed physical camera coordinates. All route inferences represent **spatio-temporal sighting correlation** derived from observed timestamps and camera coordinates, not continuous telemetry or turn-by-turn driving trajectories.

---

## 1. Core Terminology & Architectural Discipline

| Concept | Disciplinary Standard | Prohibited Terminology |
| :--- | :--- | :--- |
| **Observation Type** | Discrete CCTV Camera Sighting | GPS Ping / Live Telemetry |
| **Route Reconstruction** | Spatio-Temporal Sighting Correlation | Continuous Vehicle Tracking |
| **Movement Segment** | Observed Camera-to-Camera Hop | Driving Path / Physical Navigation |
| **Distance Metric** | Geodesic Distance (PostGIS WGS-84) | Exact Road Network Distance (until OSRM/GraphHopper integrated) |
| **Velocity Estimate** | Inter-Camera Average Transit Velocity | Instantaneous Speed / Legal Speeding Violation |

---

## 2. Route Intelligence Architecture

```
                    [ Discrete Camera Sightings ]
                 (Camera ID, Timestamp, Plate, Bbox)
                                 │
                                 ▼
             [ 1. Chronological Sorting & Normalization ]
                 - Strict capture timestamp (ts) sort
                 - Out-of-order Redis delivery correction
                                 │
                                 ▼
             [ 2. Deduplication & Same-Camera Grouping ]
                 - Duplicate delivery suppression (< 1s)
                 - Same-camera grouping window (30s)
                 - Preserves all raw evidence sightings
                                 │
                                 ▼
                 [ 3. Pairwise Hop Evaluation ]
             IRouteDistanceProvider (PostGIS Geodesic)
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
[ Distance & Delta T ]    [ Velocity Calc ]     [ Plausibility Evaluation ]
- PostGIS geography       - d / Δt              - PLAUSIBLE
- Bounded LRU/FIFO cache  - Division by 0 safe  - SUSPICIOUS
- Geodesic meters         - km/h output         - IMPOSSIBLE
                                                - INSUFFICIENT_DATA
                                 │
                                 ▼
             [ 4. Anomaly Detection & Quality Scoring ]
                 - Structured anomaly records
                 - Deterministic route confidence score
                 - Route plausibility index
```

---

## 3. Road Graph Boundary & `IRouteDistanceProvider`

The route engine decouples distance computation from storage through the clean `IRouteDistanceProvider` interface:

```typescript
export interface DistanceResult {
  distanceMeters: number;
  distanceType: 'GEODESIC' | 'ROAD_NETWORK';
  provider: string;
}

export interface IRouteDistanceProvider {
  readonly providerName: string;
  readonly distanceType: 'GEODESIC' | 'ROAD_NETWORK';

  getDistance(
    origin: RouteCoordinates & { cameraId?: string },
    destination: RouteCoordinates & { cameraId?: string },
  ): Promise<DistanceResult | null>;
}
```

### PostGIS Geodesic Distance Implementation (`PostGisGeodesicDistanceProvider`)
- **Primary Method:** True ellipsoidal geodesic distance using PostgreSQL PostGIS:
  ```sql
  SELECT ROUND(ST_Distance(
    ST_SetSRID(ST_MakePoint(orig_long, orig_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(dest_long, dest_lat), 4326)::geography
  )::numeric, 2) AS distance_meters
  ```
- **Fallback Method:** Great-circle Haversine formula executed in memory if the database spatial engine is offline or unreachable.
- **Future Roadmap:** Seamless swap-in of OpenStreetMap (OSRM), GraphHopper, or state highway authority network graphs without altering investigation APIs or business logic.

---

## 4. Pairwise Distance Cache Policy

To eliminate redundant PostGIS queries across common junction pairs:
- **Component:** `BoundedDistanceCache`
- **Symmetric Normalization:** Distance from `CAM-A` to `CAM-B` is identical to `CAM-B` to `CAM-A` for geodesic hops. Keys are normalized symmetrically (`min(idA, idB):max(idA, idB)`).
- **Capacity & Eviction:** Fixed upper bound (default: **10,000 pairs**). Once capacity is exceeded, oldest entries are evicted via a deterministic FIFO policy.
- **Cache Hit Telemetry:** Exposes `getCacheStats()` (`hits`, `misses`, `hitRate`, `size`).

---

## 5. Velocity Calculation & Edge Case Handling

For consecutive observations $O_1 (t_1, \mathbf{x}_1)$ and $O_2 (t_2, \mathbf{x}_2)$:

$$\Delta t = t_2 - t_1 \quad (\text{seconds})$$
$$d = \text{distance}(\mathbf{x}_1, \mathbf{x}_2) \quad (\text{meters})$$
$$v_{\text{avg}} = \frac{d / 1000}{\Delta t / 3600} \quad (\text{km/h})$$

### Edge Case Handling Matrix

| Condition | Mathematical Treatment | Resulting Status | Anomaly Code |
| :--- | :--- | :--- | :--- |
| $\Delta t < 0$ | Negative time delta | `IMPOSSIBLE` | `CHRONOLOGY_REVERSAL` |
| $\Delta t = 0, d > 25\text{m}$ | Non-zero distance in zero time | `IMPOSSIBLE` | `SIMULTANEOUS_DISTANT_OBSERVATIONS` |
| $\Delta t = 0, d \le 25\text{m}$ | Same camera/junction frame capture | `PLAUSIBLE` ($v = 0$) | `SAME_JUNCTION_OBSERVATION` |
| Missing $\mathbf{x}_1$ or $\mathbf{x}_2$ | Undefined distance | `INSUFFICIENT_DATA` | `MISSING_COORDINATES` |
| Corrupted / invalid timestamp | Undefined $\Delta t$ | `INSUFFICIENT_DATA` | `MISSING_TIMESTAMP` |
| $\Delta t > 48\text{h}$ | Long interval between observations | `PLAUSIBLE` | `EXCESSIVE_TIME_GAP` |

---

## 6. Objective Plausibility Rules & Thresholds

Rules are fully configurable via `RoutePlausibilityConfig`:

```typescript
export interface RoutePlausibilityConfig {
  minTransitTimeSeconds: number;         // 5s
  suspiciousSpeedThresholdKmh: number;   // 130 km/h
  impossibleSpeedThresholdKmh: number;   // 220 km/h
  minCameraSeparationMeters: number;     // 25m
  maxCorrelationWindowHours: number;     // 48h
  sameCameraGroupingWindowSeconds: number; // 30s
}
```

### Deterministic Status Definitions
1. **`PLAUSIBLE`**: Estimated velocity $\le 130\text{ km/h}$, transit time $\ge 5\text{s}$, and timestamps sequential.
2. **`SUSPICIOUS`**: Estimated velocity between $130\text{ km/h}$ and $220\text{ km/h}$. Feasible for high-speed highway vehicles, but exceeds standard transit expectations.
3. **`IMPOSSIBLE`**:
   - Transit time $< 5\text{s}$ over physical distances $> 25\text{m}$.
   - Estimated velocity $> 220\text{ km/h}$ (physically unattainable average road transit).
   - Simultaneous observations across distinct junctions ($\Delta t = 0, d > 25\text{m}$).
   - Chronology reversal ($\Delta t < 0$).
4. **`INSUFFICIENT_DATA`**: Camera coordinates or capture timestamps unresolvable.

---

## 7. Duplicate Sightings & Same-Camera Observation Grouping

Autonomous vision workers sampling high-FPS video streams generate multiple plate reads for a single vehicle passing through an intersection.
- **Handling Rule:** Consecutive sightings at the **same camera ID** occurring within `sameCameraGroupingWindowSeconds` (30s) are consolidated into a single observation node with duration $[t_{\text{start}}, t_{\text{end}}]$.
- **Evidence Preservation:** Raw sighting records and MinIO evidence snapshots remain intact in the database and audit logs. Only the route hops filter out zero-distance self-hops.

---

## 8. Deterministic Route Confidence Score

Rather than an arbitrary black-box score, route confidence is an explicit arithmetic metric:

$$\text{Confidence}_{\text{segment}} = \min(\text{OCR Conf}_1, \text{OCR Conf}_2, w_{\text{plausibility}})$$

Where $w_{\text{plausibility}}$:
- `1.0` for `PLAUSIBLE`
- `0.5` for `SUSPICIOUS`
- `0.0` for `IMPOSSIBLE`
- `0.1` for `INSUFFICIENT_DATA`

$$\text{Route Confidence} = \frac{1}{N} \sum_{i=1}^{N} \text{Confidence}_{\text{segment}_i}$$

---

## 9. Verification & Ground-Truth Test Matrix

Automated unit tests in [route-intelligence.spec.ts](file:///d:/web%20project/gujcamera/backend/src/modules/vehicles/route-intelligence/route-intelligence.spec.ts) validate:
- **Scenario A:** Ahmedabad to Gandhinagar multi-camera transit (34.8 km/h urban, 77.6 km/h highway) $\to$ `PLAUSIBLE`.
- **Scenario B:** 10 km transit in 1 minute (600 km/h) $\to$ `IMPOSSIBLE` (`UNREALISTIC_HIGH_VELOCITY`).
- **Scenario C:** 3 observations within 8s at `CAM-A` $\to$ Grouped into 1 observation; zero false hops.
- **Scenario D:** S3 arriving before S1 in message queue $\to$ Strict chronological sorting by $t_{\text{capture}}$.
- **Scenario E:** Missing GPS coordinates on camera $\to$ `INSUFFICIENT_DATA` (`MISSING_COORDINATES`).
- **Scenario F:** Exact duplicate delivery $\to$ Suppressed without duplicate route segments.
- **Cache Eviction:** Symmetric key lookup and FIFO eviction at capacity bound.
