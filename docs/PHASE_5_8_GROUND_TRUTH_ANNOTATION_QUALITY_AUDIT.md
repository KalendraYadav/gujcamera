# NETRAVA — Phase 5.8: Ground-Truth Annotation Quality Audit

**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-PHASE5-8-QUALITY-AUDIT-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Senior Computer-Vision Engineer & Dataset Quality Auditor  
**Status:** COMPLETE / AUDITED WITH LIMITATIONS  

---

## 1. Executive Summary

Phase 5.8 performs a rigorous, read-only quality audit of the completed 10-image human annotation pilot exported from Label Studio. In accordance with strict scientific integrity mandates:
- Zero candidate annotations or ground-truth transcripts were synthesized by automated models or heuristic scripts.
- The authoritative cryptographic sidecar ledger was used as the cryptographic source of truth without exposing or logging plaintext registration numbers.
- Human decisions on unreadable plates (`PILOT-055` and `PILOT-100`) were preserved without fabricating plate strings.
- All spatial bounding boxes, label categorizations, canvas dimensions, and vehicle-to-plate associations were audited against the physical images and evaluation manifests.

---

## 2. Files & Artifacts Inspected

| Artifact / Document | File Path | Audit Purpose |
| :--- | :--- | :--- |
| **Dataset Acquisition Plan** | `docs/PHASE_5_2_DATASET_ACQUISITION_PLAN.md` | Verification of provenance, CC-BY 4.0 license terms, and Zenodo source baseline |
| **Pilot Annotation Guide** | `docs/PHASE_5_6_HUMAN_ANNOTATION_PILOT_GUIDE.md` | Verification of stratified sampling methodology and 8-step review SOP |
| **Tool Integration Guide** | `docs/PHASE_5_7_ANNOTATION_TOOL_INTEGRATION_GUIDE.md` | Verification of Label Studio XML schema and coordinate conversion equations |
| **Annotation Schema** | `fixtures/datasets/evaluation/annotations/schema/annotation_schema.json` | JSON Schema v1.1.0 specifications for records, enums, and boundary bounds |
| **Authoritative Ledger** | `fixtures/datasets/evaluation/annotations/tool_integration/transcript_sidecar_ledger.json` | Immutable SHA-256 transcript digests and canvas dimensions for 10 pilot tasks |
| **Verified Manifest** | `fixtures/datasets/evaluation/verified_pilot_manifest.json` | 100-sample pool manifest with dimensions, CRC32 checksums, and image SHA-256 hashes |
| **Tool Ingestion Converter** | `fixtures/datasets/evaluation/convert_tool_annotations.py` | Implementation of relative percentage to pixel conversion and schema validation |
| **Validation Engine** | `fixtures/datasets/evaluation/validate_annotations.py` | Syntactic, boundary, review-stage, and privacy leak validator |
| **Label Studio Export** | `C:\Users\KALENDRA\Downloads\project-2-at-2026-10-10-06-15-f18d35b1.json` | Completed human annotation export (2.71 MB, 10 tasks, updated 2026-10-10) |

*Preservation Notice:* The original Label Studio export file and all repository ground-truth records remain strictly unchanged and un-overwritten.

---

## 3. Validation Methodology

1. **Export Payload Inspection:** Inspected the Label Studio project export `project-2-at-2026-10-10-06-15-f18d35b1.json` to extract task IDs, sample identifiers, bounding boxes, and transcription results.
2. **Deterministic Identity & Geometry Mapping:** Verified that each task's `data.sample_id` and `data.image_filename` map 1:1 to the corresponding image file and dimension metadata declared in `transcript_sidecar_ledger.json` and `verified_pilot_manifest.json`.
3. **Spatial Boundary Audit:** Evaluated all vehicle and license plate bounding boxes:
   - Transformed relative percentages $(x, y, w, h \in [0, 100\%])$ to absolute integer pixel coordinates $[x_1, y_1, x_2, y_2]$.
   - Verified that $0 \le x_1 < x_2 \le W$ and $0 \le y_1 < y_2 \le H$.
   - Confirmed box tightness enclosing the plate mounting area and visible chassis.
