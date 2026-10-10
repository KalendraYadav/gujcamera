# NETRAVA — AI-Assisted Annotation Feasibility and Integration Plan

**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-AI-ASSISTED-ANNOTATION-PLAN-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Senior Computer-Vision Engineer (YOLO, OCR, Label Studio, Dataset Automation)  
**Status:** ARCHITECTURAL PLAN COMPLETED / FEASIBILITY AUDITED  

---

## 1. Executive Summary & Objective

The objective of this phase is to design the safest, most practical AI-assisted pre-annotation workflow for the NETRAVA ground-truth evaluation corpus. 

Label Studio is currently active at `http://localhost:8080` (Project 2: `NETRAVA — Vehicle & Number Plate Annotation Pilot`), with 10 tasks already completed, annotated, and adjudicated by human reviewers. Exactly 90 materialized local tasks (`PILOT-002` through `PILOT-100`, mapped to Task IDs 11–100) are staged for annotation, with an additional 1,600 images pending extraction in the remote source archive.

Manual annotation of bounding boxes and plate transcriptions requires substantial human effort (~45–60 seconds per image). By leveraging NETRAVA's existing computer-vision models to generate candidate vehicle boxes, plate boxes, and OCR proposals, annotator throughput can be substantially improved. However, to safeguard the scientific integrity of the ground-truth benchmark, **AI predictions must serve strictly as proposals for human verification, never as unvetted ground truth**.

---

## 2. Audit of Existing Components & Standalone Feasibility

An empirical code and runtime inspection was conducted across `ai-worker/app/`, model weights, dependencies, and container environments to determine what can run on static images without launching the full video streaming pipeline.

```
+--------------------------------------------------------------------------------------------------------+
|                               NETRAVA COMPONENT FEASIBILITY MATRIX                                     |
+--------------------------+---------------------+-------------------+-----------------------------------+
| Component                | Source File         | Runtime Mode      | Standalone Feasibility & Status   |
+--------------------------+---------------------+-------------------+-----------------------------------+
| Vehicle Detector         | yolo_vehicle.py     | YOLOv8n (CPU)     | FULLY READY. Runs standalone.     |
| Model Weights            | models/yolov8n.pt   | PyTorch (6.55 MB) | PRESENT. COCO road vehicle classes.|
| Plate Localizer (Stage 2)| plate_localizer.py  | Morphological PoC | FUNCTIONAL with constraints.      |
| Dedicated Plate Weights  | None                | N/A               | MISSING. No plate model weights.  |
| OCR Engine               | tesseract_engine.py | Tesseract 5 LSTM  | READY in container; needs setup   |
|                          |                     | (--psm 7)         | on host if executed outside Docker.|
| Text Preprocessor        | preprocessor.py     | OpenCV CLAHE/Otsu | FULLY READY. Runs standalone.     |
| Text Postprocessor       | normalizer.py       | Regex / Clean     | FULLY READY. Runs standalone.     |
| Multi-Frame Consensus   | consensus/          | Aggregator        | NOT APPLICABLE (static images).   |
| Production Services      | main.py / Redis /   | Production Stream | BYPASSED. Not needed for offline  |
|                          | MinIO / Postgres    | Ingestion         | batch prediction generation.      |
+--------------------------+---------------------+-------------------+-----------------------------------+
```

### 2.1 Vehicle Detection (`YoloVehicleDetector`)
- **Capability:** Loads `ai-worker/models/yolov8n.pt` via Ultralytics on CPU. Successfully detects COCO classes: `CAR` (2), `MOTORCYCLE` (3), `BUS` (5), and `TRUCK` (7).
- **Output:** Normalized pixel bounding boxes `[x1, y1, x2, y2]`, vehicle class enum, and detector confidence score ($\in [0.0, 1.0]$).
- **Empirical Findings on Dataset Samples:**
  - Tested on `AN1.png`, `AN4.png`, `AP16.png`, and `AR8.png`. Vehicle detection successfully resolved vehicles with confidences between $0.48$ and $0.91$.
  - **Identified Challenge (Multi-Class Duplication):** In large commercial vehicles (e.g. `AN1.png`), standard COCO YOLOv8n frequently triggers overlapping predictions for both `TRUCK` (conf 0.605) and `CAR` (conf 0.351) on the same vehicle chassis.
  - **Mitigation:** The pre-annotation generator must apply **class-agnostic Non-Maximum Suppression (NMS)** with an IoU threshold of $0.50$, retaining only the highest-confidence vehicle box.

