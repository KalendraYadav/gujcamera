# AI Vision Worker (Phase 3C — Vehicle Detection & License Plate Localization)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026

## Overview

The `ai-worker` service provides the containerized video ingestion and computer-vision foundation for the Gujarat Police CCTV surveillance platform. It ingests live RTSP streams via OpenCV over TCP, performs deterministic frame sampling, runs lightweight CPU-first YOLOv8 vehicle detection, localizes license plate bounding boxes, and constructs a structured in-memory `DetectionResult` contract.

> [!IMPORTANT]
> **Phase 3C Scope Boundary**:
> This service performs **Vehicle Detection** and **License Plate Bounding-Box Localization**.
> **Phase 3C does NOT perform OCR or Text Recognition.**
> Plate character extraction, OCR consensus voting, Redis sighting events, MinIO evidence uploading, database persistence, watchlist matching, and alerts are deferred to Phases 3D through 3G.

---

## Architectural Position

```
Deterministic CCTV Feeds / RTSP Cameras
               │
               ▼
MediaMTX RTSP Gateway (video-gateway:8554)
               │
               ▼  [RTSP over TCP]
       OpenCV VideoCapture
               │
               ▼
     Frame Rate Sampler (3.0 FPS)
               │
               ▼
   In-Memory FramePayload Contract
               │
               ▼
   YOLOv8n Vehicle Detection (CPU)
   [CAR, MOTORCYCLE, BUS, TRUCK, OTHER_VEHICLE]
               │
               ▼
   License Plate Localizer
   ┌───────────────────────────┬───────────────────────────┐
   │ DEDICATED_ML_PLATE_LOCALIZER│ HEURISTIC_PLATE_LOCALIZER │
   │ (Dedicated YOLO Plate ML) │ (Morphological Fallback)  │
   └───────────────────────────┴───────────────────────────┘
               │
               ▼
   Structured DetectionResult (In-Memory)
   - Vehicle Bounding Boxes & Confidence
   - Plate Bounding Boxes & Confidence (NO OCR, NO CROPS)
   - Inference Latency Telemetry & Heartbeats
```

---

## Technical Specifications

- **Base Runtime**: Python 3.11 (`python:3.11-slim`)
- **Isolation**: Non-root system user (`appuser`, UID 1001)
- **Decoding Engine**: OpenCV Headless 4.10 (`cv2.VideoCapture` with FFmpeg backend)
- **Transport**: RTSP over TCP (`OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp"`)
- **Frame Sampling**: Configurable (Default: 3.0 FPS; PoC Target: 3.0–5.0 FPS)
- **Vehicle Model**: YOLOv8 Nano (`yolov8n.pt`, 6.2 MB) on PyTorch CPU
- **Plate Localizer**: Pluggable abstraction (`DEDICATED_ML_PLATE_LOCALIZER` or `HEURISTIC_PLATE_LOCALIZER`)
- **Resilience**: Independent per-camera daemon thread; stream or inference failure on one camera never stops another.

---

## Model Architecture & Licensing

### MODEL / LICENSING NOTE: Ultralytics YOLOv8n

- **Package Dependency**: `ultralytics` (pinned: `==8.4.145`)
- **Model Weights**: YOLOv8 Nano (`yolov8n.pt`, v8.3.0 release asset, 6,549,796 bytes)
- **Model URL**: `https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt`
- **SHA-256 Checksum**: `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`
- **Model License**: GNU Affero General Public License v3.0 (AGPL-3.0) / Commercial Enterprise License
- **PoC Suitability**: Fully suitable for non-commercial academic research, hackathon PoC evaluation, and architectural demonstration.
- **Production Clearance Warning**: Production deployment for the Gujarat Police state-wide platform requires formal licensing review. If the software is distributed or provided over a network as a service under government procurement, an Ultralytics Commercial Enterprise license or migration to a permissively-licensed model (e.g., Apache-2.0 YOLOv10, RT-DETR, or ONNX runtime export) must be completed. Production licensing is NOT cleared at PoC stage.

---

## Vehicle Class Normalization

The pretrained YOLOv8n model operates on the standard 80-class COCO dataset. It directly detects **4 primary road vehicle categories**:
- `car` (COCO ID 2) ➔ `CAR`
- `motorcycle` (COCO ID 3) ➔ `MOTORCYCLE`
- `bus` (COCO ID 5) ➔ `BUS`
- `truck` (COCO ID 7) ➔ `TRUCK`

| COCO Class (Directly Detected by YOLOv8n) | Canonical Platform Class | Operational Scope |
|---|---|---|
| `car` (COCO 2) | `CAR` | Standard passenger motorcars |
| `motorcycle` (COCO 3) | `MOTORCYCLE` | Two-wheelers |
| `bus` (COCO 5) | `BUS` | Public transit and commercial buses |
| `truck` (COCO 7) | `TRUCK` | Heavy goods and commercial freight vehicles |

> [!NOTE]
> **Domain Vocabulary vs Detector Scope**:
> The `VehicleClass` domain enum includes canonical mappings for additional vehicle types (`van`, `auto_rickshaw`, `three_wheeler`, `tractor`, `sedan`, `suv`) which normalize into `OTHER_VEHICLE` or standard classes via `VehicleClass.from_detector_label()`. These aliases exist solely for future domain model compatibility (e.g. Indian-traffic fine-tuned models). The stock YOLOv8n PoC model does **NOT** directly classify subcategories like auto-rickshaws, tractors, or specific car body types.

---

## Plate Localizer Modes & Disclaimers

The detector architecture provides two explicit localization modes reported in logs and telemetry:

