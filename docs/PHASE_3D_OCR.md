# Phase 3D Architecture & Technical Specification: Indian License Plate OCR & Text Normalization
**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**

## 1. Phase 3D Objective & Scope Boundaries

Phase 3D implements optical character recognition (OCR) and deterministic plate text normalization on cropped vehicle license plates localized during Phase 3C.

### Scope Boundary Enforcement:
- **Phase 3D Implements**:
  - In-memory crop preparation from original frame and `DetectedPlate.bbox`
  - Deterministic CCTV contrast, binarization, and border-clearing preprocessing
  - OCR engine abstraction and Tesseract 5 LSTM CPU-first implementation
  - Deterministic Indian license plate normalization (matching backend utils)
  - Diagnostic format validation signal for standard and Bharat series
  - Structured in-memory `OCRResult` contracts
  - Comprehensive unit, fixture, and latency benchmark tests
- **Strictly NOT Implemented (Deferred to Later Phases)**:
  - Multi-frame temporal consensus / voting (Phase 3E)
  - Redis / Redis Streams sighting event publication (Phase 3F)
  - Database persistence (`VehicleSighting`, `PlateDetection`, Prisma migrations)
  - Watchlist matching and automated alerting
  - MinIO evidence vaulting and SHA-256 evidence hashing (Phase 3F)
  - Frontend display or WebSocket streaming

---

## 2. OCR Engine Selection & Trade-Off Analysis

For the PoC requirements of the Gujarat Police Innovation Challenge, three primary OCR candidates were evaluated:

| Engine | Model / Backend | License | Dependencies / Image Size | CPU Latency / Throughput | Verdict |
|---|---|---|---|---|---|
| **PaddleOCR** | PP-OCRv4 | Apache-2.0 | Heavy (`paddlepaddle` ~500MB, PyTorch conflict risks) | ~120–250 ms on CPU | Rejected for PoC due to heavy runtime footprint |
| **EasyOCR** | PyTorch + CRAFT + ResNet | Apache-2.0 | Medium (CRAFT text detector + CRNN recognizer) | ~400–850 ms on CPU | Rejected due to high latency exceeding 3-5 FPS budget |
| **Tesseract 5** | C++ LSTM Engine | **Apache-2.0** | **Minimal (~25MB system package)** | **~60–70 ms on CPU** | **SELECTED** |

### Selected OCR Solution & Licensing Details:
- **System Package**: `tesseract-ocr`, `tesseract-ocr-eng` (v5.5.0, Debian 13 Bookworm)
- **Python Wrapper**: `pytesseract==0.3.13`
- **Tesseract Software License**: **Apache License 2.0**
- **OCR Model / Weights**: LSTM Neural Network English Language Model (`eng.traineddata`, ~23.4 MB, Debian package `tesseract-ocr-eng`)
- **Traineddata Model License**: **Apache License 2.0** (packaged under Debian main)
- **Source**: Official Debian Linux repository / Google Tesseract OCR open-source project (`https://github.com/tesseract-ocr/tessdata_fast`)
- **Model Acquisition**: Baked into Docker image build via system package manager (`apt-get install -y tesseract-ocr tesseract-ocr-eng`). Zero network calls at runtime.
- **CPU Suitability**: Optimized C++ LSTM engine running locally on CPU in ~60–70 ms without requiring CUDA or heavy GPU drivers.
- **PoC Usage Interpretation**: The selected Tesseract components are documented as Apache-2.0 licensed. This appears suitable for PoC/hackathon evaluation subject to applicable license terms.
- **Production Deployment Consideration**: Production/government deployment should undergo the organization's normal open-source license, attribution, procurement, and legal review. This documentation does not provide legal clearance, procurement approval, or guarantees of commercial fitness.
- **Limitation for Indian Plates**: Tesseract's standard `eng.traineddata` model is trained on standard Latin book/document typography rather than specific High Security Registration Plate (HSRP) fonts (e.g., DIN 1451 Mittelschrift variations used in India). To maximize accuracy without mutating characters, our deterministic preprocessor upscales crops to 64px height, standardizes polarity, removes outer border rims, and runs single-line page segmentation (`--psm 7`).

---

## 3. Transient Plate Crop & Preprocessing Pipeline

