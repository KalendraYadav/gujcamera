# AI Vision Worker (Phase 3D — Indian License Plate OCR + Normalization)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026

## Overview

The `ai-worker` service provides the containerized video ingestion, computer-vision, and optical character recognition (OCR) foundation for the Gujarat Police CCTV surveillance platform. It ingests live RTSP streams via OpenCV over TCP, performs deterministic frame sampling, runs lightweight CPU-first YOLOv8 vehicle detection, localizes license plate bounding boxes, extracts transient plate crops, applies CCTV contrast and thresholding preprocessing, performs character recognition via Tesseract 5 (LSTM), and executes deterministic Indian license plate normalization with structured in-memory `OCRResult` contracts.

> [!IMPORTANT]
> **Phase 3D Scope Boundary**:
> This service performs **Vehicle Detection**, **Plate Localization**, **In-Memory Plate Crop Preprocessing**, **Tesseract OCR**, and **Plate Text Normalization**.
> **Phase 3D strictly does NOT perform multi-frame temporal consensus, Redis publishing, database persistence, watchlist matching, alert triggering, MinIO evidence uploading, or frontend display.**
> Multi-frame consensus voting is deferred to Phase 3E.
> Redis sighting events and MinIO evidence vaulting are deferred to Phase 3F.

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
   Transient Plate Crop Extraction (In-Memory Only, Never Persisted)
               │
               ▼
   Deterministic CCTV Preprocessor
   [Grayscale → 64px Upscale → CLAHE Contrast → Otsu Binarization → Border Rim Clearing]
               │
               ▼
   OCR Engine (Tesseract 5 LSTM, CPU-First)
               │
               ▼
   Raw Text Extraction & LSTM Confidence
               │
               ▼
   Deterministic Indian Plate Normalizer
   - Alphanumeric sanitization & uppercase conversion
   - Format validation signal (Standard State & Bharat Series)
               │
               ▼
   Structured DetectionResult + OCRResult (In-Memory Only)
   - Vehicle Bounding Boxes & Confidence
   - Plate Bounding Boxes & Confidence
   - Raw Text, Normalized Text, Confidence, Format Valid Signal
   - Inference Latency Telemetry & Heartbeats
               │
               ▼
             STOP (Phase 3D Boundary)
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
- **OCR Engine**: Tesseract 5 (LSTM) via `pytesseract==0.3.13` (CPU-first, 15–35 ms/crop)
- **Crop Persistence**: None (Transient in-memory slicing from raw frame; discarded immediately after OCR)
- **Resilience**: Per-camera daemon threads; OCR or inference failures on one stream never crash or block others.

---

## Model Architecture & Licensing

### 1. OCR Engine: Tesseract 5 (LSTM) & Traineddata Model

- **Package Dependency**: `tesseract-ocr` and `tesseract-ocr-eng` (v5.5.0, Debian Bookworm package), `pytesseract==0.3.13`
- **Tesseract Software License**: **Apache License 2.0**
- **OCR Model / Weights**: LSTM Neural Network English Language Model (`eng.traineddata`, ~23.4 MB, Debian package `tesseract-ocr-eng`)
- **Traineddata Model License**: **Apache License 2.0** (packaged under Debian main)
- **Source**: Official Debian Linux repository / Google Tesseract OCR open-source project (`https://github.com/tesseract-ocr/tessdata_fast`)
- **Model Acquisition**: Baked into Docker image build via system package manager (`apt-get install -y tesseract-ocr tesseract-ocr-eng`). Zero network calls at runtime.
- **CPU Suitability**: Optimized C++ LSTM engine running locally on CPU in ~60–70 ms without requiring CUDA or heavy GPU drivers.
- **PoC Usage Interpretation**: The selected Tesseract components are documented as Apache-2.0 licensed. This appears suitable for PoC/hackathon evaluation subject to applicable license terms.
- **Production Deployment Consideration**: Production/government deployment should undergo the organization's normal open-source license, attribution, procurement, and legal review. This documentation does not provide legal clearance, procurement approval, or guarantees of commercial fitness.
- **Limitation for Indian Plates**: Tesseract's standard `eng.traineddata` model is trained on standard Latin typography rather than specific High Security Registration Plate (HSRP) fonts (e.g., DIN 1451 Mittelschrift variations used in India). To maximize accuracy without mutating characters, our deterministic preprocessor upscales crops to 64px height, standardizes polarity, removes outer border rims, and runs single-line page segmentation (`--psm 7`).