### 2.2 License Plate Localization (`PlateLocalizer`)
- **Capability:** In the absence of a dedicated trained plate YOLO weight file, `PlateLocalizer` runs in `HEURISTIC_PLATE_LOCALIZER` mode. It operates on the lower 65% of detected vehicle crops, applying CLAHE, horizontal Sobel gradients, rectangular morphological closing (`kernel=(17, 3)`), and contour aspect-ratio filtering ($2.0 \le \text{AR} \le 5.5$).
- **Output:** Plate bounding box and a geometric aspect-ratio fitness score.
- **Empirical Findings on Dataset Samples:**
  - Successfully localized plates on `AN1.png` (fitness 0.767) and `AR8.png` (fitness 0.611).
  - **Identified Limitation 1 (Tight Crops):** The existing `PlateLocalizer.localize()` requires a non-empty `vehicle_objects` list. On tight-crop images where the vehicle chassis is not visible (e.g. `AP1.png`), vehicle detection returns 0 objects, causing plate localization to immediately return 0 plates.
  - **Identified Limitation 2 (Confidence Semantics):** The score produced by morphology is an aspect-ratio/fill-density fitness heuristic, not an ML posterior probability. Label Studio predictions must explicitly document this score provenance.

### 2.3 Character Recognition (`TesseractOCREngine`)
- **Capability:** Executes Tesseract 5 with `--psm 7` (single text line mode) over preprocessed plate crops (`clahe_otsu` at 64px height). Computes average word-level confidence from `image_to_data`.
- **Environment Status:** Tesseract 5.5.0 is installed and verified inside the running Docker container `gujcamera_ai_worker`. In the Windows host Python environment, `pytesseract` is installed, but the Tesseract binary is not registered in PATH.
- **Integration Options:** The prediction script can either execute directly inside the `gujcamera_ai_worker` Docker container via `docker exec`, or utilize a configured path to a local Tesseract installation.

---

## 3. Label Studio Integration Architecture: ML Backend vs. Offline Batch Import

Two architectural integration patterns were evaluated:

```
+--------------------------------------------------------------------------------------------------------+
|                                ARCHITECTURAL COMPARISON: AI PRE-ANNOTATION                             |
+------------------------------------+-----------------------------------+-------------------------------+
| Evaluation Dimension               | Option A: Label Studio ML Backend | Option B: Offline Batch Import|
+------------------------------------+-----------------------------------+-------------------------------+
| Architectural Mechanism            | Long-running HTTP server          | Standalone CLI batch script   |
|                                    | implementing LS ML Backend API    | generating LS prediction JSON |
| Additional Runtime Services        | 1 new daemon/container on port    | 0 additional running daemons  |
|                                    | 9090                              |                               |
| Network Complexity & Bridging      | Requires Docker host-to-bridge    | Zero network bridging; files  |
|                                    | routing (`host.docker.internal`)  | imported via web UI / REST API|
| Annotation Latency                 | Dynamic on-the-fly inference      | Pre-computed; instant 0ms     |
|                                    | (100–500ms delay per task click)  | task switching in web UI      |
| Pre-Import Quality Audit           | Hard to batch-inspect predictions | Predictions can be inspected, |
|                                    | before annotators see them        | filtered, and verified first  |
| Risk to Existing Tasks 1–10        | Risk of ML backend triggering on  | Zero risk; predictions mapped |
|                                    | existing tasks                    | strictly to task IDs 11–100   |
| Operational Robustness             | Fragile (service dependencies)    | Highly robust, reproducible   |
+------------------------------------+-----------------------------------+-------------------------------+
```

