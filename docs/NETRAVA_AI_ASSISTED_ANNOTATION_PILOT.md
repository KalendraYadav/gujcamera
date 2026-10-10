# NETRAVA — AI-Assisted Annotation: Five-Image Pilot Report

**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-AI-ASSISTED-ANNOTATION-PILOT-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Senior Computer-Vision Engineer  
**Status:** IMPLEMENTED & EMPIRICALLY AUDITED (5-TASK PILOT PACKAGE READY)  

---

## 1. Executive Summary & Objective

This report documents the implementation and empirical audit of offline AI-assisted annotation for an initial **5-image pilot slice** (`PILOT-002`, `PILOT-003`, `PILOT-005`, `PILOT-006`, and `PILOT-007`) before expanding to the 90-task batch or the full 1,700-image corpus.

The objective is to validate whether NETRAVA's existing computer-vision models (`YoloVehicleDetector`, `PlateLocalizer`, and `TesseractOCREngine`) can generate high-quality pre-annotation proposals (vehicle bounding boxes, license-plate bounding boxes, and candidate transcriptions) while adhering to strict, conservative quality gates:
1. **Zero Database or Production Service Coupling:** Inference executed purely on static images in offline batch mode.
2. **Duplicate Suppression:** Class-agnostic Non-Maximum Suppression (IoU $\ge 0.50$) eliminates overlapping multi-class vehicle detections while preserving the winning class and confidence.
3. **Conservative Plate Localization:** Heuristic fitness scores are treated as non-ML geometric fitness ($\ge 0.45$); uncertain plates are omitted rather than guessed.
4. **Conservative OCR Gating:** Plate transcriptions are suggested **only** when OCR confidence is $\ge 0.50$, character length is $\ge 4$, and normalized text matches valid Indian registration format regex (`is_valid_indian_plate_format`). All uncertain or garbled OCR text is rejected, leaving the text canvas empty.
5. **Zero Fabrication:** Neither bounding boxes nor human annotations are fabricated, and `UNREADABLE_PLATE` is never automatically selected based on low OCR confidence.
6. **Zero Task Collision:** Generated tasks run strictly from Task ID `11` to `15`, preserving existing tasks 1–10 in Project 2 untouched.

---

## 2. Implementation Artifacts Created

```
fixtures/datasets/evaluation/
├── generate_predictions.py                                           [NEW: Offline inference & NMS coordinator]
└── annotations/
    └── tool_integration/
        └── label_studio_import_pilot_5_tasks_with_predictions.json   [NEW: 5-task embedded package with AI proposals]
ai-worker/
└── tests/
    └── test_prediction_generator.py                                  [NEW: 12 unit & regression tests]
```

