# NETRAVA — Phase 5.5: Evaluation Pilot Annotation & Ground-Truth Verification Guide
**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-PHASE5-5-ANNOTATION-GUIDE-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Protocol  
**Author:** Senior Computer-Vision Dataset Engineer  
**Status:** COMPLETE / OPERATIONAL STANDARD  

---

## 1. Scope & Core Policy

This document establishes the official manual annotation protocol for the NETRAVA 100-sample evaluation pilot dataset derived from the Zenodo Number Plate Identification Dataset (`DOI: 10.5281/zenodo.13954136`).

### Ethical & Scientific Integrity Rules
1. **Zero Automated Self-Labeling:** Annotations must **NEVER** be seeded or generated using NETRAVA's YOLOv8 vehicle detector, plate localizer, or Tesseract OCR engine. Ground truth must originate independently from human annotators.
2. **Two-Pass Verification Requirement:** Every accepted ground-truth sample requires two distinct human passes:
   - **Pass 1:** Primary human annotation (vehicle chassis box, license plate box, transcript verification against image pixels).
   - **Pass 2:** Independent senior reviewer verification (approval or adjustment, resolving disagreements).
3. **No Fabricated Coordinates:** If an image is a tight plate crop without visible vehicle body, the vehicle box is marked `null` with explicit reason `CROP_ONLY_NO_CHASSIS`. Fake bounding boxes must never be invented.
4. **Authoritative Transcript Immutability:** Never overwrite the source spreadsheet transcript. Discrepancies between pixels and the ledger are recorded as `MISMATCH` or `NEEDS_SECOND_REVIEW`.
5. **Privacy Boundary:** Plaintext license plate registration numbers must **NEVER** be committed to version control, printed in application logs, or published in public reports. All integrity hashes use cryptographic SHA-256 digests.

---

## 2. Directory Architecture & Stage Separation

The evaluation annotation workspace resides in `fixtures/datasets/evaluation/annotations/` (strictly excluded from Git via `.gitignore`):

```
fixtures/datasets/evaluation/annotations/
├── schema/
│   └── annotation_schema.json           # Formal JSON Schema definition
├── unreviewed/
│   └── pilot_work_queue.json            # 100 queued evaluation tasks awaiting first pass
├── first_pass/
│   ├── templates/
│   │   └── sample_first_pass_template.json
│   └── records/                         # First-pass human submissions (PILOT-001.json, etc.)
├── second_pass/
│   ├── templates/
│   │   └── sample_second_review_template.json
│   └── records/                         # Independent review decisions and reconciliation logs
└── final_accepted/
    └── records/                         # Final dual-approved ground-truth benchmark records
```

---

## 3. Coordinate Convention & Bounding-Box Protocol

### 3.1 Coordinate System
- **Origin $(0, 0)$:** Top-left corner of the image canvas.
- **Axes:** $X$-axis increases rightward ($0 \le X \le W$); $Y$-axis increases downward ($0 \le Y \le H$).
- **Format:** 4-element integer array `[x_min, y_min, x_max, y_max]`.
- **Validation Constraints:**
  $$0 \le x_{\min} < x_{\max} \le \text{Image Width}$$
  $$0 \le y_{\min} < y_{\max} \le \text{Image Height}$$
  $$\text{Box Width} = x_{\max} - x_{\min} \ge 4\text{ pixels}$$
  $$\text{Box Height} = y_{\max} - y_{\min} \ge 4\text{ pixels}$$

### 3.2 Vehicle Chassis Bounding Box (`class: "vehicle"`)
- **Objective:** Tightly enclose the visible physical body of the vehicle (car, motorcycle, auto-rickshaw, bus, truck, SUV).
- **Inclusions:** Bumpers, mirrors, wheels, roof racks, and mounted accessories.
- **Unboundable Case:** If the image is a tight crop of only the number plate mounting area where the vehicle chassis is not discernable, set:
  ```json
  "vehicle": null,
  "vehicle_unboundable_reason": "CROP_ONLY_NO_CHASSIS"
  ```

