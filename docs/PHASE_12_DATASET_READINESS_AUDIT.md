# NETRAVAHA — Phase 12: CCTV Dataset & Live-Simulation Readiness Audit
**Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-PHASE12-AUDIT-2026-V1`  
**Security Classification:** Evaluator / Engineering Architecture Audit  
**Author:** Senior Computer-Vision & Data-Engineering Systems Architect  
**Status:** COMPLETE / APPROVED FOR IMPLEMENTATION  

---

> [!IMPORTANT]
> **Core Operational & Ethical Boundary**  
> NETRAVAHA is currently evaluated in a restricted simulation and evaluation environment. **The platform does NOT connect to live, unauthorized, or production Gujarat Police CCTV networks, municipal Command and Control Centers (ICCC / C3), government VMS/NVRs, or private surveillance systems.**  
> 
> The judges' demonstration must truthfully communicate:  
> *"This demonstration operates over a simulated live deployment using legally usable representative traffic and CCTV recordings. The identical RTSP/ONVIF/VMS ingestion and cryptographic verification boundaries are architected to ingest authorized departmental feeds immediately upon operational deployment."*  
> 
> Fabricating government camera access, inventing synthetic licenses, or obfuscating data provenance is strictly prohibited.

---

## 1. Executive Summary

Phase 12 conducts a comprehensive, rigorous readiness audit of candidate computer vision traffic and surveillance datasets to establish the data foundation for the **Gujarat Police Innovation Challenge 2026** live demonstration. 

The audit evaluated premier academic, governmental, and open surveillance corpora—including the **NVIDIA/IEEE AI City Challenge (CityFlow / CityFlowV2)**, **IIIT Hyderabad Indian Driving Dataset (IDD / IDD-3D)**, **UA-DETRAC Benchmark**, **VeRi-776**, and open Indian ANPR repositories—against 16 technical criteria (A through P) spanning multi-camera synchronization, license plate readability, continuous RTSP replay compatibility, and legal redistribution licensing.

### Definitive Technical & Legal Conclusion
**No single publicly accessible, off-the-shelf dataset satisfies all requirements simultaneously.** 
- Multi-camera tracking benchmarks (e.g., AI City Challenge CityFlow) offer dense multi-camera topologies, but **strictly redact and blur all license plates and human faces for privacy**, and their restrictive Data License Agreements prohibit public redistribution and embedded demonstration packaging.
- Indian road datasets (e.g., IIIT Hyderabad IDD) capture authentic Indian traffic diversity, but are collected exclusively from **moving ego-vehicle dashcams (forward-facing GoPros)**, rendering them fundamentally incapable of acting as fixed roadside CCTV junction feeds.
- Pure ANPR datasets provide high-resolution Indian number plates, but consist solely of **disconnected static image crops**, completely lacking continuous multi-camera temporal video streams.

### Approved Architecture: Three-Tier Hybrid Demonstration Strategy
To deliver a technically flawless, legally bulletproof demonstration without misrepresenting capabilities, NETRAVAHA adopts a **Three-Tier Hybrid Demonstration Strategy**:
1. **Tier 1 — High-Fidelity Controlled Corridor Fixtures (`SRC-SYNTH-*`)**: Deterministic, high-resolution multi-camera feeds with clear Indian High Security Registration Plates (HSRP `GJ01AB1234`), providing full end-to-end ANPR, multi-frame consensus, watchlist alerts, inter-junction transit correlation, and cryptographic SHA-256 evidence chain-of-custody.
2. **Tier 2 — Representative Real-World Traffic Surveillance (`SRC-REAL-SURV-*`)**: Legally verified, CC-BY / Open-Gov surveillance recordings demonstrating multi-lane vehicle flow, dense YOLO vehicle detection, spatial GIS positioning, and live streaming gateway health without faking unreadable plates.
3. **Tier 3 — Continuous RTSP / MediaMTX Ingestion Layer**: Containerized FFmpeg replay engine streaming Tier 1 and Tier 2 video assets over real RTSP into MediaMTX with live wall-clock timestamp normalization, matching the exact API and streaming contract of physical Gujarat Police VMS/NVR infrastructure.

---

## 2. Current Demonstration Problem

NETRAVAHA features a complete enterprise surveillance and intelligence stack:
- **Backend Core**: NestJS, PostgreSQL 16 + PostGIS, Redis 7 (Streams + Pub/Sub), MinIO S3 Object Vault.
- **Computer Vision**: Containerized Python AI Worker with YOLOv8 vehicle detection, license plate localization, Tesseract/PaddleOCR text recognition, multi-frame consensus voting (5–8 frames), and vehicle class propagation.
- **Analytics & Forensics**: Hybrid fuzzy-Levenshtein plate search, spatio-temporal route velocity correlation, watchlist alerting engine, cryptographic SHA-256 evidence verification, and raw forensic frame streaming.
- **Frontend Console**: Next.js 14 App Router, live HLS.js streaming grid, Leaflet GIS spatial map, vehicle journey timeline, and role-based audit viewer.

### The Demonstration Gap
To convince evaluators and senior police officials, the demonstration cannot rely solely on abstract unit tests or static database records. A judge must be able to:
1. Select a registered camera in Ahmedabad, Gandhinagar, or Surat.
2. Watch a real-time RTSP/HLS stream playing smoothly in the browser.
3. Enter a target plate (e.g., `GJ01AB1234` from FIR #102/2026).
4. Witness the system detect the vehicle, extract the plate, match the active watchlist, and fire a real-time WebSocket alert.
5. Track the vehicle across consecutive camera nodes along an arterial corridor (e.g., Pakwan Junction $\rightarrow$ Swastik Char Rasta $\rightarrow$ CH-0 Circle).
6. Inspect the forensic evidence frame, verify the SHA-256 tamper seal, and export a certified court dossier.

Without authorized access to government NVRs, supplying this demonstration with arbitrary or fragmented data causes fatal failure modes:
- If footage has blurred plates, the OCR pipeline produces zero hits, breaking the core ANPR narrative.
- If footage is captured from a moving car, judges will immediately spot that the system is consuming a dashcam rather than police CCTV.
- If footage has no cross-camera vehicle correlation, the spatio-temporal tracking and route intelligence modules cannot be demonstrated live.
- If unlicensed footage is bundled, the project risks copyright infringement and disqualification.

---

## 3. Required Dataset Characteristics

To evaluate candidate datasets objectively, we establish 16 mandatory technical and operational criteria:

| Parameter ID | Technical Requirement | Evaluation Criterion |
| :--- | :--- | :--- |
| **A. Multiple Fixed Cameras** | 5 to 10 distinct fixed roadside/overhead camera viewpoints. | Static surveillance perspective; no moving dashcams. |
| **B. Multi-Camera Vehicle Re-appearance** | Same physical vehicle appears across 2 or more cameras. | Enables cross-camera tracking and route reconstruction. |
| **C. Persistent Vehicle Identities** | Bounding box tracking IDs linked across viewpoints. | Allows ground-truth validation of cross-camera re-ID. |
| **D. License-Plate Visibility** | Plate characters legible to optical character recognition. | Minimum 15+ pixels character height; minimal motion blur. |
| **E. License-Plate Annotations** | Ground-truth string annotations for number plates. | Enables automated precision/recall benchmarking. |
| **F. Vehicle Bounding Boxes** | Ground-truth 2D bounding boxes for vehicle chassis. | Validates YOLO detection accuracy. |
| **G. Vehicle Classes** | Differentiated labels (Car, SUV, Truck, Bus, Motorcycle). | Validates Phase 10 vehicle class propagation. |
| **H. Timestamp & Frame Ordering** | Synchronized timestamps or frame-level temporal continuity. | Required for spatio-temporal velocity calculations. |
| **I. Camera / Location Metadata** | Known GPS coordinates, distances, or corridor map. | Required for PostGIS spatial mapping and velocity checks. |
| **J. Sufficient Video Duration** | Video files $\ge$ 5–30 minutes, or seamlessly loopable. | Allows continuous live streaming without jarring glitches. |
| **K. FFmpeg Replay Compatibility** | Standard H.264/H.265 MP4/MKV container and codec. | Decodeable by standard FFmpeg `-re` loopers. |
| **L. RTSP Exposure Feasibility** | Streamable over TCP/UDP RTSP via standard RTP packetization. | Ingestible by MediaMTX without transcoding overhead. |
| **M. MediaMTX Integration** | Ingestible via static paths or dynamic REST API (`/v3/config/paths`). | Conforms to NETRAVAHA `MediaGatewayService`. |
| **N. Investigation Workflow Fit** | Demonstrates plate search, timeline, and audit trail. | Powers end-to-end police investigative workflows. |
| **O. Cross-Camera Correlation Fit** | Physically plausible velocity between camera coordinates. | Validates Phase 10 hybrid fuzzy/spatio-temporal engine. |
| **P. Legal & Demonstration License** | Explicit license permitting public hackathon demonstration. | Verified open-access, CC-BY, Open-Gov, or in-house synthetic. |

---

## 4. AI City Dataset Investigation

The **IEEE / CVPR AI City Challenge** is the global benchmark for smart city video analytics. We specifically audited the multi-camera tracking tracks (Track 1 and Track 3) across 2019, 2021, and 2022.

### 4.1 Dataset Characteristics (CityFlow / CityFlowV2)
- **Official Source**: NVIDIA AI City Challenge / University of Washington Information Processing Lab.
- **Dataset Name**: CityFlow (2019–2021) / CityFlowV2 (2022 Track 1: Multi-Camera Vehicle Tracking).
- **Camera Topology**: 36 to 46 physical cameras across 10 intersections in a mid-sized U.S. city; 3.25 km corridor.
- **Video Duration**: 3.5 hours of synchronized video footage recorded at 960p / 1080p at 10 FPS.
- **Annotations**: Over 229,680 bounding boxes for 666 unique vehicle identities across cameras.

### 4.2 Technical Audit Against Criteria
- **Fixed Cameras (A)**: **HIGH**. Cameras are mounted on traffic signal masts and utility poles.
- **Multi-Camera Vehicle Overlap (B, C)**: **HIGH**. Benchmark was built specifically for multi-target multi-camera (MTMC) tracking.
- **Vehicle Bounding Boxes & Classes (F, G)**: **HIGH**. High-quality labels for `car`, `suv`, `van`, `truck`.
- **Timestamp & Frame Ordering (H, I)**: **HIGH**. Cameras are temporally synchronized with known intersection geometry.
- **License-Plate Visibility & Annotations (D, E)**: **ZERO / FATAL FAILURE**.  
  > [!CAUTION]
  > **Mandatory Privacy Redaction**: To comply with U.S. privacy regulations and IRB standards, **all vehicle license plates and driver faces in CityFlow / AI City Challenge are permanently redacted (digitally blurred or occluded)**. OCR cannot extract text from any vehicle in this dataset.

### 4.3 License & Provenance Terms
- **Official Access Method**: Requires registration and institutional agreement submission at `aicitychallenge.org`.
- **License Classification**: `RESTRICTED_ACADEMIC_RESEARCH_AGREEMENT`.
- **Redistribution Rights**: **STRICTLY PROHIBITED**. Raw video cannot be committed to a public GitHub repository, bundled in Docker images, or re-hosted.
- **Public Demonstration Rights**: Restricted. Permitted solely for academic presentations citing the competition paper. Commercial or open hackathon redistribution is not authorized.

### 4.4 Conclusion for AI City Challenge
The AI City Challenge dataset is an outstanding academic benchmark for Re-ID feature embeddings, but **it is completely unsuitable as NETRAVAHA's primary demonstration source because number plates are physically blurred out, and license terms prohibit public distribution.**

---

## 5. IIIT Hyderabad Dataset Investigation

We audited the **Indian Driving Dataset (IDD)**, **IDD-3D**, and related extensions released by IIIT Hyderabad's Center for Visual Information Technology (CVIT) and iHub-Data.

### 5.1 Dataset Characteristics
- **Official Source**: IIIT Hyderabad (Insaan / iHub-Data portals).
- **Datasets Audited**:
  - `IDD Segmentation` (10,004 finely annotated road images, 34 classes).
  - `IDD Detection` (54,000+ bounding box annotated frames across 182 drive sequences).
  - `IDD-3D` / `IDD-PeD` (Multi-modal LiDAR + camera sequences).
- **Geographic Context**: Hyderabad, Bangalore, and regional Indian highways.
- **Traffic Nature**: Authentic unconstrained Indian traffic (auto-rickshaws, two-wheelers, tractors, erratic lane discipline).

### 5.2 Technical Audit Against Criteria
- **Camera Perspective (A)**: **FATAL FAILURE (EGO-VEHICLE ONLY)**.  
  Every frame in IDD was captured by a forward-facing dashboard camera or roof-mounted camera on a moving collection vehicle. There are **zero fixed roadside CCTV feeds**.
- **Multi-Camera Tracking (B, C)**: **NONE**. Footage is captured along a continuous trajectory from a single moving vantage point. A vehicle is seen once and passes by; there is no cross-camera junction hop.
- **License Plate Visibility (D, E)**: **LOW / UNANNOTATED**. While plates on nearby vehicles are physically visible, IDD contains **no number plate bounding boxes or text annotations**. The focus is on drivable area, obstacle detection, and semantic segmentation.
- **Video Availability (J, K)**: Most released subsets are **extracted image sequences (PNG/JPEG)** rather than continuous streaming MP4 videos.

### 5.3 License & Provenance Terms
- **License Classification**: `RESEARCH_OPEN_ACCESS` (iHub-Data Terms of Use).
- **Commercial / Public Demonstration**: Requires academic citation; non-commercial research use only. Raw video redistribution inside third-party repositories is restricted.

### 5.4 Proper Architectural Role for IDD
IDD cannot be ingested into the video gateway or used for live CCTV simulation. However, IDD is **highly valuable for offline AI model validation**:
- Validating YOLOv8 detection accuracy on Indian vehicle classes (`motorcycle`, `auto-rickshaw`, `bus`, `truck`).
- Evaluating detector robustness under Indian lighting, dust, and congestion.

---

## 6. Other Candidate Dataset Investigation

We expanded the audit to three additional prominent candidate sources:

### 6.1 UA-DETRAC Benchmark (University at Albany / Chinese Academy of Sciences)
- **Topology**: 10 hours of real-world traffic video captured across 24 fixed camera locations in Beijing and Tianjin.
- **Positives**: Fixed roadside CCTV viewpoints; overhead bridge angles; 1.21 million labeled vehicle bounding boxes.
- **Failures**:
  - **Single Camera per Sequence**: Cameras are at completely independent intersections; no vehicle ever appears in multiple cameras.
  - **No Plate Readability**: Captured from high overpasses; resolution (960x540) is too low for character recognition. No plate annotations.
- **License**: Free for academic research; redistribution restricted.

### 6.2 VeRi-776 (PKU / Cooperative Medianet Innovation Center)
- **Topology**: 20 fixed surveillance cameras in a 1.0 km² area; 776 vehicle identities across 50,000 images.
- **Positives**: True multi-camera vehicle tracking with spatial and temporal timestamps. Includes plate annotations and vehicle attributes.
- **Failures**:
  - **Image Cropping Benchmark, NOT Video**: VeRi-776 is distributed as cropped vehicle image cutouts, not continuous video streams. It cannot be streamed over RTSP via FFmpeg.
- **License**: Restricted academic use upon email request; redistribution prohibited.

### 6.3 Open Indian ANPR Corpora (DataCluster Labs / Zenodo / Kaggle Indian Plates)
- **Topology**: Thousands of static images of Indian cars, SUVs, and commercial vehicles with visible HSRP and legacy number plates.
- **Positives**: High resolution; genuine Indian font styles (Bharat stage state codes, e.g., `GJ`, `MH`, `DL`); ground-truth OCR text.
- **Failures**: Disconnected static photographs; zero temporal continuity; zero video; zero camera topology.

---

## 7. License / Provenance Audit Matrix

| Dataset | Official Owner | Access Method | Declared License | Redistribution Permitted? | Public Live Demo Permitted? | Raw Video in Repo? | Provenance Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CityFlowV2 (AI City 2022)** | NVIDIA / UW IPL | Portal Registration + Agreement | Restricted Research Agreement | **NO** | Academic Only | **NO** | `RESTRICTED_RESEARCH` |
| **IDD (IIIT Hyderabad)** | IIIT-H / iHub-Data | Web Registration | Academic Open Access | **NO** | Research Only | **NO** | `RESEARCH_ONLY` |
| **UA-DETRAC** | Univ. at Albany | Direct HTTP Download | Academic Use Only | **NO** | Non-Commercial | **NO** | `RESEARCH_ONLY` |
| **VeRi-776** | Peking University | Institutional Email Request | Non-Commercial Research | **NO** | Research Only | **NO** | `RESTRICTED_RESEARCH` |
| **Open Indian Plates (Zenodo)** | Community Researchers | Open Download | CC-BY 4.0 / CC0 | **YES** (with citation) | **YES** | Static crops only | `VERIFIED_OPEN_ACCESS` |
| **NETRAVAHA Synthetic Fixtures** | NETRAVAHA Core Team | Local Repository Asset | In-house Engineering Asset | **YES** | **YES** | **YES** | `APPROVED_SYNTHETIC` |
| **`demo-traffic.mp4` (`SRC-RES-HWY-01`)** | Public Research Video | Public web mirror | Unknown Upstream Terms | **UNVERIFIED** | Restricted Local | Pending | `LICENSE_VERIFICATION_REQUIRED` |

---

## 8. Multi-Camera Capability Analysis

To demonstrate multi-camera investigation, the dataset setup must satisfy three physical constraints:
1. **Camera Spatial Separation**: Camera A and Camera B must represent geographically distinct locations separated by a realistic road network distance (e.g., 2.5 km to 15 km).
2. **Temporal Continuity**: When vehicle $V$ departs Camera A at timestamp $T_1$, it must arrive at Camera B at timestamp $T_2$ such that the calculated transit speed:
   $$v = \frac{\Delta d}{\Delta t} = \frac{\text{distance}(C_A, C_B)}{T_2 - T_1}$$
   falls within plausible urban or highway speed limits (e.g., 20 km/h to 100 km/h).
3. **Correlation Validation**: The platform's Phase 10 spatio-temporal correlation engine verifies this velocity window:
   - If transit speed is physically impossible ($> 180\text{ km/h}$), the score is penalized.
   - If transit speed is physically consistent ($30 - 80\text{ km/h}$), the correlation score receives full temporal weight ($S_{time} \ge 0.85$).

### Candidate Dataset Multi-Camera Assessment

| Dataset | Fixed Nodes | Cross-Camera Overlap | Synchronized Clocks | Plausible Speed Vectors | CCTV Suitability | Multi-Cam Suitability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AI City CityFlow** | 36–46 | Yes (666 vehicles) | Yes (10 FPS synced) | Yes (Urban corridor) | **HIGH** | **HIGH** |
| **IIIT-H IDD** | 0 (Mobile) | None | N/A (Ego-vehicle) | No (Single trajectory) | **LOW** | **LOW** |
| **UA-DETRAC** | 24 (Isolated) | None | No (Independent) | No (Independent files) | **HIGH** | **LOW** |
| **VeRi-776** | 20 (Images) | Yes (776 vehicles) | Yes (Timestamped) | Yes (Urban grid) | **LOW** (No Video) | **HIGH** |
| **NETRAVAHA Synthetic** | 4+ Configurable | Yes (Target Vehicle) | Yes (Wall-clock sync) | Yes (Calibrated GIS) | **HIGH** | **HIGH** |

---

## 9. Plate / Vehicle Search Capability Analysis

NETRAVAHA's investigative command center relies on two complementary search mechanisms:
1. **Direct Plate Search & Watchlist Matching**: Exact or normalized character lookup ($N_p$), validated through multi-frame consensus (5–8 frames with confidence $\ge 0.60$).
2. **Fuzzy & Spatio-Temporal Correlation**: Handles partial occlusions, character substitution (e.g., `8` vs `B`, `0` vs `D`), and spatio-temporal velocity scoring.

### The Critical Dataset Mismatch
As established in Section 4, academic multi-camera datasets (AI City Challenge) deliberately obscure number plates to protect citizen privacy. Consequently:
- If NETRAVAHA runs exclusively on AI City Challenge videos, the AI worker's plate detector finds zero plates.
- The multi-frame consensus engine never triggers.
- The watchlist engine never generates an alert.
- The vehicle timeline displays zero sightings.
- The entire ANPR and forensic evidence architecture becomes invisible to the judges.

Conversely, static Indian plate datasets provide high-resolution plates but cannot produce an RTSP stream.

### The Engineering Solution
The platform must separate **ANPR Verification** from **Dense Traffic Replay**:
- Use **Tier 1 (High-Contrast Synthetic Corridor Streams)** with native Indian HSRP formatting (`GJ01AB1234`) to drive the deterministic live ANPR, watchlist firing, and forensic hashing pipeline.
- Use **Tier 2 (Continuous Multi-Lane Surveillance Video)** to drive high-density YOLO vehicle detection, bounding-box rendering, traffic telemetry, and camera grid visualization.

---

## 10. Replay / RTSP Feasibility

To integrate with NETRAVAHA without altering a single line of backend or AI worker code, the video source must be streamable via standard network protocols.

### 10.1 FFmpeg Replay Architecture
NETRAVAHA's video gateway uses FFmpeg in a lightweight container configured to loop video files infinitely at real-time speeds:
```bash
ffmpeg -hide_banner -loglevel warning \
  -re \
  -stream_loop -1 \
  -i /fixtures/cam-source.mp4 \
  -c:v copy \
  -f rtsp -rtsp_transport tcp \
  rtsp://video-gateway:8554/cam-path
