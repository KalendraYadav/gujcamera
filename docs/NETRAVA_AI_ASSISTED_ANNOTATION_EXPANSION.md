# NETRAVA — AI-Assisted Annotation Expansion Report: 15 to 50 Images

**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-AI-ASSISTED-ANNOTATION-EXPANSION-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Senior Computer-Vision Engineer and Dataset Automation Specialist  
**Status:** IMPLEMENTED, TESTED, & READY FOR MANUAL INSPECTION (35 TASKS STAGED)  

---

## 1. Executive Summary & Objective

This report documents the preparation and verification of **35 additional images** with AI-generated annotation proposals, expanding the active NETRAVA ground-truth evaluation queue from **15 to 50 images** in Label Studio (Project 2: `NETRAVA — Vehicle & Number Plate Annotation Pilot`).

### Current Status Context:
- **Tasks 1–10:** Initial 10-image pilot manually annotated, reviewed, and adjudicated.
- **Tasks 11–15:** Initial 5-image AI-assisted pilot slice imported and reviewed by human annotator.
- **User Finding from Tasks 11–15:** Vehicle bounding boxes were generally accurate and useful. However, heuristic license-plate localization was unreliable, occasionally proposing rectangles in incorrect vehicle locations (e.g. radiator grille slats or bumper shadows).
- **Core Engineering Directive for Expansion (Tasks 16–50):** Implement conservative plate-localization safety guards in the offline prediction generator to **prefer omitting questionable plate proposals over placing them in the wrong location**, while maintaining strict format and confidence gating for OCR and class-agnostic NMS for vehicles.

---

## 2. Dataset Accounting & 35 Selected Sample IDs

### 2.1 Provenance Accounting
- **Total Local Verified Images:** Exactly 100 images materialized in `fixtures/datasets/evaluation/images/`.
- **Previously Utilized Samples (15 images):**
  - *Tasks 1–10 (Manual):* `PILOT-001`, `PILOT-004`, `PILOT-008`, `PILOT-014`, `PILOT-020`, `PILOT-035`, `PILOT-045`, `PILOT-055`, `PILOT-070`, `PILOT-100`.
  - *Tasks 11–15 (Pilot 5):* `PILOT-002`, `PILOT-003`, `PILOT-005`, `PILOT-006`, `PILOT-007`.
- **Newly Selected Samples (35 images):**
  - Mapped strictly to **Task IDs 16 through 50** in `label_studio_import_next_35_tasks_with_predictions.json`.
  - $100\%$ disjoint from the first 15 samples.
  - $100\%$ verified locally on disk and decoded with OpenCV/PIL.

### 2.2 The 35 Selected Sample IDs & Task Mappings