4. **Cryptographic Transcript Verification:** For tasks containing human-entered transcriptions, computed the SHA-256 hash of the normalized string (`^[A-Z0-9]+$`) and matched it against `authoritative_transcript_sha256` in the authoritative sidecar ledger.
5. **Multi-Vehicle Association Analysis:** For multi-vehicle scenes (`PILOT-100`), evaluated geometric enclosure and potential overlap across multiple vehicle chassis boxes.
6. **Privacy Leak Detection:** Scanned all fields, notes, and test outputs to prevent plaintext registration numbers from appearing in evaluation logs and reports.

---

## 4. Per-Task Acceptance Summary

| Sample ID | Image Filename | Canvas Resolution | Vehicle Box $[x_1, y_1, x_2, y_2]$ | License Plate Box $[x_1, y_1, x_2, y_2]$ | Transcript Audit Status | Task Classification |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **`PILOT-001`** | `AN1.png` | $272 \times 575$ | $[6, 137, 258, 400]$ (1) | $[92, 365, 186, 387]$ | SHA-256 Match (9 chars) | **ACCEPTED** |
| **`PILOT-004`** | `AN4.png` | $272 \times 363$ | $[26, 66, 224, 274]$ (1) | $[84, 228, 143, 246]$ | SHA-256 Match (7 chars) | **ACCEPTED** |
| **`PILOT-008`** | `AP1.png` | $272 \times 204$ | $[31, 36, 236, 194]$ (1) | $[99, 145, 181, 165]$ | SHA-256 Match (10 chars) | **ACCEPTED** |
| **`PILOT-014`** | `AP16.png` | $272 \times 153$ | $[61, 22, 199, 146]$ (1) | $[104, 127, 155, 138]$ | Mismatch (`3` vs `9` glyph) | **NEEDS_CORRECTION** |
| **`PILOT-020`** | `AP21.png` | $272 \times 173$ | $[0, 0, 272, 136]$ (1) | $[120, 102, 230, 126]$ | SHA-256 Match (10 chars) | **ACCEPTED** |
| **`PILOT-035`** | `AP41.png` | $271 \times 327$ | $[1, 64, 269, 309]$ (1) | $[79, 266, 189, 291]$ | SHA-256 Match (9 chars) | **ACCEPTED** |
| **`PILOT-045`** | `AR1.png` | $272 \times 153$ | $[39, 4, 214, 146]$ (1) | $[97, 110, 156, 123]$ | SHA-256 Match (8 chars) | **ACCEPTED** |
| **`PILOT-055`** | `AR8.png` | $272 \times 592$ | $[6, 164, 272, 351]$ (1) | $[31, 298, 83, 317]$ | Unreadable (Preserved) | **UNREADABLE_PLATE** |
| **`PILOT-070`** | `AS22.png` | $272 \times 481$ | $[21, 146, 241, 320]$ (1) | $[98, 282, 171, 299]$ | SHA-256 Match (10 chars) | **ACCEPTED** |
| **`PILOT-100`** | `C (101).png` | $400 \times 267$ | 3 Boxes (Multi-Vehicle) | $[171, 117, 214, 130]$ | Unreadable (Preserved) | **UNREADABLE_PLATE** |

---

## 5. Detailed Case Analyses

### 5.1 PILOT-014 (Task 4): Character Mismatch
- **Observation:** Spatial bounding boxes for both vehicle $[61, 22, 199, 146]$ and license plate $[104, 127, 155, 138]$ are tightly localized and valid.
- **Transcript Evaluation:** The human annotator transcribed 10 characters. However, hashing this transcription produces SHA-256 `472ad4a5...`, which differs from the authoritative ledger hash `80a7708c...`.
- **Root Cause:** Glyph ambiguity on character positions 7 and 9 (the human annotator transcribed digit `3` whereas the authoritative Excel ledger records digit `9`).
- **Resolution:** Marked as **NEEDS_CORRECTION**. The authoritative transcript is not silently modified; senior adjudicator review is required.

### 5.2 PILOT-055 (Task 8): Extreme Vertical Aspect Ratio & Unreadable Plate
- **Observation:** Canvas is an extreme vertical crop ($272 \times 592$, aspect ratio $0.46$).
- **Spatial Evaluation:** Vehicle box is clamped cleanly to canvas boundaries ($x_2 = 272$).
- **Transcript Evaluation:** Human annotator intentionally left transcription empty due to severe blur and resolution degradation.
- **Resolution:** Marked as **UNREADABLE_PLATE**. In compliance with protocol, no artificial transcript was guessed or synthesized.