### 2. Vehicle Detector: Ultralytics YOLOv8n

- **Package Dependency**: `ultralytics` (pinned: `==8.4.145`)
- **Model Weights**: YOLOv8 Nano (`yolov8n.pt`, v8.3.0 release asset, 6,549,796 bytes)
- **Model URL**: `https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt`
- **SHA-256 Checksum**: `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`
- **Model License**: GNU Affero General Public License v3.0 (AGPL-3.0) / Commercial Enterprise License
- **PoC Suitability**: Fully suitable for non-commercial academic research, hackathon PoC evaluation, and architectural demonstration.
- **Production Clearance Warning**: Production deployment for the Gujarat Police state-wide platform requires formal licensing review. If the software is distributed or provided over a network as a service under government procurement, an Ultralytics Commercial Enterprise license or migration to a permissively-licensed model (e.g., Apache-2.0 YOLOv10, RT-DETR, or ONNX runtime export) must be completed. Production licensing is NOT cleared at PoC stage.

---

## Plate Crop Preparation & Deterministic Preprocessing

To preserve architectural purity, **no image crop bytes exist in the `DetectionResult` or `DetectedPlate` domain contracts**.

Instead:
1. When a plate is detected, `prepare_plate_crop()` safely clips `DetectedPlate.bbox` against the original frame dimensions `(frame_width, frame_height)`.
2. Validates crop dimensions against minimum operational thresholds (`min_width=32`, `min_height=12`, max aspect ratio 8.0).
3. The transient crop is preprocessed via `preprocess_plate_crop()`:
   - **Grayscale Conversion**: Eliminates color chromatic noise.
   - **Aspect-Preserving Upscale**: Scales height to 64px using cubic interpolation (`cv2.INTER_CUBIC`) for optimal character stroke thickness.
   - **Contrast Normalization**: Applies Contrast Limited Adaptive Histogram Equalization (`CLAHE`, clip limit 2.5, tile grid 8x8) to handle uneven CCTV street lighting.
   - **Otsu Binarization**: Computes optimal binarization threshold separating plate text from background.
   - **Polarity Standardizer**: Ensures dark text on bright background (standard Indian white/yellow plates).
   - **Border Rim Clearing**: Blanks out the outer 4-pixel border margin, preventing the black plate frame from being misinterpreted as the letter `I` or digit `1`.
4. After OCR inference completes, the crop matrix is immediately garbage-collected in memory. **Zero disk or MinIO writes occur.**

---

## Indian License Plate Normalization

The normalization pipeline is strictly deterministic, matching the backend normalization logic (`backend/src/modules/vehicles/utils/plate-normalizer.ts`).

### Rules:
1. Converts all alphabetic characters to uppercase (`upper()`).
2. Strips all non-alphanumeric characters, including spaces, hyphens, dots, underscores, and punctuation (`re.sub(r'[^a-zA-Z0-9]', '', s)`).
3. Strips optional leading Indian national identifier prefix `"IND"` only when followed by a valid state code.
4. **Never silently performs aggressive character mutations** (e.g., `O -> 0`, `I -> 1`, `B -> 8`) because license plate context without unambiguous position information introduces silent falsification.
5. Preserves uncertainty over guessing.

### Concrete Examples:
| Input Raw Text | Normalized Text | Format Valid Signal | Note |
|---|---|---|---|
| `"gj 01 ab 1234"` | `"GJ01AB1234"` | `True` | Standard Gujarat RTO plate |
| `"GJ-01-AB-1234"` | `"GJ01AB1234"` | `True` | Hyphen-separated format |
| `"ind GJ01AB1234"` | `"GJ01AB1234"` | `True` | Leading IND stamp removed |
| `"22BH1234AB"` | `"22BH1234AB"` | `True` | Bharat Series format |
| `"MH 12 CD 5678"` | `"MH12CD5678"` | `True` | Maharashtra RTO plate |
| `"GJ01A123"` | `"GJ01A123"` | `False` | Incomplete number (preserved, not mutated) |
| `"ABC!@#123"` | `"ABC123"` | `False` | Alphanumerics retained, format flag false |