```

### 10.2 Parameter Guarantees
- `-re`: Forces FFmpeg to read input at native frame rate (prevents flooding the network).
- `-stream_loop -1`: Seamlessly loops the source file indefinitely without dropping the TCP socket.
- `-c:v copy`: Stream copy mode; zero CPU re-encoding overhead; maintains original H.264 NAL units.
- `-rtsp_transport tcp`: Eliminates UDP packet loss over virtual Docker network bridges.

### 10.3 MediaMTX Gateway Role
MediaMTX (pinned at `bluenviron/mediamtx:1.9.3`) acts as the central RTSP server:
- Listens on `:8554` for RTSP publishers and subscribers.
- Automatically remuxes incoming RTSP into low-latency HLS (`:8888/<path>/index.m3u8`) for the web browser.
- Exposes REST API on `:9997` (`/v3/config/paths/*`) for dynamic stream registration by NestJS `MediaGatewayService`.
- Both synthetic and real video files conform identically to this streaming boundary.

---

## 11. Existing NETRAVAHA Dataset Audit

We audited the existing video catalog in `docs/VIDEO_SOURCE_CATALOG.md` and repository fixtures in `video-gateway/fixtures/`:

### 11.1 Source 1: `SRC-SYNTH-AHM-01` (`cam-ahm-01.mp4`)
- **Location**: SG Highway - Pakwan Crossroad Junction, Ahmedabad (`23.0338142, 72.5073289`).
- **Characteristics**: 1280x720, 25.00 FPS, 6.00 seconds (150 frames, looping).
- **Target Plate**: High-contrast white HSRP `GJ01AB1234` rendered on a dark SUV.
- **License / Provenance**: `APPROVED_SYNTHETIC` (Generated via FFmpeg `lavfi` script in `video-gateway/generate-fixtures.sh`).
- **Status**: **VERIFIED & OPERATIONAL**. Guaranteed deterministic trigger for stolen vehicle FIR #102/2026.

### 11.2 Source 2: `SRC-SYNTH-AHM-02` (`cam-ahm-02.mp4`)
- **Location**: C.G. Road - Swastik Char Rasta, Ahmedabad (`23.0354120, 72.5592810`).
- **Characteristics**: 1280x720, 25.00 FPS, 6.00 seconds (150 frames, looping).
- **Target Plate**: `GJ01AB1234`.
- **License / Provenance**: `APPROVED_SYNTHETIC` (Generated in-house).
- **Status**: **VERIFIED & OPERATIONAL**. Serves as the second hop in the multi-camera journey reconstruction.

### 11.3 Source 3: `SRC-RES-HWY-01` (`demo-traffic.mp4`)
- **Assigned Camera**: `CAM-DEMO-01` (Ahmedabad-Gandhinagar Highway Corridor).
- **Characteristics**: 1280x720, 29.97 FPS, 29.70 seconds (890 frames, 10.3 MB).
- **Plate Readability**: Class B (Distant multi-lane traffic; plates blurry; excellent vehicle contours).
- **License Status**: Currently marked `LICENSE_VERIFICATION_REQUIRED`.
  - **Resolution**: Asset origin traces to a public traffic surveillance benchmark snippet. While suitable for non-commercial local testing, its upstream copyright is not explicitly cleared for open-source redistribution under Apache-2.0/MIT.
  - **Audit Ruling**: Retain as a local development fixture, but **do not make it the sole basis of the public demonstration**. Pair it with verified open-license footage or open-gov traffic feeds.

---

## 12. Recommended Dataset Architecture

To reconcile technical authenticity, legal safety, and evaluative wow-factor, NETRAVAHA shall implement a **Three-Tier Hybrid Demonstration Architecture**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                             NETRAVAHA DEMONSTRATION DATA ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                               │
       ┌───────────────────────────────────────┼────────────────────────────────────────┐
       ▼                                       ▼                                        ▼
┌───────────────────────────────┐ ┌────────────────────────────────┐ ┌──────────────────────────────────┐
│            TIER 1             │ │             TIER 2             │ │              TIER 3              │
│   Deterministic Corridor      │ │   Representative Surveillance  │ │    Simulated Ingestion Gateway   │
│          Fixtures             │ │         Research Video         │ │          (MediaMTX + FFmpeg)     │
├───────────────────────────────┤ ├────────────────────────────────┤ ├──────────────────────────────────┤
│ • In-house synthetic HSRP     │ │ • Real multi-lane highway &    │ │ • Looped continuously via FFmpeg │
│   target plates (GJ01AB1234)  │ │   urban traffic flow           │ │ • Normalized RTSP stream paths   │
│ • Predictable arrival windows │ │ • High vehicle count & density │ │ • Low-latency HLS for web console│
│ • Powers: Multi-frame ANPR,   │ │ • Powers: YOLO vehicle class   │ │ • Zero alteration to AI worker,  │
│   Watchlist Alerts, Timeline, │ │   detection, GIS markers,      │ │   backend, or database contracts │
│   SHA-256 Evidence Hashing    │ │   stream health telemetry      │ │                                  │
│ • Status: APPROVED & VERIFIED │ │ • Status: OPEN-GOV / CC-BY     │ │ • Status: PRODUCTION-READY       │
└───────────────────────────────┘ └────────────────────────────────┘ └──────────────────────────────────┘
```

### Architectural Role Allocation
1. **Tier 1 (ANPR & Forensic Core)**:
   - Fixed junction viewpoints: `CAM-AHM-01` (Pakwan Crossroad), `CAM-AHM-02` (Swastik Char Rasta), and `CAM-GND-02` (CH-0 Circle).
   - Generates guaranteed plate detections for `GJ01AB1234` (FIR #102/2026 Stolen Hyundai Creta).
   - Validates multi-frame consensus (6 of 6 frames, confidence 0.945+).
   - Generates genuine MinIO JPEG evidence frames with cryptographically verified SHA-256 digests.
   - Demonstrates spatio-temporal route velocity across Ahmedabad and Gandhinagar.

2. **Tier 2 (Realistic CCTV Visual Context)**:
   - Deployed on wide-area feeds: `CAM-DEMO-01` (Highway Corridor), `CAM-SUR-01` (VR Mall Junction), and `CAM-VAD-01` (Station Circle).
   - Demonstrates continuous multi-lane vehicle tracking (cars, trucks, buses, two-wheelers).
   - Demonstrates AI worker load resilience (processing 30 FPS streams with 10+ concurrent vehicles).
   - Demonstrates stream health monitoring (packet loss, actual FPS, reconnection backoff).

3. **Tier 3 (Protocol Gateway)**:
   - Exposes all camera streams over standard RTSP (`rtsp://video-gateway:8554/<camera_id>`).
   - MediaMTX dynamically routes and packages streams for HLS web display.
   - Preserves complete architectural fidelity: if connected to physical police NVRs tomorrow, the system behaves identically.

---

## 13. Dataset Manifest Proposal

To eliminate hardcoded assumptions and maintain strict provenance tracking, Phase 13 will introduce a formal, machine-readable dataset manifest: `fixtures/manifests/demonstration_manifest.json`.

```json
{
  "$schema": "https://netravaha.police.gujarat.gov.in/schemas/v1/dataset-manifest.json",
  "manifestVersion": "1.0.0",
  "metadata": {
    "title": "NETRAVAHA Gujarat Demonstration CCTV Corridor",
    "challenge": "Gujarat Police Innovation Challenge 2026",
    "classification": "CONTROLLED_DEMO_REPRESENTATIVE_CORRIDOR",
    "generatedAt": "2026-10-03T00:00:00Z",
    "disclaimer": "Simulated live deployment using representative traffic recordings and deterministic test fixtures. Does not access production government CCTV networks."
  },
  "cameras": [
    {
      "cameraId": "CAM-AHM-01",
      "canonicalName": "SG Highway - Pakwan Crossroad Junction",
      "district": "Ahmedabad",
      "zone": "West Zone",
      "coordinates": { "lat": 23.0338142, "lng": 72.5073289 },
      "corridorRole": "ORIGIN_NODE",
      "stream": {
        "rtspPath": "cam-ahm-01",
        "hlsPath": "cam-ahm-01/index.m3u8",
        "codec": "h264",
        "resolution": "1280x720",
        "fps": 25.0
      },
      "videoAsset": {
        "sourceId": "SRC-SYNTH-AHM-01",
        "filePath": "video-gateway/fixtures/cam-ahm-01.mp4",
        "durationSeconds": 6.0,
        "sha256": "d99908cf64efba967733f572a154884299b84a27572778c187be09d363d3cbe0",
        "qualityClass": "Class A (Full ANPR)"
      },
      "groundTruth": {
        "targetPlates": [
          {
            "plate": "GJ01AB1234",
            "vehicleClass": "SUV",
            "color": "White",
            "make": "Hyundai",
            "model": "Creta",
            "expectedConfidence": 0.945,
            "firReference": "FIR #102/2026"
          }
        ]
      }
    },
    {
      "cameraId": "CAM-AHM-02",
      "canonicalName": "C.G. Road - Swastik Char Rasta",
      "district": "Ahmedabad",
      "zone": "West Zone",
      "coordinates": { "lat": 23.0354120, "lng": 72.5592810 },
      "corridorRole": "TRANSIT_HOP_1",
      "stream": {
        "rtspPath": "cam-ahm-02",
        "hlsPath": "cam-ahm-02/index.m3u8",
        "codec": "h264",
        "resolution": "1280x720",
        "fps": 25.0
      },
      "videoAsset": {
        "sourceId": "SRC-SYNTH-AHM-02",
        "filePath": "video-gateway/fixtures/cam-ahm-02.mp4",
        "durationSeconds": 6.0,
        "sha256": "7d4cb8a0e365023956bf35d79124483ae2bfe35e1d44ebbb7d90d810baaece43",
        "qualityClass": "Class A (Full ANPR)"
      },
      "groundTruth": {
        "targetPlates": [
          {
            "plate": "GJ01AB1234",
            "vehicleClass": "SUV",
            "color": "White",
            "make": "Hyundai",
            "model": "Creta",
            "expectedConfidence": 0.962,
            "firReference": "FIR #102/2026"
          }
        ]
      }
    },
    {
      "cameraId": "CAM-DEMO-01",
      "canonicalName": "Ahmedabad - Gandhinagar Highway Corridor",
      "district": "Ahmedabad",
      "zone": "Corridor Zone",
      "coordinates": { "lat": 23.1142000, "lng": 72.5856000 },
      "corridorRole": "HIGHWAY_FLOW",
      "stream": {
        "rtspPath": "demo-traffic",
        "hlsPath": "demo-traffic/index.m3u8",
        "codec": "h264",
        "resolution": "1280x720",
        "fps": 29.97
      },
      "videoAsset": {
        "sourceId": "SRC-RES-HWY-01",
        "filePath": "video-gateway/fixtures/demo-traffic.mp4",
        "durationSeconds": 29.7,
        "sha256": "542a170792cb3e4fa8d04260a9f5d37651c6b12a8a8ec9ecae49d85e78ecadad",
        "qualityClass": "Class B (Vehicle Detection & Flow)"
      },
      "groundTruth": {
        "targetPlates": []
      }
    }
  ]
}
```

---

## 14. Camera Mapping Proposal

To provide an authentic operational map of Gujarat, candidate video feeds are mapped to 10 strategic police monitoring junctions across three major urban commissionerates:

| Camera Code | Police Commissionerate / District | Location / Landmark | Lat / Long | Assigned Asset | Role in Live Demo |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CAM-AHM-01` | Ahmedabad City Police | SG Highway - Pakwan Crossroad | `23.0338142, 72.5073289` | `cam-ahm-01.mp4` | Primary ANPR Trigger (`GJ01AB1234`) |
| `CAM-AHM-02` | Ahmedabad City Police | C.G. Road - Swastik Char Rasta | `23.0354120, 72.5592810` | `cam-ahm-02.mp4` | Sighting Hop 2 (Route Velocity Check) |
| `CAM-AHM-03` | Ahmedabad City Police | Sabarmati Riverfront Promenade | `23.0415100, 72.5742100` | `cam-ahm-01.mp4` | Live Patrol Grid Stream |
| `CAM-AHM-04` | Ahmedabad City Police | SG Highway - ISKCON Flyover | `23.0287100, 72.5065400` | `cam-ahm-01.mp4` | Arterial Intersection Monitoring |
| `CAM-GND-01` | Gandhinagar Police | Gandhinagar Secretariat - Gate 1 | `23.2167200, 72.6372100` | Mock Vendor Gateway | High-Security Zone Protocol Adapter |
| `CAM-GND-02` | Gandhinagar Police | CH-0 Circle - Highway Entrance | `23.1985400, 72.6288300` | `cam-ahm-02.mp4` | Sighting Hop 3 (Inter-City Transit) |
| `CAM-DEMO-01`| State Traffic Branch | SG Expressway Corridor | `23.1142000, 72.5856000` | `demo-traffic.mp4`| Dense Traffic Flow & YOLO Multi-Class |
| `CAM-SUR-01` | Surat City Police | Dumas Road - VR Mall Junction | `21.1492000, 72.7483000` | `demo-traffic.mp4`| South Gujarat Commercial Hub View |
| `CAM-SUR-02` | Surat City Police | Ring Road - Sahara Darwaja | `21.1965000, 72.8421000` | `cam-ahm-02.mp4` | Textile Corridor Transit View |
| `CAM-VAD-01` | Vadodara City Police | Sayajigunj - Railway Station Circle | `22.3108000, 73.1812000` | `demo-traffic.mp4`| Central Transit Hub View |

---

## 15. Timestamp Strategy

Handling timestamps correctly in a looped video simulation is critical to prevent forensic anomalies:

### 15.1 The Looping Timestamp Problem
If a 30-second video is looped via FFmpeg, the container's presentation timestamps (PTS) either wrap around back to zero or increment monotonically from start of process. If the AI worker reads the video's embedded timestamp, sightings would appear clustered in a tiny 30-second window or jump backwards upon loop restart.

### 15.2 Live Wall-Clock Normalization Strategy
To ensure spatio-temporal calculations reflect real-world operational time:
1. **Frame Capture Timestamp**: When the AI Worker's `StreamConsumer` grabs a frame from the RTSP stream, it immediately assigns the **system UTC wall-clock time (`datetime.now(timezone.utc)`)** as the frame's `captured_at` timestamp.
2. **Stream Looping Decoupling**: The AI worker evaluates frame contents in real-time as they arrive over RTSP, completely decoupled from the original file's creation metadata.
3. **Consensus Window Filtering**: The multi-frame consensus engine evaluates observations within a dynamic sliding window ($\Delta t \le 3.0\text{ seconds}$). Monotonic wall-clock timestamps ensure clean consensus aggregation across loop boundaries.
4. **Historical Seeding Alignment**: In `seed.ts`, historical demo sightings for `GJ01AB1234` are generated dynamically relative to current execution time:
   - Sighting 1: `Date.now() - 15 * 60 * 1000` (15 mins ago)
   - Sighting 2: `Date.now() - 10 * 60 * 1000` (10 mins ago)
   - Sighting 3: `Date.now() - 2 * 60 * 1000` (2 mins ago)
   This guarantees that whenever evaluators open the timeline, sightings appear recent, relevant, and temporally continuous.

---

## 16. Simulated-Live Strategy

The operational mechanics of converting static video files into continuous, responsive live feeds:

```
┌────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│ Video Files (.mp4)     │ ──►  │ FFmpeg Stream Simulator │ ──►  │ MediaMTX Video Gateway  │
│ /fixtures/*.mp4        │      │ -re -stream_loop -1     │      │ :8554 (RTSP Publisher)  │
└────────────────────────┘      └─────────────────────────┘      └───────────┬─────────────┘
                                                                             │
                                                                             ├──► RTSP Feeds (:8554)
                                                                             │    (Consumed by AI Worker)
                                                                             │
                                                                             └──► HLS Feeds (:8888)
                                                                                  (Consumed by Browser)
```

1. **Autonomous Reconnection**: If MediaMTX restarts, FFmpeg's `stream-loop.sh` traps connection dropouts and reconnects within 3 seconds without container death.
2. **Dynamic Gateway Provisioning**: NestJS `MediaGatewayService` interacts with MediaMTX REST API (`:9997`) to inspect, activate, or alter camera stream paths on demand without downtime.
3. **Low-Latency Remuxing**: MediaMTX converts H.264 RTP packets directly into fMP4 HLS chunks with 1-second segment durations, delivering a glass-to-glass latency under 2.5 seconds in modern browsers.

---

## 17. Ground-Truth vs Runtime-Detection Strategy

A vital architectural principle for the Gujarat Police Innovation Challenge is **maintaining pipeline authenticity**:

### 17.1 Runtime YOLO & OCR Are Authoritative
- Ground truth from the dataset manifest must **NEVER** be injected into the live detection pipeline to fake or bypass inference.
- Every vehicle detection, plate crop, OCR string, and confidence score presented in the UI is generated **in real time by the running AI worker**:
  - YOLOv8 detects the vehicle bounding box.
  - Plate detector crops the license plate.
  - OCR extracts the alphanumeric characters (`GJ01AB1234`).
  - Multi-frame consensus validates 5–8 consecutive frames.
  - MinIO stores the raw JPEG crop.
  - SHA-256 hash is computed over the stored binary.
  - Redis Stream event fires to the backend.

### 17.2 Manifest as Offline Benchmark & Verification Ground Truth
The ground-truth annotations in `demonstration_manifest.json` are utilized strictly for:
1. Automated CI/CD end-to-end regression testing.
2. Calculating quantitative performance metrics:
   - Detector Precision / Recall.
   - Character Error Rate (CER) / Word Error Rate (WER) on plates.
   - Sighting latency (time from stream ingestion to alert broadcast).
3. Demonstrating to evaluators that NETRAVAHA's detections match known physical realities with measurable accuracy.

---

## 18. Legal / Attribution / Provenance Requirements

To maintain strict compliance with legal, ethical, and competition guidelines:

1. **Repository Hygiene**:
   - No restricted academic datasets (AI City Challenge, VeRi-776, IDD) shall be copied into or hosted within the GitHub repository.
   - All committed video fixtures must be either:
     a) In-house synthetic files generated by project code (`SRC-SYNTH-*`).
     b) Verified Open-Government / CC0 / CC-BY media with proper attribution.
2. **Attribution Documentation**:
   - `docs/VIDEO_SOURCE_CATALOG.md` must be maintained as the permanent, authoritative ledger of every media asset used, recording its hash, origin, quality class, and license terms.
3. **Third-Party Research Video Flagging**:
   - Any research video whose upstream commercial clearance is ambiguous must retain the explicit designation `LICENSE_VERIFICATION_REQUIRED` and remain restricted to local prototype evaluation.

---

## 19. Demo Truthfulness Requirements

To ensure complete transparency before the evaluation committee:

### 19.1 Clear UI Disclosure
The web console must display prominent, unambiguous notices indicating that current live feeds are representative simulated streams:
- In the Live Camera Grid: A persistent badge reading:  
  `[SIMULATED LIVE CCTV — REPRESENTATIVE CORRIDOR DEPLOYMENT]`
- In the Video Player Header: Subtitle showing:  
  `Source: Normalized Media Gateway (Simulated RTSP Ingestion)`
- In the System Status Banner: Clear notice:  
  `"Platform operating in demonstration mode using representative highway/junction recordings. Physical police NVR/VMS connectors ready for authorized ingestion."`

### 19.2 Truthful Demonstration Script
When presenting to judges:
- **State Clearly**: *"NETRAVAHA is currently running against our high-fidelity simulated streaming gateway using representative traffic and test corridor feeds."*
- **Explain the Architecture**: *"The RTSP/ONVIF ingestion interface you see here is identical to standard departmental VMS interfaces. When authorized police camera feeds are connected, they stream through this exact gateway without changing a single line of backend or AI code."*
- **Never Claim**: Do not claim that live Gandhinagar Secretariat or Ahmedabad City cameras are broadcasting real surveillance into the demo room.

---

## 20. Risks and Limitations

| Risk Factor | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Short Loop Duration on Synthetic Fixtures** | 6-second fixture may appear repetitive to an observer staring at a single camera. | Generate a longer 30-to-60 second multi-vehicle fixture in Phase 13 with natural inter-vehicle gaps; mix with wide-angle Tier 2 highway video. |
| **Lighting & Weather Variation** | Current fixtures simulate daytime clear weather only. | Expand fixture generation script to produce nighttime and rain test sequences for AI model resilience benchmarking. |
| **High Density Ingestion Load** | Streaming 10 concurrent RTSP feeds simultaneously may strain developer laptop CPU. | MediaMTX uses stream copy (`-c:v copy`), consuming $< 2\%$ CPU. AI worker uses configurable sampling (`SAMPLE_FPS = 3.0`) and worker thread throttling. |
| **Plate Font Variation** | OCR may fail on non-standard, decorative, or regional fonts. | Phase 3D consensus engine requires 60% agreement over 5+ frames; Phase 10 fuzzy correlation recovers partial character mismatches. |

---

## 21. Exact Implementation Plan for Phase 13

Phase 13 will execute the approved Three-Tier Dataset Strategy:

### Task 13.1: Dataset Manifest & Provenance Engine
- Create `video-gateway/manifests/demonstration_manifest.json` formalizing camera metadata, corridor coordinates, video asset digests, and ground-truth targets.
- Create a lightweight Python validator `scripts/validate_manifest.py` to verify file existence, SHA-256 hashes, and RTSP route syntax.

### Task 13.2: Multi-Corridor Video Asset Hardening
- Expand `video-gateway/generate-fixtures.sh` to generate an extended 30-second multi-vehicle corridor fixture (`cam-ahm-corridor.mp4`) containing:
  - Background traffic (buses, trucks, motorcycles).
  - Target vehicle `GJ01AB1234` passing at second 8.
  - Realistic road textures and junction signage.
- Resolve `SRC-RES-HWY-01` provenance or replace with a verified CC0/Open-Gov highway surveillance stream.

### Task 13.3: Dynamic Stream Simulator Orchestration
- Update `video-gateway/stream-loop.sh` to dynamically read camera routes from `demonstration_manifest.json`.
- Expose 8 to 10 independent RTSP channels on MediaMTX covering the Ahmedabad-Gandhinagar corridor.

### Task 13.4: Automated Ingestion & Health Verification Suite
- Implement an automated health check script `scripts/verify_simulated_corridor.sh` that:
  - Probes all RTSP endpoints via `ffprobe`.
  - Asserts HLS stream manifest generation (`index.m3u8`).
  - Connects the AI Worker and asserts live sighting events on Redis stream `gujcamera:events:vehicle-sightings`.

---

## 22. Acceptance Criteria for Phase 13

Phase 13 will be considered complete when all of the following conditions are verified:

1. **Manifest Integrity**: `demonstration_manifest.json` exists, is syntactically valid, and all listed video assets match their recorded SHA-256 hashes.
2. **Stream Availability**: At least 8 continuous RTSP streams are actively publishing to MediaMTX without frame drop or disconnect crashes over a 15-minute continuous run.
3. **End-to-End Live ANPR**: Target vehicle `GJ01AB1234` is detected live by the AI worker on `CAM-AHM-01` and `CAM-AHM-02`, generating valid Redis sighting events with confidence $\ge 0.60$.
4. **Watchlist & Alert Triggering**: An active watchlist alert fires in the backend and appears in the frontend notification drawer via WebSocket within 3 seconds of stream playback.
5. **Multi-Camera Timeline**: Investigating plate `GJ01AB1234` displays a multi-hop transit timeline with correct spatial coordinates and physically plausible transit velocities.
6. **Evidence Integrity**: MinIO stores the raw sighting crops, and the backend verification API (`/api/evidence/:id/verify`) returns `VERIFIED` with zero hash mismatches.
7. **Disclosure Compliance**: All frontend stream views display the required `[SIMULATED LIVE CCTV]` disclaimer badges.

---

## Conclusion & Phase Readiness

```
================================================================================
PHASE 12 STATUS:
READY FOR IMPLEMENTATION

NEXT PHASE:
PHASE 13 — DATASET ADAPTER + SIMULATED LIVE CCTV INGESTION
================================================================================
```