### 3.3 License-Plate Bounding Box (`class: "license_plate"`)
- **Objective:** Tightly enclose the rectangular or square license plate mounting plate boundary.
- **Inclusions:** The entire plate plate border, including state code, district code, series letters, registration digits, and the High Security Registration Plate (HSRP) hologram/chakra emblem if present.
- **Exclusions:** Do not include the car bumper, mounting bracket screws, or surrounding grille.
- **Quality Flags:**
  - `is_truncated`: Set `true` if the plate extends outside image canvas boundaries.
  - `is_occluded`: Set `true` if tow bars, bumper guards, straps, or mud occlude plate characters.
  - `is_blurred`: Set `true` if motion blur or optical defocus impairs character edge sharpness.
  - `is_difficult`: Set `true` if severe shadows, specular glare, or low contrast hinder readability.

---

## 4. Transcript Verification Protocol

Annotators must inspect the visible characters on the license plate image and compare them directly against the authoritative transcript from the ledger:

| Status Code | Definition & Decision Rule | Required Action |
| :--- | :--- | :--- |
| **`VERIFIED_MATCH`** | Every visible character on the plate exactly matches the authoritative normalized transcript. | Mark verified; record character length. |
| **`MISMATCH`** | The plate is clearly legible, but one or more characters differ from the ledger (e.g., typographical error in source Excel). | Flag `MISMATCH`; record proposed correction in notes without modifying source ledger. |
| **`UNREADABLE`** | Plate is physically too small ($< 12\text{ px}$ height), overexposed, occluded, or degraded such that a human annotator cannot identify characters with $\ge 95\%$ certainty. | Mark `UNREADABLE`; exclude from strict full-plate OCR benchmark denominator. |
| **`NEEDS_SECOND_REVIEW`** | Ambiguity exists (e.g., font styling ambiguity between `8` vs `B`, `0` vs `D`, or multi-line spacing). | Mark for senior adjudicator review. |

---

## 5. Independent Second-Pass Review & Reconciliation

1. **Reviewer Independence:** The second reviewer must be a senior CV evaluation engineer different from the primary annotator (`reviewer_id != annotator_id`).
2. **IoU Verification:** Reviewer calculates the Intersection over Union (IoU) between their assessment and the primary annotator's bounding box:
   - If $\text{IoU} \ge 0.85$, the box is approved as-is.
   - If $\text{IoU} < 0.85$, the reviewer provides adjusted coordinates.
3. **Disagreement Adjudication:**
   - If annotator and reviewer disagree on transcript status (`VERIFIED_MATCH` vs `MISMATCH`), the sample is adjudicated jointly. If unresolved, it is designated `UNRESOLVED_DISAGREEMENT` and excluded from the accepted evaluation benchmark.
4. **Promotion to `final_accepted/`:** A sample is promoted to `final_accepted/` **only** after both Pass 1 and Pass 2 approvals are digitally recorded.

---

## 6. Software Tool Integration (CVAT & Label Studio)

### 6.1 Local JSON / Scripting Workflow (Default)
When external annotation web servers are not deployed, annotators use local image viewing alongside the JSON schemas in `fixtures/datasets/evaluation/annotations/first_pass/templates/`.

### 6.2 CVAT XML / YOLO Export Mapping
When importing into CVAT (Computer Vision Annotation Tool):
- **Project Name:** `NETRAVA-PILOT-100`
- **Labels:** `vehicle` (box), `license_plate` (box)
- **Attributes on `license_plate`:** `is_truncated` (bool), `is_occluded` (bool), `is_blurred` (bool), `is_difficult` (bool)
- **Export Format:** CVAT for images 1.1 (XML) or LabelMe / YOLO bounding box export.

---

## 7. Automated Validation & Integrity Rules

Automated test suites in `fixtures/datasets/evaluation/validate_annotations.py` and `ai-worker/tests/test_annotation_validator.py` enforce:
- Positive non-inverted coordinates ($x_{\min} < x_{\max}$ and $y_{\min} < y_{\max}$)
- Zero-coordinate bounds enforcement ($x_{\max} \le W$, $y_{\max} \le H$)
- Zero duplicate sample IDs
- Mandatory explanation for unboundable vehicles
- Cryptographic SHA-256 transcript verification without leaking plaintext plates.