---

## Format Validation Diagnostic Signal

The platform implements a conservative format check (`is_valid_indian_plate_format`) as an **independent diagnostic signal**, NOT a transformation filter:
- Standard Indian Format: `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$` (2-letter state code, 1-2 digit RTO code, 0-3 letter series, 4-digit registration number).
- Bharat Series Format: `^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$` (2-digit registration year, BH code, 4-digit number, 1-2 letter series).

> [!CAUTION]
> The format validation flag does **not** alter the OCR confidence and does **not** reject plates. An unusual or non-standard government/military plate may have `format_valid = False` while retaining high OCR confidence.

---

## OCR Result Contract

```python
@dataclass(slots=True)
class OCRResult:
    plate_id: str
    raw_text: str                          # Unmodified text as returned by OCR engine
    normalized_text: str                   # Deterministically cleaned alphanumeric string
    confidence: Optional[float] = None     # Tesseract-reported OCR confidence [0.0, 1.0]
    confidence_available: bool = False     # Whether the engine provided true confidence
    format_valid: bool = False             # Independent diagnostic format check
    engine: str = "TESSERACT_OCR"          # Engine identifier
    processing_latency_ms: float = 0.0     # Time taken for preprocessing + OCR
    preprocessing_variant: str = "clahe_otsu"
    success: bool = True
    error_code: Optional[str] = None
    error_message: Optional[str] = None
```

### Confidence Semantics:
- **What Confidence MEANS**: Aggregate OCR confidence is calculated from the word-level confidence values returned by Tesseract's `image_to_data` output for recognized tokens/words, normalized to the `[0.0, 1.0]` range.
- **What Confidence DOES NOT Mean**:
  - It does NOT represent format validity or regex compliance (format validity is a separate diagnostic signal).
  - It does NOT measure watchlist match probability.
  - It does NOT represent multi-frame consensus certainty (Phase 3E).
  - It is NOT synthesized or inferred from string length or dictionary matches. If confidence is unavailable, `confidence = None` and `confidence_available = False`.

---

## Failure Handling & Error Codes

OCR failures are isolated and will never crash or halt the pipeline. Structured error codes include:

| Error Code | Trigger Condition | System Action |
|---|---|---|
| `EMPTY_PLATE_CROP` | Bounding box cropped region is empty or has 0 bytes | Emits failed `OCRResult`, proceeds to next detection |
| `INVALID_PLATE_BBOX` | Bounding box dimensions outside frame bounds | Emits failed `OCRResult`, logs debug warning |
| `PLATE_CROP_TOO_SMALL` | Crop width < 32px or height < 12px | Skips unreadable crop safely |
| `OCR_ENGINE_UNAVAILABLE` | OCR engine binary or weights missing | Sets `is_ready() = False`, pipeline continues in detection-only mode |
| `OCR_EXCEPTION` | Unhandled exception inside OCR driver | Catches exception, logs stack trace, returns `OCRResult` with error details |
| `NO_TEXT_DETECTED` | OCR output is whitespace or empty | Emits failed `OCRResult(success=False)` |
| `LOW_CONFIDENCE` | OCR confidence below `OCR_MIN_CONFIDENCE` threshold | Result marked `success=False`, gated from downstream processing |

---

## Measured Performance Benchmarks

Benchmarked on CPU (`x86_64`) within the containerized Python 3.11 environment:

### 1. Phase 3D OCR-Only Latency Benchmark (Tesseract 5 LSTM on CPU)