### 5.3 PILOT-100 (Task 10): Multi-Vehicle Scene & Unreadable Plate
- **Observation:** Scene contains multiple vehicles captured in a commercial frame ($400 \times 267$).
- **Spatial Evaluation:**
  - Vehicle 1 (Center): $[157, 73, 343, 181]$
  - Vehicle 2 (Left): $[0, 68, 201, 231]$
  - Vehicle 3 (Right): $[294, 68, 400, 152]$
  - License Plate: $[171, 117, 214, 130]$
- **Association Analysis:** The plate box is completely enclosed inside Vehicle 1 ($157 \le 171 < 214 \le 343$ and $73 \le 117 < 130 \le 181$). However, Vehicle 2 horizontally overlaps Vehicle 1 between $x=157$ and $x=201$, cutting through the left portion of the license plate box.
- **Transcript Evaluation:** The plate characters are visually degraded and unreadable; human annotator left transcription blank.
- **Resolution:** Marked as **UNREADABLE_PLATE**. Association is geometrically resolved to Vehicle 1, but noted as ambiguous due to lack of explicit relation IDs in the export schema.

---

## 6. Ground-Truth Acceptance Counts

```
================================================================================
PHASE 5.8 GROUND-TRUTH ACCEPTANCE ACCOUNTING
================================================================================
Total Tasks Audited                                 : 10
Tasks with Valid Vehicle Bounding Boxes             : 10 (12 boxes total)
Tasks with Valid License Plate Bounding Boxes       : 10 (10 boxes total)
Verified Readable Plate Transcriptions              : 7
Intentionally Unreadable Plate Tasks                : 2
Incorrect / Ambiguous Vehicle-to-Plate Associations : 1 (PILOT-100)
Invalid Coordinates or Labels                       : 0
Tasks Requiring Human Adjudication / Correction     : 1 (PILOT-014)
Fully Accepted Ground-Truth Samples                 : 7
================================================================================
```

---

## 7. Test Results

Automated regression and audit test execution:
```bash
python -m pytest ai-worker/tests/test_pilot_quality_audit.py \
                 ai-worker/tests/test_tool_converter.py \
                 ai-worker/tests/test_annotation_validator.py \
                 ai-worker/tests/test_pilot_dataset_validator.py -v
```

**Results:**
- `test_pilot_quality_audit.py`: **5 / 5 PASSED** (Verifying 10-task export parsing, box geometry, PILOT-100 multi-vehicle association, transcript verification, and unreadable plate handling)
- `test_tool_converter.py`: **9 / 9 PASSED** (Coordinate conversion, boundary clamping, schema translation)
- `test_annotation_validator.py`: **14 / 14 PASSED** (Boundary rules, enum statuses, privacy leaks)
- `test_pilot_dataset_validator.py`: **8 / 8 PASSED** (Image CRC32 integrity, manifest matching)
- **Total Suite:** **36 / 36 tests PASSED in 0.07s** (Zero failures)

---

## 8. Remaining Limitations

1. **Adjudication Required for PILOT-014:** The human transcript for `PILOT-014` diverges from the authoritative Excel ledger (`3` vs `9` glyph confusion). Until reconciled by senior human adjudication, this task cannot be promoted to `final_accepted`.
2. **Schema Support for Multi-Vehicle Associations:** The current `annotation_schema.json` defines `"vehicle"` as a single object (`"vehicle": { ... }`) rather than an array of vehicles. In multi-vehicle scenes like `PILOT-100`, the schema cannot natively store multiple chassis boxes or express foreign-key associations between plates and specific vehicle instances.
3. **Dual-Pass Review Stage Pending:** While 7 tasks have verified primary bounding boxes and matching transcripts, independent second-pass verification (`second_pass/records/`) remains to be conducted prior to production model benchmarking.
4. **Unreadable Tasks Excluded from OCR Benchmarking:** `PILOT-055` and `PILOT-100` provide valid vehicle and plate localization ground truth, but must be excluded from character recognition accuracy (mAP/NED) scoring.

---

## 9. Final Verdict

**Verdict:** **PASS WITH LIMITATIONS**

- **Justification:** The Label Studio pilot export is fully accessible and structurally intact. All 10 tasks contain valid, strictly clamped spatial bounding boxes for vehicles and plates. 7 of 10 tasks have verified, cryptographically matching plate transcriptions and are fully accepted. The 3 remaining tasks are strictly accounted for without fabrication (2 unreadable plates preserved, 1 glyph mismatch flagged for correction). All 36 automated audit tests pass with 100% success.