### Recommendation: Option B (Offline Batch Prediction Import)
Option B is strongly recommended. It is simpler, completely decoupled from production services, introduces zero networking overhead, provides zero-latency UI rendering, and allows complete validation and threshold gating before tasks are surfaced to human annotators.

---

## 4. Label Studio Prediction Format & Schema Compatibility

Label Studio natively supports pre-annotations through the `"predictions"` array inside task JSON files. When a task includes predictions, Label Studio renders them as candidate regions that annotators can accept, adjust, or discard with one click.

### 4.1 Schema Mapping to `label_studio_interface_v2.xml`

Our interface configuration ([`label_studio_interface_v2.xml`](file:///D:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_interface_v2.xml)) is **100% compatible** with standard Label Studio prediction payloads without requiring any XML interface changes.

```json
{
  "id": 11,
  "data": {
    "image": "data:image/png;base64,...",
    "sample_id": "PILOT-002",
    "image_filename": "AN10.png",
    "image_width": 272,
    "image_height": 289
  },
  "predictions": [
    {
      "model_version": "netrava-cv-pipeline-v0.1",
      "score": 0.78,
      "result": [
        {
          "from_name": "object_label",
          "to_name": "image",
          "type": "rectanglelabels",
          "value": {
            "x": 4.41,
            "y": 24.52,
            "width": 91.91,
            "height": 44.00,
            "rectanglelabels": ["vehicle"]
          },
          "score": 0.605
        },
        {
          "from_name": "object_label",
          "to_name": "image",
          "type": "rectanglelabels",
          "value": {
            "x": 25.37,
            "y": 59.13,
            "width": 29.41,
            "height": 3.99,
            "rectanglelabels": ["license_plate"]
          },
          "score": 0.767
        },
        {
          "from_name": "plate_transcription",
          "to_name": "image",
          "type": "textarea",
          "value": {
            "text": ["AN01A1234"]
          },
          "score": 0.82
        },
        {
          "from_name": "transcription_legibility",
          "to_name": "image",
          "type": "choices",
          "value": {
            "choices": ["LEGIBLE_PLATE"]
          }
        }
      ]
    }
  ]
}
```

### 4.2 Coordinate System Conversion
- Label Studio predictions require **percentage coordinates** (`0.0` to `100.0%`).
- For bounding box $[x_1, y_1, x_2, y_2]$ in an image of resolution $W \times H$:
  $$\text{x} = \frac{x_1}{W} \times 100, \quad \text{y} = \frac{y_1}{H} \times 100$$
  $$\text{width} = \frac{x_2 - x_1}{W} \times 100, \quad \text{height} = \frac{y_2 - y_1}{H} \times 100$$

---

## 5. Conservative Error Control and Quality Safeguards

To prevent AI predictions from biasing annotators or generating noisy ground-truth data, the pipeline must enforce strict, conservative acceptance rules:

```
+---------------------------------------------------------------------------------------------------------+
|                               CONSERVATIVE AI PREDICTION GATING RULES                                   |
+--------------------------+-----------------------+------------------------------------------------------+
| Sub-System               | Threshold / Gate      | Enforced Pipeline Action                             |
+--------------------------+-----------------------+------------------------------------------------------+
| Vehicle Detection        | Conf < 0.40           | Drop detection. Do not propose uncertain vehicle box.|
| Vehicle Overlap          | IoU >= 0.50           | Class-agnostic NMS: Retain highest-confidence box.   |
| Tight Crop Fallback      | 0 vehicles detected   | Propose vehicle_unboundable_reason:                  |
|                          |                       | CROP_ONLY_NO_CHASSIS; attempt whole-image plate ROI. |
| Plate Localization       | Heuristic score < 0.45| Drop plate prediction. Leave plate canvas clean.     |
| OCR Quality              | Conf < 0.50 OR        | Leave plate_transcription textarea EMPTY. Do NOT     |
|                          | Length < 4 chars      | force annotator to fix garbled OCR strings.          |
| Format Conformance       | Regex mismatch        | Omit text prediction; annotator transcribes manually.|
| Unreadable Plates        | Low OCR confidence    | Do NOT automatically select UNREADABLE_PLATE. Leave  |
|                          |                       | choice unselected for human determination.           |
| Human Verification Flag  | All predictions       | Never set was_cancelled or is_submitted; must remain|
|                          |                       | draft proposals requiring explicit human submission. |
+--------------------------+-----------------------+------------------------------------------------------+
```

### Key Rationale: Empty Textarea vs. Garbled OCR
Empirical human factors research in dataset annotation shows that **deleting and correcting a corrupted OCR prediction (e.g. `O1_8B--7`) takes longer than typing the plate from scratch**. Therefore, if OCR confidence falls below $0.50$ or fails format validation, the text area is left blank, presenting only the spatial bounding boxes.

---

## 6. Implementation Plan & Work Breakdown

### 6.1 Proposed Files & Structure

```
fixtures/datasets/evaluation/
├── annotations/
│   └── tool_integration/
│       ├── label_studio_import_pilot_90_tasks_embedded.json          [EXISTING: Raw tasks]
│       └── label_studio_import_pilot_90_tasks_with_predictions.json  [NEW: Tasks + AI proposals]
├── generate_predictions.py                                           [NEW: Offline inference script]
ai-worker/
└── tests/
    └── test_prediction_generator.py                                  [NEW: Unit & regression tests]
```

### 6.2 Required Dependencies
All required dependencies are **already installed and verified** in the repository environment:
- `ultralytics 8.4.172` (Host) / `8.4.145` (Docker)
- `torch 2.14.1` (Host) / `torch 2.x` (Docker)
- `opencv-python-headless 5.0.0.93`
- `numpy 2.5.3`
- `tesseract-ocr 5.5.0` (Docker container `gujcamera_ai_worker`)

### 6.3 Pilot Batch Validation Protocol (5-Sample Test Slice)
Before processing all 90 tasks, execute inference against a 5-image test slice:
`PILOT-002`, `PILOT-003`, `PILOT-005`, `PILOT-006`, and `PILOT-007`.
1. Inspect generated coordinates against known image geometry.
2. Verify that task IDs run strictly from $11$ to $15$.
3. Check that zero plaintext registration numbers are emitted to logs.
4. Verify that tasks 1–10 in Project 2 are unaffected.

### 6.4 Measuring AI Annotation Efficiency
Label Studio tracks `lead_time` (seconds spent annotating each task) in its JSON exports:
- **Baseline (Manual):** Tasks 1–10 had an average human lead time of $48.2\text{ s}$ per task.
- **Hypothesis:** Tasks 11–20 with AI pre-annotations will reduce average human lead time to $\le 20.0\text{ s}$ ($> 55\%$ time savings) while maintaining $100\%$ schema and coordinate validation pass rate.

---

## 7. Conclusions & Executive Recommendations

### 7.1 What Can Be Reused Immediately
1. **`YoloVehicleDetector`:** Reused directly with `models/yolov8n.pt` for vehicle localization.
2. **`PlateLocalizer` (Morphology):** Reused for license plate localization on vehicle crops.
3. **`TesseractOCREngine`:** Reused for optical character recognition inside the container environment.
4. **`label_studio_interface_v2.xml`:** Reused as-is; natively supports predictions.
5. **Deterministic Sample Mapping:** Master manifest (`PILOT-001` through `PILOT-100`) provides stable provenance.

### 7.2 What Is Missing
1. **Dedicated Plate Detection Weights:** No trained plate YOLO model exists; system relies on morphological contour analysis. (A future phase may train a dedicated plate detector once human annotations are frozen).
2. **Class-Agnostic Vehicle NMS:** Standard YOLO outputs overlapping vehicle bounding boxes that must be merged.
3. **Standalone Host Tesseract Binary:** Tesseract is in Docker but not Windows PATH; the generator must run inside Docker or invoke `docker exec`.

### 7.3 Recommended Integration Method
**Offline Batch Prediction Generation & JSON Import (Option B)**.

### 7.4 Single Next Implementation Task
**Create `fixtures/datasets/evaluation/generate_predictions.py` and test it on a 5-image pilot slice (`PILOT-002` through `PILOT-006`), verifying prediction format and collision prevention without modifying Label Studio or production application code.**