- **Inference Script:** [`fixtures/datasets/evaluation/generate_predictions.py`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/generate_predictions.py)
- **Output Task Package:** [`fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_5_tasks_with_predictions.json`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_5_tasks_with_predictions.json) ($1.01\text{ MB}$, embedded Base64 PNGs)
- **Test Suite:** [`ai-worker/tests/test_prediction_generator.py`](file:///d:/web%20project/gujcamera/ai-worker/tests/test_prediction_generator.py) (12 tests, 100% passing)

---

## 3. Empirical Results: Detections Per Image

The pipeline was executed against all 5 target images from `fixtures/datasets/evaluation/images/`.

| Task ID | Sample ID | Filename | Resolution | Vehicle Detections (Class / Conf / BBox) | NMS Action | Plate Localization (Fitness / BBox) | Raw OCR Read / Conf | OCR Gating Decision | Final LS Proposals |
| :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **11** | `PILOT-002` | `AN10.png` | $272 \times 363$ | 1. `CAR`: $0.745$, $[51, 44, 208, 202]$<br>2. `CAR`: $0.499$, $[0, 79, 17, 143]$ | Both retained (IoU $0.0$) | Localized ($0.515$ fitness)<br>$[124, 146, 149, 157]$ | Raw: `'af az'`<br>Conf: $0.197$ | **REJECTED**<br>(Conf $< 0.50$, Invalid format) | **3 Proposals**<br>(2 vehicles, 1 plate, 0 text) |
| **12** | `PILOT-003` | `AN2.png` | $271 \times 325$ | 1. `TRUCK`: $0.707$, $[70, 93, 223, 246]$ | Retained | Localized ($0.750$ fitness)<br>$[121, 223, 182, 238]$ | Raw: `'aWo104963'`<br>Conf: $0.000$ | **REJECTED**<br>(Conf $0.00$, Invalid format) | **2 Proposals**<br>(1 vehicle, 1 plate, 0 text) |
| **13** | `PILOT-005` | `AN5.png` | $272 \times 342$ | 1. `CAR`: $0.920$, $[99, 126, 264, 278]$ | Retained | None (0 candidates met geometric criteria) | Not executed (no plate crop) | **OMITTED**<br>(No plate localized) | **1 Proposal**<br>(1 vehicle, 0 plates, 0 text) |
| **14** | `PILOT-006` | `AN6.png` | $271 \times 306$ | 1. `CAR`: $0.866$, $[55, 88, 231, 267]$ | Retained | Localized ($0.645$ fitness)<br>$[97, 221, 206, 256]$ | Raw: `''` (empty)<br>Conf: None | **REJECTED**<br>(No text detected) | **2 Proposals**<br>(1 vehicle, 1 plate, 0 text) |
| **15** | `PILOT-007` | `AN7.png` | $272 \times 590$ | 1. `CAR`: $0.732$, $[0, 137, 256, 419]$ | Retained | Localized ($0.581$ fitness)<br>$[94, 313, 164, 338]$ | Raw: `'bee » had'`<br>Conf: $0.520$ | **REJECTED**<br>(Regex mismatch: `'BEEHAD'` not valid Indian plate) | **2 Proposals**<br>(1 vehicle, 1 plate, 0 text) |

---

## 4. Proposal Accounting & Quality Analysis

### 4.1 Vehicle Proposals
- **Total Vehicle Boxes Proposed:** **6 bounding boxes** across 5 images.
- **Precision Observations:**
  - In `PILOT-005`, `PILOT-006`, and `PILOT-007`, the primary vehicle chassis was detected with high confidence ($0.73$ to $0.92$).
  - In `PILOT-002`, two vehicles were detected: the prominent central car ($0.75$) and a secondary vehicle partially entering the left frame margin ($0.50$). Both boxes are spatially valid.
  - Class-agnostic NMS successfully eliminated spurious multi-class duplication.

### 4.2 Plate Proposals
- **Total Plate Boxes Proposed:** **4 bounding boxes** across 5 images.
- **Precision Observations:**
  - Plates were localized in `PILOT-002`, `PILOT-003`, `PILOT-006`, and `PILOT-007`.
  - In `PILOT-005`, the morphological detector found no candidate satisfying the aspect ratio and area threshold. The pipeline **cleanly omitted the plate proposal** rather than hallucinating a box.

### 4.3 OCR Suggestions (Accepted vs. Rejected)
- **Total OCR Text Candidates Proposed:** **0 / 5 (100% Rejected by Conservative Gating)**.
- **Breakdown of Rejections:**
  - 3 samples (`PILOT-002`, `PILOT-003`, `PILOT-006`) rejected due to low confidence ($< 0.50$) or empty reads.
  - 1 sample (`PILOT-007`) achieved raw OCR confidence $0.52$, but the string (`"BEEHAD"`) failed the statutory Indian plate format regex (`is_valid_indian_plate_format`).
  - 1 sample (`PILOT-005`) had no plate crop.
- **Impact on Annotator Experience:**
  - Because bad OCR text was suppressed, annotators will **not** have to waste time backspacing garbled characters. The `plate_transcription` text area remains blank, enabling clean, fast manual transcription.
  - In accordance with Requirement 6, `UNREADABLE_PLATE` was **never automatically checked**, ensuring legibility remains a human determination.

---

## 5. Automated Test Suite Results

Executed the full regression test suite (64 unit tests across 8 test suites):

```bash
python -m pytest ai-worker/tests/test_prediction_generator.py \
                 ai-worker/tests/test_complete_dataset_readiness.py \
                 ai-worker/tests/test_pilot_freeze.py \
                 ai-worker/tests/test_pilot_adjudication.py \
                 ai-worker/tests/test_pilot_quality_audit.py \
                 ai-worker/tests/test_tool_converter.py \
                 ai-worker/tests/test_annotation_validator.py \
                 ai-worker/tests/test_pilot_dataset_validator.py -v
```

### Test Breakdown
- `test_prediction_generator.py`: **12 / 12 PASSED**
  - Duplicate suppression via class-agnostic NMS (IoU 0.50) preserving winning class & conf.
  - Coordinate percentage conversion and boundary clamping ($0.0 \le x, y \le 100.0$, $x+w \le 100.0$).
  - Low-confidence vehicle and plate filtering.
  - OCR rejection for low confidence, short strings, and format mismatches.
  - High-confidence format validation acceptance.
  - Task count (5 tasks), task IDs (`11`–`15`), and sample IDs (`PILOT-002`, `003`, `005`, `006`, `007`).
  - Zero collision with existing tasks 1–10.
  - Strict preservation of prediction status (no synthetic human `annotations` or `is_submitted` flags).
  - Schema alignment with `label_studio_interface_v2.xml`.
- **Full Test Suite:** **64 / 64 PASSED in 0.41s (100% Green)**.

---

## 6. Readiness for Manual Inspection in Label Studio

The generated 5-task package:
[`fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_5_tasks_with_predictions.json`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_5_tasks_with_predictions.json)

**IS 100% READY FOR MANUAL INSPECTION IN LABEL STUDIO.**

### Verification Checklist
- [x] Embedded Base64 images eliminate local file serving path dependencies.
- [x] Task IDs strictly run $11, 12, 13, 14, 15$ (guaranteed zero collision with existing tasks 1–10).
- [x] Pre-annotations are populated under `"predictions"`, not `"annotations"`.
- [x] Existing completed annotations for tasks 1–10 remain completely untouched.
- [x] Bounding box labels match `object_label` (`vehicle` and `license_plate`).
- [x] Zero plaintext registration numbers emitted in code or logs.
- [x] No modifications made to production inference code, database, or migrations.

---

## 7. Recommended Next Action

**Recommended Next Action:** **Inspect the 5-Task Pilot Package in Label Studio Web UI**

1. Ensure the labeling interface in Project 2 (`NETRAVA — Vehicle & Number Plate Annotation Pilot`) is updated with [`label_studio_interface_v2.xml`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_interface_v2.xml).
2. Open Project 2 at `http://localhost:8080`, click **Import**, and drag & drop [`fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_5_tasks_with_predictions.json`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_5_tasks_with_predictions.json).
3. Review tasks 11 through 15:
   - Verify that the candidate bounding boxes appear pre-drawn on the image.
   - Adjust boxes or add missing plate boxes (e.g. `PILOT-005`).
   - Type the plate transcription manually.
   - Click **Submit**.
4. Once annotators confirm the 5-task pilot workflow feels smooth and accelerates labeling, generate predictions for all 90 tasks using `python fixtures/datasets/evaluation/generate_predictions.py --samples PILOT-002 ... PILOT-100`.