1. **`DEDICATED_ML_PLATE_LOCALIZER`**:
   - Active when dedicated plate model weights are provided via `PLATE_MODEL_PATH`.
   - Runs secondary machine learning inference on cropped vehicle regions.
   - Confidence represents model-predicted detection probability.

2. **`HEURISTIC_PLATE_LOCALIZER` (PoC Fallback)**:
   - Active when no dedicated ML plate weights are provided (`PLATE_MODEL_PATH=""`).
   - Uses classical computer vision (CLAHE contrast normalization, Sobel horizontal gradient, rectangular morphological close 17x3, Otsu thresholding, contour geometry filtering for standard Indian plate aspect ratio 2.0–5.5 in the lower 65% of the vehicle crop).
   - **Crucial Limitation**: The confidence score in this mode reflects geometric aspect-ratio/contour-fill fitness, **NOT** machine-learning confidence.
   - **Disclaimer**: The heuristic fallback is strictly an engineering placeholder for the PoC; it does NOT provide production ANPR reliability.

---

## In-Memory Detection Contract

Image crops are **strictly excluded** from the domain contract:

```python
@dataclass(slots=True)
class DetectedObject:
    object_id: str
    vehicle_class: VehicleClass
    confidence: float
    bbox: BoundingBox

@dataclass(slots=True)
class DetectedPlate:
    plate_id: str
    bbox: BoundingBox
    confidence: float
    vehicle_id: Optional[str] = None
    # NOTE: image crop is NOT in domain contract

@dataclass(slots=True)
class DetectionResult:
    camera_id: str
    captured_at: float
    frame_sequence: int
    frame_width: int
    frame_height: int
    inference_timestamp: float
    inference_latency_ms: float
    plate_localizer_mode: str      # DEDICATED_ML_PLATE_LOCALIZER or HEURISTIC_PLATE_LOCALIZER
    detected_objects: List[DetectedObject] = field(default_factory=list)
    plates: List[DetectedPlate] = field(default_factory=list)
```

---

## Measured CPU Benchmark Performance

Benchmarked directly against Phase 3A deterministic synthetic fixtures (`cam-ahm-01.mp4`, `cam-ahm-02.mp4`) running YOLOv8n on CPU (x86_64) at 1280x720:

### 1. Latency Breakdown (Cold-Start vs Warmed-Up Steady-State)

| Category / Metric | CAM-AHM-01 | CAM-AHM-02 | Notes |
|---|---|---|---|
| **Hardware** | CPU (x86_64) | CPU (x86_64) | Containerized PyTorch CPU execution |
| **Model** | `yolov8n.pt` (CPU) | `yolov8n.pt` (CPU) | Pretrained YOLOv8 Nano (6.2 MB) |
| **Plate Localizer Mode** | `HEURISTIC_PLATE_LOCALIZER` | `HEURISTIC_PLATE_LOCALIZER` | PoC geometric fallback active |
| **Input Resolution** | 1280x720 | 1280x720 | Native fixture resolution |
| **Total Frames Tested** | 25 frames | 25 frames | Deterministic test fixture duration |
| **Vehicles Detected** | 0 (Ground truth) | 0 (Ground truth) | Synthetic countdown patterns have 0 vehicles |
| **Plates Localized** | 0 (Ground truth) | 0 (Ground truth) | Accurate ground truth on test pattern |
| **A. Cold-Start Latency (Frame 1)** | **945.52 ms** | **52.10 ms** | First-frame PyTorch graph allocation / weight load |
| **B. Warmed-Up Frames** | 24 frames (2..25) | 24 frames (2..25) | Steady-state inference |
| **- Warmed-Up Min** | 14.70 ms | 15.47 ms | Peak individual frame latency |
| **- Warmed-Up p50 (Median)** | 22.47 ms | 25.27 ms | Steady-state median |
| **- Warmed-Up p90** | 32.81 ms | 36.09 ms | 90th percentile latency |
| **- Warmed-Up p99** | 43.67 ms | 38.51 ms | 99th percentile latency |
| **- Warmed-Up Max** | 46.66 ms | 38.77 ms | Worst-case warmed-up frame |
| **- Warmed-Up Average** | **23.99 ms** | **25.95 ms** | **True steady-state average latency** |
| **- Warmed-Up Throughput** | **41.7 FPS** | **38.5 FPS** | Easily exceeds 3.0-5.0 FPS sampling target |
| **C. Overall Average (All 25)** | 60.86 ms | 27.00 ms | Average skewed by initial cold-start frame |
| **- Overall Achievable FPS** | 16.4 FPS | 37.0 FPS | Includes cold-start overhead |

> [!NOTE]
> **Cold-Start Outlier Clarification**:
> The 60.86 ms overall average for `CAM-AHM-01` does **NOT** represent steady-state latency. Frame 1 incurs a 945.52 ms cold-start overhead for PyTorch memory pool initialization and graph construction. Once warmed up, steady-state inference runs in **23.99 ms (41.7 FPS)** on `CAM-AHM-01` and **25.95 ms (38.5 FPS)** on `CAM-AHM-02`, well above the 3.0–5.0 FPS target.
> Furthermore, test fixtures are synthetic countdown patterns; 0 vehicles detected is the accurate ground-truth result. Vehicle detection is not falsely claimed on synthetic patterns.

---

## Running Locally and in Docker

### Reproducible Model Acquisition:
```bash
python ai-worker/scripts/download_models.py
```

### Running Unit & Benchmark Tests:
```bash
# Run all 34 unit and contract tests
docker compose run --rm ai-worker pytest -v tests/

# Run benchmark against video fixtures
docker compose run --rm ai-worker pytest -s tests/test_fixture_benchmark.py
```

### Starting the Full Stack:
```bash
docker compose up -d --build ai-worker
docker compose logs -f ai-worker
```