| Task ID | Sample ID | Image Filename | Resolution | Vehicle Detections | Plate Detections | OCR Suggestions |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **16** | `PILOT-009` | `AP10.png` | $272 \times 423$ | 1 vehicle ($0.850$) | 0 plates | 0 text |
| **17** | `PILOT-010` | `AP12.png` | $272 \times 363$ | 4 vehicles ($0.615$) | 0 plates (rejected AR $2.07$) | 0 text |
| **18** | `PILOT-011` | `AP13.png` | $272 \times 363$ | 2 vehicles ($0.704$) | 1 plate ($0.713$, AR $3.62$) | 0 text (conf $< 0.50$) |
| **19** | `PILOT-012` | `AP14.png` | $272 \times 620$ | 1 vehicle ($0.657$) | 0 plates (rejected conf $0.53$) | 0 text |
| **20** | `PILOT-013` | `AP15.png` | $272 \times 363$ | 2 vehicles ($0.631$) | 1 plate ($0.789$, AR $3.30$) | 0 text (conf $< 0.50$) |
| **21** | `PILOT-015` | `AP17.png` | $272 \times 590$ | 1 vehicle ($0.926$) | 0 plates (rejected AR $5.41$) | 0 text |
| **22** | `PILOT-016` | `AP18.png` | $271 \times 170$ | 3 vehicles ($0.804$) | 0 plates | 0 text |
| **23** | `PILOT-017` | `AP19.png` | $272 \times 604$ | 1 vehicle ($0.873$) | 0 plates (rejected AR $5.23$) | 0 text |
| **24** | `PILOT-018` | `AP2.png` | $272 \times 125$ | 2 vehicles ($0.720$) | 0 plates | 0 text |
| **25** | `PILOT-019` | `AP20.png` | $272 \times 363$ | 2 vehicles ($0.616$) | 1 plate ($0.688$, AR $3.17$) | 0 text (conf $< 0.50$) |
| **26** | `PILOT-021` | `AP22.png` | $272 \times 363$ | 2 vehicles ($0.768$) | 0 plates | 0 text |
| **27** | `PILOT-022` | `AP23.png` | $272 \times 363$ | 1 vehicle ($0.882$) | 0 plates | 0 text |
| **28** | `PILOT-023` | `AP24.png` | $272 \times 363$ | 2 vehicles ($0.790$) | 0 plates | 0 text |
| **29** | `PILOT-024` | `AP25.png` | $272 \times 363$ | 3 vehicles ($0.735$) | 1 plate ($0.677$, AR $4.30$) | 0 text (conf $0.00$) |
| **30** | `PILOT-025` | `AP26.png` | $272 \times 213$ | 0 vehicles (tight crop) | 0 plates | 0 text |
| **31** | `PILOT-026` | `AP27.png` | $272 \times 363$ | 1 vehicle ($0.679$) | 1 plate ($0.646$, AR $4.17$) | 0 text (regex mismatch) |
| **32** | `PILOT-027` | `AP29.png` | $269 \times 141$ | 0 vehicles (tight crop) | 0 plates | 0 text |
| **33** | `PILOT-028` | `AP3.png` | $272 \times 363$ | 1 vehicle ($0.577$) | 0 plates (rejected: too high) | 0 text |
| **34** | `PILOT-029` | `AP30.png` | $272 \times 483$ | 3 vehicles ($0.680$) | 1 plate ($0.699$, AR $4.00$) | 0 text (conf $0.00$) |
| **35** | `PILOT-030` | `AP33.png` | $272 \times 484$ | 1 vehicle ($0.768$) | 1 plate ($0.708$, AR $3.95$) | 0 text (conf $0.00$) |
| **36** | `PILOT-031` | `AP34.png` | $267 \times 94$ | 0 vehicles (tight crop) | 0 plates | 0 text |
| **37** | `PILOT-032` | `AP39.png` | $272 \times 204$ | 1 vehicle ($0.618$) | 0 plates | 0 text |
| **38** | `PILOT-033` | `AP4.png` | $272 \times 205$ | 2 vehicles ($0.610$) | 1 plate ($0.594$, AR $4.79$) | 0 text (empty OCR) |
| **39** | `PILOT-034` | `AP40.png` | $272 \times 363$ | 2 vehicles ($0.738$) | 0 plates | 0 text |
| **40** | `PILOT-036` | `AP42.png` | $272 \times 204$ | 1 vehicle ($0.485$) | 0 plates | 0 text |
| **41** | `PILOT-037` | `AP43.png` | $272 \times 363$ | 1 vehicle ($0.619$) | 0 plates | 0 text |
| **42** | `PILOT-038` | `AP44.png` | $272 \times 363$ | 0 vehicles (tight crop) | 0 plates | 0 text |
| **43** | `PILOT-039` | `AP45.png` | $272 \times 483$ | 1 vehicle ($0.495$) | 0 plates | 0 text |
| **44** | `PILOT-040` | `AP46.png` | $272 \times 411$ | 1 vehicle ($0.708$) | 0 plates | 0 text |
| **45** | `PILOT-041` | `AP5.png` | $272 \times 363$ | 1 vehicle ($0.847$) | 0 plates | 0 text |
| **46** | `PILOT-042` | `AP6.png` | $272 \times 262$ | 0 vehicles (tight crop) | 0 plates | 0 text |
| **47** | `PILOT-043` | `AP7.png` | $272 \times 366$ | 3 vehicles ($0.578$) | 0 plates (rejected: $66\%$ width)| 0 text |
| **48** | `PILOT-044` | `AP8.png` | $272 \times 366$ | 1 vehicle ($0.663$) | 0 plates | 0 text |
| **49** | `PILOT-046` | `AR10.png` | $272 \times 363$ | 1 vehicle ($0.918$) | 0 plates (rejected AR $2.03$) | 0 text |
| **50** | `PILOT-047` | `AR11.png` | $272 \times 597$ | 0 vehicles (tight crop) | 0 plates | 0 text |

---

## 3. Plate-Localization Safety Safeguards (Task 2 Implementation)

In response to human feedback on Tasks 11–15, `validate_plate_proposal` was engineered into [`fixtures/datasets/evaluation/generate_predictions.py`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/generate_predictions.py):

### Enforced Safety Filters:
1. **Frame Boundary Integrity:** Box must be strictly within $[0, \text{img\_width}] \times [0, \text{img\_height}]$.
2. **Dimension Constraints:**
   - Minimum pixel size: width $\ge 24\text{ px}$, height $\ge 8\text{ px}$.
   - Maximum image width: width $\le 60\%$ of total frame width.
