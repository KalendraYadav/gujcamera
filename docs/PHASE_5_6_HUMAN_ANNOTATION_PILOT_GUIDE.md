# NETRAVA — Phase 5.6: Ten-Image Human Annotation Pilot Guide
**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-PHASE5-6-PILOT-GUIDE-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Senior Computer-Vision Dataset Engineer & Annotation Quality Auditor  
**Status:** OPERATIONAL READY / AWAITING HUMAN ANNOTATOR PARTICIPATION  

---

## 1. Executive Summary & Objective

Phase 5.6 establishes a controlled, reproducible **10-Image Human Annotation Pilot** using the verified Phase 5.5 evaluation infrastructure.

### Primary Purpose
This phase validates the **human-in-the-loop annotation and verification workflow**. It does **not** evaluate model accuracy, train models, or benchmark detection performance.

### Strict Scientific Integrity Mandate
- **No Automated Self-Labeling:** Under no circumstances may AI models (YOLO, OCR, heuristics) or automated scripts generate coordinates or transcript decisions to pose as human labels.
- **Accurate Progress Accounting:** At the completion of Phase 5.6 preparation, the ground-truth state is strictly **10 work items prepared, 0 human annotated, 0 visually verified, 0 second-pass reviewed, and 0 final accepted**.

---

## 2. Sample Selection Methodology

From the 100-sample materialized evaluation pool (`PILOT-001` through `PILOT-100`), 10 samples were selected deterministically using **Stratified Systematic Sampling** across diverse dimensions, jurisdictions, and formatting complexities:

| Sample ID | Image Filename | Canvas Dimensions | Aspect Ratio | State / Series | Format Complexity | Deterministic Selection Rationale |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **`PILOT-001`** | `AN1.png` | $272 \times 575$ | 0.47 (Tall) | Andaman & Nicobar (`AN`) | Standard 9-char | Vertical orientation baseline |
| **`PILOT-004`** | `AN4.png` | $272 \times 363$ | 0.75 | Andaman & Nicobar (`AN`) | Nonstandard 7-char | Non-standard length handling |
| **`PILOT-008`** | `AP1.png` | $272 \times 204$ | 1.33 | Andhra Pradesh (`AP`) | Standard 10-char | Standard 10-char baseline |
| **`PILOT-014`** | `AP16.png` | $272 \times 153$ | 1.78 (Wide) | Andhra Pradesh (`AP`) | Standard 10-char | Wide aspect ratio plate banner |
| **`PILOT-020`** | `AP21.png` | $272 \times 173$ | 1.57 | Andhra Pradesh (`AP`) | Standard 10-char | Standard passenger series |
| **`PILOT-035`** | `AP41.png` | $271 \times 327$ | 0.83 | Andhra Pradesh (`AP`) | Standard 9-char | Odd width canvas ($271\text{ px}$) |
| **`PILOT-045`** | `AR1.png` | $272 \times 153$ | 1.78 | Arunachal Pradesh (`AR`) | Nonstandard 8-char | Frontier jurisdiction, 8-char |
| **`PILOT-055`** | `AR8.png` | $272 \times 592$ | 0.46 (Extreme) | Arunachal Pradesh (`AR`) | Nonstandard 8-char | Extreme vertical crop ($592\text{ px}$ height) |
| **`PILOT-070`** | `AS22.png` | $272 \times 481$ | 0.57 | Assam (`AS`) | Standard 10-char | Tall commercial series |
| **`PILOT-100`** | `C (101).png` | $400 \times 267$ | 1.50 | Commercial (`C`) | Nonstandard 7-char | High-res $400 \times 267$ commercial sample |

*Note: In compliance with statutory data privacy safeguards, plaintext registration numbers are omitted from all documentation.*

---

## 3. Human Review Procedure (Standard Operating Procedure)

Human annotators must execute the following 8-step protocol for each assigned work item:

1. **Step 1: Open Actual Image File**  
   Open the corresponding image in `fixtures/datasets/evaluation/images/<image_filename>`. Inspect the canvas at $100\%$ and $200\%$ magnification.
2. **Step 2: Draw Vehicle Chassis Bounding Box (if visible)**  
   If the vehicle body is visible, draw tight integer coordinates `[x_min, y_min, x_max, y_max]` enclosing the body, bumpers, and mirrors. If the image is a tight crop showing only the license plate, set `vehicle = null` and `vehicle_unboundable_reason = "CROP_ONLY_NO_CHASSIS"`.
3. **Step 3: Draw License-Plate Bounding Box**  
   Draw tight integer coordinates `[x_min, y_min, x_max, y_max]` enclosing the physical metal/plastic license plate. Do not include bumper brackets or mounting grilles.
4. **Step 4: Inspect Visibility and Difficulty Flags**  
   Record boolean flags:
   - `is_truncated`: `true` if plate extends beyond image borders.
   - `is_occluded`: `true` if screws, frames, tow bars, or dirt cover any characters.
   - `is_blurred`: `true` if motion or focus blur impairs character edges.
   - `is_difficult`: `true` if lighting glare, low resolution, or steep angle degrades legibility.
5. **Step 5: Inspect Visible Characters vs Authoritative Transcript**  
   Read each alphanumeric character on the physical plate. Compare against the authoritative record. **Never treat regex compliance as proof of correctness.**
6. **Step 6: Assign Verification Status**  
   Record one of the four official outcomes:
   - `VERIFIED_MATCH`: Visible plate characters match authoritative transcript with $100\%$ certainty.
   - `MISMATCH`: Plate is clearly readable, but differs from authoritative record (record notes, do not alter source ledger).
   - `UNREADABLE`: Severe degradation prevents reliable character recognition ($< 95\%$ certainty).
   - `NEEDS_SECOND_REVIEW`: Ambiguity exists between confusing glyphs (e.g., `8` vs `B`, `0` vs `D`).
7. **Step 7: Record Human Metadata & Save Record**  
   Populate `annotator_id` with human operator pseudonym (e.g. `annotator_human_1`), record timestamp in `updated_at`, set `review_stage = "FIRST_PASS_SUBMITTED"`, and save to `fixtures/datasets/evaluation/annotations/first_pass/records/<sample_id>.json`.
8. **Step 8: Run Annotation Validator**  
   Execute `python fixtures/datasets/evaluation/validate_annotations.py` to confirm syntax, boundary, and privacy compliance.

---

## 4. Second-Pass Review & Adjudication Protocol

### Independent Dual-Review Requirement
1. **Blind Inspection:** The second reviewer must independently inspect the original image and form an independent judgment before viewing the first-pass submission.
2. **Disagreement Handling:**
   - **Bounding Boxes:** If $\text{IoU} \ge 0.85$, the primary box is accepted. If $\text{IoU} < 0.85$, coordinates must be adjusted and documented.
   - **Transcript Status:** Any disagreement between `VERIFIED_MATCH` and `MISMATCH` triggers senior adjudication.
3. **Promotion Rule:** No record may be moved to `final_accepted/records/` until:
   - `annotator_id` is non-empty.
   - `reviewer_id` is non-empty (`reviewer_id != annotator_id`).
   - `review_stage = "ACCEPTED_FINAL"`.
   - All validator checks pass with zero errors.

---

## 5. Security, Privacy, and Environment Safeguards

- **Git Isolation:** All evaluation images, manifests, and annotation records reside in `fixtures/datasets/evaluation/`, strictly excluded by `.gitignore`.
- **Database Immutability:** Preflight database record count is preserved:
  - `cameras`: 15
  - `vehicle_sightings`: 16
  - `alerts`: 1
  - `watchlists`: 2 (entries: 3)
- **Zero Production Interaction:** No connections made to production database, Redis, MinIO, or live CCTV pipelines during evaluation preparation.