| Metric | Measured Value | Operational Context |
|---|---|---|
| **Input Type** | Preprocessed Plate Crop (240x60) | Standard vehicle plate crop |
| **OCR Engine** | Tesseract 5 (LSTM) via `pytesseract` | Single text-line segmentation (`--psm 7`) |
| **Total Iterations Tested** | 25 plate crops | Controlled fixture execution |
| **Cold-Start Latency (Crop 1)** | **68.43 ms** | First-crop process initialization |
| **Warmed-Up Min** | 60.30 ms | Peak individual crop latency |
| **Warmed-Up p50 (Median)** | **63.66 ms** | Steady-state median latency |
| **Warmed-Up p90** | 78.19 ms | 90th percentile latency |
| **Warmed-Up p99** | 88.62 ms | 99th percentile latency |
| **Warmed-Up Max** | 91.61 ms | Worst-case crop latency |
| **Warmed-Up Average** | **67.39 ms** | **Steady-state average per plate** |
| **Warmed-Up Throughput** | **14.8 plates/second** | Per CPU core |

> [!NOTE]
> **Controlled Fixture Disclaimer**:
> Controlled OCR fixtures validate OCR component mechanics and do not represent government CCTV accuracy.

### 2. Phase 3C Detection Benchmark (YOLOv8n on 1280x720 Fixtures)

| Metric | CAM-AHM-01 | CAM-AHM-02 | Notes |
|---|---|---|---|
| **Cold-Start Latency (Frame 1)** | 920.50 ms | 67.09 ms | PyTorch graph allocation |
| **Warmed-Up p50 Latency** | 22.94 ms | 23.57 ms | Steady-state median |
| **Warmed-Up Average Latency** | **24.40 ms** | **24.74 ms** | ~41 FPS throughput |
| **Vehicles Detected** | 0 (Ground truth) | 0 (Ground truth) | Synthetic countdown patterns |
| **Plates Localized** | 0 (Ground truth) | 0 (Ground truth) | Accurate ground truth |

> [!NOTE]
> **Video Fixture Disclaimer**:
> Current CCTV fixtures are synthetic countdown patterns and contain no genuine vehicles or license plates; therefore they do not establish real-world ANPR accuracy.

### 3. Estimated Component-Sum Latency (Not a Measured End-to-End Benchmark)

| Component Stage | Measured Benchmark Latency | Benchmark Context |
|---|---|---|
| Vehicle Detection + Plate Localization | ~24.4 ms (Warmed-up Avg) | Measured on 1280x720 video fixtures (CPU) |
| OCR Preprocessing + Character Recognition | ~67.4 ms (Warmed-up Avg) | Measured on 240x60 synthetic plate crops (CPU) |
| **Estimated Component-Sum Latency** | **~91.8 ms** | **Theoretical sequential sum (~10.9 FPS theoretical max)** |

> [!IMPORTANT]
> **Latency & Fixture Disclaimers**:
> 1. **Not a Measured End-to-End Benchmark**: The ~91.8 ms figure is strictly an arithmetic sum of two independently measured component benchmarks. It does **not** represent a measured end-to-end benchmark on live vehicles.
> 2. **Not an Accuracy Benchmark**: The component benchmark measures processing execution time only and does not establish statewide ANPR accuracy.
> 3. **Sequential Assumption**: This estimate assumes sequential, single-core processing per plate without parallelism.
> 4. **No Vehicles in Current CCTV Fixtures**: Current Phase 3A deterministic CCTV video fixtures (`cam-ahm-01.mp4`, `cam-ahm-02.mp4`) are synthetic countdown test patterns containing **zero genuine vehicles and zero license plates**.
> 5. **Future Verification Requirement**: Real end-to-end performance and accuracy with actual vehicle/plate crops must be measured using an appropriate controlled real/licensed fixture in a later validation step.

---

## Running Verification Suites

```bash
# Run all 53 AI worker unit, fixture, and contract tests:
docker compose run --rm ai-worker pytest -v tests/

# Run performance benchmarks:
docker compose run --rm ai-worker pytest -s tests/test_fixture_benchmark.py

# Backend verification:
cd backend
npm run build
npm run test:e2e       # 97/97 E2E tests
npm run db:verify      # 11/11 DB verification checks
```
