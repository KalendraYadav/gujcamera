# NETRAVAHA — Video Source Provenance & Quality Catalog
**Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-VSC-2026-V1`  
**Security Classification:** Restricted / Evaluator Assessment Document  

---

> [!IMPORTANT]
> **Source Provenance & Government CCTV Policy Statement**  
> NETRAVAHA does **not** connect to live, unauthorized, or production government CCTV infrastructure during demonstration phases.  
> All video sources documented herein are strictly **SYNTHETIC FIXTURES** or **CONTROLLED RESEARCH / DEMO FOOTAGE**.  
> Production departmental integration is accomplished via the normalized RTSP / ONVIF / VMS gateway boundaries verified in Phases 1–5.

---

## 1. Quality Classification Framework

To maintain objective evaluation discipline and prevent inflating ANPR or computer vision capability claims, all video sources evaluated or integrated into NETRAVAHA are classified according to the following objective framework:

| Quality Class | Primary Capabilities | Technical Criteria | Permitted Operational Claims |
| :--- | :--- | :--- | :--- |
| **Class A** | Full ANPR & Sighting Consensus | • Minimum 15+ pixels per cm on plate crop<br>• Clear unoccluded view of characters<br>• Native or synthetic plate rendering<br>• Stable frame rate ($\ge$ 15 FPS) | • "End-to-end multi-frame consensus ANPR"<br>• "Automated watchlist matching"<br>• "High-confidence vehicle identification" |
| **Class B** | Vehicle Detection & Spatial Tracking | • Vehicle contours and classes distinct<br>• Plate physically visible but distant/blurry<br>• Angle or resolution prevents reliable OCR<br>• Natural traffic movement and highway flows | • "Multi-vehicle detection and tracking"<br>• "Spatio-temporal sighting correlation"<br>• "Traffic flow and camera health monitoring"<br>*(Must NOT claim automated plate recognition)* |
| **Class C** | Playback & GIS Spatial Representation | • Low resolution, high compression, or static view<br>• No readable plates; partial vehicle occlusion<br>• Demonstrates live streaming latency & GIS topology | • "Live stream playback & gateway latency"<br>• "GIS camera marker placement"<br>• "Infrastructure health & reconnection loop" |

---

## 2. Video Source Provenance Registry

### Source Record 1: SG Highway Junction Approach (Synthetic Fixture)
- **Source ID:** `SRC-SYNTH-AHM-01`
- **Source Name:** SG Highway Pakwan Crossroad Simulation
- **Assigned Camera:** `CAM-AHM-01` (Ahmedabad City Police Commissionerate)
- **City / District:** Ahmedabad, Gujarat
- **Country:** India
- **Provider / Dataset:** Internal Project Test Fixture (Deterministic Generator)
- **Source URL:** Local Repository Asset (`video-gateway/fixtures/cam-ahm-01.mp4`)
- **License / Provenance:** `SYNTHETIC_PROJECT_ASSET` (Created specifically for NETRAVAHA test suites)
- **Attribution Requirement:** None (Internal engineering asset)
- **Permitted Usage:** Automated CI/CD, deterministic unit testing, regression suites, live demonstration
- **Quality Classification:** **Class A (Full ANPR & Sighting Consensus)**
- **Video Resolution:** 1280 × 720 (720p)
- **Frame Rate:** 25.00 FPS
- **Duration:** 6.00 seconds (150 frames, looping)
- **Target Plate Rendered:** `GJ01AB1234` (High-contrast white HSRP on black SUV)
- **Plate Visibility:** Excellent ($\ge$ 30 px character height)
- **Vehicle Visibility:** Single target vehicle approaching junction
- **Canonical Source Type:** `SYNTHETIC_STREAM`
- **Local Asset Path:** `video-gateway/fixtures/cam-ahm-01.mp4`
- **Asset SHA-256 Digest:** `d99908cf64efba967733f572a154884299b84a27572778c187be09d363d3cbe0`
- **Acquisition / Generation Date:** September 2026
- **Operational Notes:** Guaranteed deterministic trigger for stolen vehicle watchlist testing.

---

### Source Record 2: C.G. Road Patrol View (Synthetic Fixture)
- **Source ID:** `SRC-SYNTH-AHM-02`
- **Source Name:** C.G. Road Swastik Char Rasta Simulation
- **Assigned Camera:** `CAM-AHM-02` (Ahmedabad City Police Commissionerate)
- **City / District:** Ahmedabad, Gujarat
- **Country:** India
- **Provider / Dataset:** Internal Project Test Fixture (Deterministic Generator)
- **Source URL:** Local Repository Asset (`video-gateway/fixtures/cam-ahm-02.mp4`)
- **License / Provenance:** `SYNTHETIC_PROJECT_ASSET` (Created specifically for NETRAVAHA test suites)
- **Attribution Requirement:** None (Internal engineering asset)
- **Permitted Usage:** Automated CI/CD, deterministic unit testing, regression suites, live demonstration
- **Quality Classification:** **Class A (Full ANPR & Sighting Consensus)**
- **Video Resolution:** 1280 × 720 (720p)
- **Frame Rate:** 25.00 FPS
- **Duration:** 6.00 seconds (150 frames, looping)
- **Target Plate Rendered:** `GJ01AB1234`
- **Plate Visibility:** High ($\ge$ 26 px character height)
- **Vehicle Visibility:** Vehicle traveling westbound along commercial arterial
- **Canonical Source Type:** `SYNTHETIC_STREAM`
- **Local Asset Path:** `video-gateway/fixtures/cam-ahm-02.mp4`
- **Asset SHA-256 Digest:** `7d4cb8a0e365023956bf35d79124483ae2bfe35e1d44ebbb7d90d810baaece43`
- **Acquisition / Generation Date:** September 2026
- **Operational Notes:** Serves as second hop in multi-camera spatio-temporal route reconstruction.

---

### Source Record 3: Highway Express Traffic Surveillance (Research Video)
- **Source ID:** `SRC-RES-HWY-01`
- **Source Name:** Multi-Lane Urban Highway Surveillance Footage
- **Assigned Camera:** `CAM-DEMO-01` (Gujarat Police Highway Traffic Safety Division)
- **City / District:** Ahmedabad - Gandhinagar Highway Corridor
- **Country:** India
- **Provider / Dataset:** Public Surveillance Research Dataset
- **Source URL:** `frontend/public/videos/traffic_surveillance.mp4` $\rightarrow$ `video-gateway/fixtures/demo-traffic.mp4`
- **License / Provenance Status:** `LICENSE_VERIFICATION_REQUIRED` *(Pending formal commercial copyright clearance before production distribution)*
- **Attribution Requirement:** Source citation retained in technical documentation
- **Permitted Usage:** Non-commercial prototype evaluation, pipeline latency benchmarking, academic demonstration
- **Quality Classification:** **Class B (Vehicle Detection & Spatial Tracking; Limited OCR)**
- **Video Resolution:** 1280 × 720 (720p)
- **Frame Rate:** 29.97 FPS
- **Duration:** 29.70 seconds (890 frames, looping)
- **Plate Visibility:** Low-to-Medium (Distant vehicles, compression artifacts; OCR uncertainty correctly preserved)
- **Vehicle Visibility:** Excellent (Multiple cars, trucks, buses across 4 continuous lanes)
- **Canonical Source Type:** `RESEARCH_VIDEO`
- **Local Asset Path:** `video-gateway/fixtures/demo-traffic.mp4`
- **Asset SHA-256 Digest:** `542a170792cb3e4fa8d04260a9f5d37651c6b12a8a8ec9ecae49d85e78ecadad`
- **Acquisition Date:** October 2026
- **Operational Notes:** Used to validate high-throughput vehicle detection, bounding-box rendering, and gateway transcoding under real multi-vehicle traffic patterns without faking plate numbers.

---

## 3. Provenance Verification Matrix

| Source ID | Canonical Type | Quality Class | Stored Path | Provenance Status | Production Distribution Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SRC-SYNTH-AHM-01` | `SYNTHETIC_STREAM` | Class A | `fixtures/cam-ahm-01.mp4` | Verified (In-house) | Approved for Open Source / Demo |
| `SRC-SYNTH-AHM-02` | `SYNTHETIC_STREAM` | Class A | `fixtures/cam-ahm-02.mp4` | Verified (In-house) | Approved for Open Source / Demo |
| `SRC-RES-HWY-01` | `RESEARCH_VIDEO` | Class B | `fixtures/demo-traffic.mp4` | `LICENSE_VERIFICATION_REQUIRED` | Restricted to Local Prototype Demo |

---

## 4. Policy on Real Departmental Ingestion

When authorized Gujarat Police camera feeds become accessible:
1. Feeds will be registered with source type `REAL_RTSP`, `REAL_ONVIF`, or `VMS_GATEWAY`.
2. Clean endpoints and encrypted credentials will be stored exclusively in `CameraCredential` via AES-256-GCM.
3. MediaMTX will dynamically pull the external stream and publish normalized internal paths.
4. Downstream AI workers, event consumers, PostGIS storage, and investigation APIs will consume the stream without any modification to business logic.