3. **Plausible Aspect Ratio:** Indian vehicle license plates conform to standard rectangular dimensions ($2.20 \le \text{AR} \le 5.20$).
4. **Heuristic Score Gate:** Requires morphological fitness score $\ge 0.55$ (up from $0.45$). This score is strictly treated as a geometric heuristic, **not** as a calibrated ML confidence.
5. **Vehicle Region Containment & Vertical Mounting Plausibility:**
   - **Relative Width:** Plate width cannot exceed $50\%$ of vehicle width (eliminates bumper bar / radiator grille false positives).
   - **Relative Height:** Plate height cannot exceed $22\%$ of vehicle height.
   - **Relative Area:** Plate area cannot exceed $8\%$ of vehicle area.
   - **Vertical Position:** Plate center must reside in the lower $55\%$ of the vehicle chassis ($\ge y_1 + 0.45 \times h_{\text{veh}}$). Boxes near the windshield, hood, or upper radiator are rejected.
   - **Spatial Containment:** Box must reside strictly inside the vehicle envelope ($\le 4\text{ px}$ margin).

### Empirical Filtering Results:
- **Raw Plate Proposals Generated by Morphology:** 15 candidates across 35 images.
- **Plate Proposals Accepted:** **8 candidates** ($53.3\%$) passed all conservative checks.
- **Plate Proposals Rejected & Omitted:** **7 candidates** ($46.7\%$) rejected due to:
  - `bad_aspect_ratio` ($< 2.2$ or $> 5.2$): 4 candidates (`PILOT-010`, `PILOT-015`, `PILOT-017`, `PILOT-046`).
  - `plate_too_high_in_chassis` (upper vehicle body): 1 candidate (`PILOT-028`).
  - `too_wide_for_vehicle` ($66\%$ of car width): 1 candidate (`PILOT-043`).
  - `low_heuristic_fitness` ($< 0.55$): 1 candidate (`PILOT-012`).

By omitting these 7 questionable proposals, human annotators avoid deleting misleading rectangles; they simply draw the plate from scratch only where necessary.

---

## 4. Proposal Accounting Summary (35 Images)

```
================================================================================
AI-ASSISTED ANNOTATION EXPANSION ACCOUNTING (TASKS 16–50)
================================================================================
Images Evaluated and Processed                  : 35
Total Vehicle Bounding Boxes Proposed           : 48 (retained after class-agnostic NMS)
Raw License-Plate Proposals Evaluated           : 15
License-Plate Proposals Accepted                : 8
License-Plate Proposals Rejected & Omitted      : 7 (46.7% filtered out)
Plate Transcriptions Suggested                  : 0 (100% rejected by OCR gating)
Empty / Tight Crop Canvases Preserved           : 6 (PILOT-025, 027, 031, 038, 042, 047)
Tasks Guaranteed Non-Colliding with Tasks 1–15  : 35 (Task IDs 16 to 50)
================================================================================
```

---

## 5. Automated Unit & Regression Test Results

Executed full test suite (75 tests across 8 test suites):

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

### Key Expansion Tests in `test_prediction_generator.py`:
- `test_next_35_count_and_uniqueness`: PASSED (exactly 35 unique samples).
- `test_next_35_is_disjoint_from_first_15`: PASSED (zero overlap with tasks 1–15).
- `test_all_35_images_exist_and_decode`: PASSED (all 35 files verified on disk and readable).
- `test_zero_collision_with_tasks_1_to_15`: PASSED (task IDs run strictly 16–50; completely disjoint from 1–15).
- `test_plate_localization_safeguards` (8 distinct safeguard assertions): ALL PASSED.
- `test_predictions_structure_and_no_unreadable_auto_selection`: PASSED.
- `test_all_prediction_coordinates_are_valid_percentages`: PASSED.

**Overall Test Suite Result: 75 / 75 PASSED in 0.57s (100% Green).**

---

## 6. Import Package Details

- **File Path:** [`fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_next_35_tasks_with_predictions.json`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_next_35_tasks_with_predictions.json)
- **Size:** $7,026,794\text{ bytes} \approx 6.70\text{ MB}$.
- **Format:** Standard Label Studio JSON with embedded Base64 PNG images.
- **Task ID Range:** Strictly `16` to `50`.
- **Status:** Staged locally; **not** automatically imported to Label Studio.
- **Preservation:** Tasks 1–10 (manual) and Tasks 11–15 (pilot slice) remain completely untouched.

---

## 7. Recommended Next Action

**Import the 35-Task Expansion Package into Label Studio:**

1. Navigate to Project 2 (`NETRAVA — Vehicle & Number Plate Annotation Pilot`) at `http://localhost:8080`.
2. Click **Import** and upload [`fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_next_35_tasks_with_predictions.json`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_next_35_tasks_with_predictions.json).
3. Annotate Tasks 16 through 50:
   - Accept or adjust the pre-drawn vehicle boxes.
   - For the 8 accepted plate boxes, review position and adjust if necessary.
   - For images where plate boxes were safely omitted (or tight crops), draw the plate box manually.
   - Type the plate transcription into the clean text area and select legibility.
   - Click **Submit**.
4. Once Tasks 16–50 are submitted, the evaluation corpus reaches **50 fully annotated, human-adjudicated ground-truth samples**.