### Domain Cleanliness (Zero Image Leaks)
In adherence to Phase 3C architecture, neither `DetectedPlate` nor `DetectionResult` stores raw image bytes. When a vehicle license plate is localized:
1. `prepare_plate_crop()` safely clips `DetectedPlate.bbox` against the original frame bounds.
2. Checks minimum size thresholds (`min_width=32`, `min_height=12`, max aspect ratio 8.0).
3. Crops the transient bounding box directly from the OpenCV frame array.
4. Passes the crop to `preprocess_plate_crop()`:
   - **Grayscale**: Eliminates chromatic noise.
   - **Aspect-Preserving Upscale**: Target height 64px via cubic interpolation.
   - **CLAHE (Contrast Limited Adaptive Histogram Equalization)**: Normalizes shadows and glare common in CCTV feeds (clip limit 2.5, tile grid 8x8).
   - **Otsu Binarization**: Computes optimal global threshold separating text from background.
   - **Polarity Normalization**: Standardizes to dark characters on light background.
   - **Border Rim Clearing**: Zeros the outer 4-pixel margin, preventing black plate mounting rims from triggering false `I` or `1` glyph recognitions.
5. Immediately after OCR recognition finishes, the crop is garbage collected in RAM. Zero disk or MinIO writes occur.

---

## 4. Normalization Specification & Validation Signal

The normalization function (`normalize_license_plate`) mirrors backend rules (`backend/src/modules/vehicles/utils/plate-normalizer.ts`):

1. **Formatting Sanitization**:
   - Strips non-alphanumerics (`re.sub(r'[^a-zA-Z0-9]', '', text)`).
   - Converts to uppercase.
   - Strips leading `"IND"` prefix when immediately followed by a 2-letter state code.
2. **Conservative Transformation**:
   - **Never mutates characters** (no `O -> 0`, `I -> 1`, `B -> 8` guessing).
   - Preserves uncertainty.
3. **Format Validation Diagnostic Signal**:
   - Evaluated separately via `is_valid_indian_plate_format`.
   - Checks Standard Indian format (`^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`) and Bharat series (`^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$`).
   - Does **not** reject plates and does **not** alter confidence scores.

---

## 5. Structured OCR Contract

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

### Error Codes:
- `EMPTY_PLATE_CROP`
- `INVALID_PLATE_BBOX`
- `PLATE_CROP_TOO_SMALL`
- `OCR_ENGINE_UNAVAILABLE`
- `OCR_EXCEPTION`
- `NO_TEXT_DETECTED`
- `LOW_CONFIDENCE`

---

## 6. Performance Benchmark Summary

Measured inside the Docker container on CPU (`x86_64`):

### 1. Phase 3D OCR-Only Latency Benchmark (Tesseract 5 LSTM on CPU)
- **Input Type**: Preprocessed License Plate Crop (240x60)
- **Iterations Tested**: 25 crops
- **Cold-Start Latency (Crop 1)**: **68.43 ms**
- **Warmed-Up Steady-State Latency (Crops 2..25)**:
  - Min: 60.30 ms
  - p50: 63.66 ms
  - p90: 78.19 ms
  - p99: 88.62 ms
  - Max: 91.61 ms
  - Average: 67.39 ms (~14.8 crops/sec per core)

> [!NOTE]
> **Controlled Fixture Disclaimer**:
> Controlled OCR fixtures validate OCR component mechanics and do not represent government CCTV accuracy.

### 2. Phase 3C Detection Benchmark (YOLOv8n on 1280x720 Fixtures)
- **Input**: 1280x720 video fixtures (`cam-ahm-01.mp4`, `cam-ahm-02.mp4`)
- **Plate Localizer Mode**: `HEURISTIC_PLATE_LOCALIZER`
- **Vehicles Detected**: 0 (Ground truth; synthetic countdown patterns contain no vehicles)
- **Plates Localized**: 0 (Ground truth)
- **Cold-Start Latency**: 920.50 ms (`CAM-AHM-01`), 67.09 ms (`CAM-AHM-02`)
- **Warmed-Up Steady-State Average**: **24.40 ms** (`CAM-AHM-01`), **24.74 ms** (`CAM-AHM-02`) (~41 FPS)

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
