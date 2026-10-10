# NETRAVA — Complete Vehicle & Number-Plate Dataset Label Studio Import Readiness

**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-COMPLETE-DATASET-IMPORT-READINESS-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Senior Computer-Vision Dataset Engineer  
**Status:** AUDITED / PILOT 90-TASK IMPORT PACKAGE READY / 1,600-IMAGE REMOTE ARCHIVE VERIFIED  

---

## 1. Executive Summary & Objective

This document establishes the operational audit, package generation, and ingestion plan to scale the NETRAVA ground-truth evaluation corpus from the initial 10-sample pilot to the complete **1,700-image research dataset** (Zenodo DOI: `10.5281/zenodo.13954136`).

### Core Engineering Principles
1. **Zero Overwrite of Existing Work:** The running Label Studio instance (`http://localhost:8080`, project `NETRAVA — Vehicle & Number Plate Annotation Pilot`, ID `2`) contains 10 completed human tasks. These 10 tasks and their annotations are strictly preserved.
2. **Deterministic Provenance:** All 1,700 items have been systematically mapped with stable sample IDs (`PILOT-001` through `PILOT-100`, followed by `NETRAVA-0101` through `NETRAVA-1700`).
3. **No Collision / Duplicate Tasks:** The import package for currently materialized images strictly begins at task ID `11`, preventing duplicate ingestion of tasks 1–10.
4. **Unreadable Plate Representation:** An enhanced Label Studio interface configuration (`v2`) introduces an explicit `UNREADABLE_PLATE` toggle, eliminating text guesswork while allowing valid vehicle/plate bounding box localization.
5. **Privacy Safeguards:** In compliance with statutory safeguards, zero plaintext registration numbers appear in reports, logs, or task headers; all references use cryptographic SHA-256 prefixes and sample IDs.

---

## 2. Dataset Audit & Inventory Accounting

| Metric Category | Count | Status / Source |
| :--- | :---: | :--- |
| **Total Source Images Expected** | **1,700** | CERN Zenodo DOI: `10.5281/zenodo.13954136` |
| **Images Available Locally on Disk** | **100** | Materialized in `fixtures/datasets/evaluation/images/` ($14.80\text{ MB}$) |
| **Locally Verified Images (CRC32 & PIL)** | **100** | 100% pass bit-level CRC32 and image dimension decoding |
| **Tasks Already Imported in Label Studio** | **10** | Tasks 1–10 in Project 2 (`PILOT-001`, `PILOT-004`, `PILOT-008`, `PILOT-014`, `PILOT-020`, `PILOT-035`, `PILOT-045`, `PILOT-055`, `PILOT-070`, `PILOT-100`) |
| **Local Images Ready for Immediate Import** | **90** | Tasks 11–100 (`PILOT-002`, `PILOT-003`, `PILOT-005`...) |
| **Images Remaining in Remote Zenodo Archive** | **1,600** | Archived in `number_plate.zip` ($1,468,393,969\text{ bytes} \approx 1,400.37\text{ MB}$) |
| **Unambiguous Dataset-to-Transcript Mappings** | **1,696** | 100% 1:1 match between `number_plate.xlsx` and `zip_central_directory.json` |
| **Ambiguous Metadata Typo Records Isolated** | **4** | Isolated author 1-off numbering typos (`C270`, `C407`, `DL36`, `WB55`) |

---

## 3. Discrepancy & Ambiguity Deep-Dive

Across the 1,700 rows of the authoritative Excel sheet (`number_plate.xlsx`) and the 1,700 image files in the Zenodo ZIP central directory:

1. **State Jurisdiction Series (536 images):**
   - 30 state prefixes (`AN`, `AP`, `AR`, `AS`, `BR`, `CG`, `CH`, `DN`, `GA`, `GJ`, `HP`, `HR`, `JH`, `JK`, `KA`, `KL`, `MH`, `ML`, `MN`, `MP`, `NL`, `OD`, `PB`, `PY`, `RJ`, `SK`, `TN`, `TR`, `TS`, `UK`, `UP`) map identically 1:1 between Excel and the ZIP directory.
2. **Commercial Series `C` (246 images):**
   - Excel uses flat numbering (`C1.png`, `C2.png`...).
   - ZIP archive uses canonical parenthetical formatting (`images/C (1).png`, `images/C (2).png`...).
   - 244 images map unambiguously via canonical pattern matching.
3. **Private Series `Y` (858 images):**
   - Excel lists items as `Y1.png` .. `Y859.png`.
   - ZIP archive stores them as `images/y (1).jpg` .. `images/y (858).jpg` plus `images/Y859.png`.
   - All 858 images map unambiguously via canonical pattern matching.
4. **Isolated Typo Records (4 images):**
   - `C270.png` (Excel) vs `images/C (271).png` (Archive)
   - `C407.png` (Excel) vs `images/C (408).png` (Archive)
   - `DL36.png` (Excel) vs `images/DL38.png` (Archive)
   - `WB55.png` (Excel) vs `images/WB5.png` (Archive)
   - *Mitigation:* These 4 items are explicitly segregated in `complete_dataset_1700_manifest.json` under `availability_status: "AMBIGUOUS_MAPPING"` and will not be imported without human transcript reconciliation.

---

## 4. Preservation of Existing Label Studio Work

- **Docker Container:** `netrava_label_studio` running at `http://localhost:8080`.
- **Target Project:** ID `2` — `NETRAVA — Vehicle & Number Plate Annotation Pilot`.
- **Preserved Records:** Tasks 1–10, including first-pass bounding boxes and submission timestamps, remain completely untouched in the SQLite database and persistent Docker volume `netrava_label_studio_data`.
- **Provisional Workspace:** Machine-validated first-pass records remain isolated in `fixtures/datasets/evaluation/annotations/provisional_first_pass/records/`.
- **Review Queue:** The independent second-pass review queue remains intact at `fixtures/datasets/evaluation/annotations/second_pass/pending_review_queue.json`.

---

## 5. Complete Import Package Architecture

Three primary artifacts have been generated to support gradual human annotation:

### 5.1 Complete 1,700-Sample Master Manifest
- **File:** [`fixtures/datasets/evaluation/complete_dataset_1700_manifest.json`](file:///D:/web%20project/gujcamera/fixtures/datasets/evaluation/complete_dataset_1700_manifest.json)
- **Contents:** Full inventory of all 1,700 items with deterministic sample IDs (`PILOT-001` through `NETRAVA-1700`), archive offsets, CRC32 checksums, image dimensions, character lengths, and cryptographic transcript SHA-256 hashes.

### 5.2 90-Task Pilot Batch Import Packages (Immediate Ingestion)
To import the remaining 90 materialized local images without re-importing tasks 1–10:
- **Local File URL Package:**  
  [`fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_90_tasks.json`](file:///D:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_90_tasks.json) ($77.8\text{ KB}$)  
  *Uses `/data/local-files/?d=images/<filename>` for persistent storage serving.*
- **Embedded Base64 Package:**  
  [`fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_90_tasks_embedded.json`](file:///D:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_90_tasks_embedded.json) ($17.28\text{ MB}$)  
  *Uses `data:image/png;base64,...` for zero-configuration, instant drag-and-drop import into Project 2.*
- **Collision Prevention:** Task IDs in both files run strictly from `11` to `100`.

### 5.3 Label Studio Interface v2 Configuration
- **File:** [`fixtures/datasets/evaluation/annotations/tool_integration/label_studio_interface_v2.xml`](file:///D:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_interface_v2.xml)
- **Enhancement:** Adds explicit legibility choices alongside the transcription text area:
  ```xml
  <Header value="4. License Plate Text Transcription &amp; Legibility" size="5"/>
  <TextArea name="plate_transcription" toName="image" rows="1" placeholder="Type legible plate characters (leave blank if unreadable)..."/>
  <Choices name="transcription_legibility" toName="image" showInline="true">
    <Choice value="LEGIBLE_PLATE" hint="Characters are visible and transcribed above"/>
    <Choice value="UNREADABLE_PLATE" hint="Plate is degraded/blurred/occluded beyond reliable human transcription"/>
  </Choices>
  ```
  *This minimal 6-line change enables human annotators to draw tight vehicle and plate bounding boxes while officially recording plates like `PILOT-055` as unreadable without inventing characters.*

---

## 6. Remote Dataset Downloader & Storage Requirements

### 6.1 Downloader Specification
- **Script:** [`fixtures/datasets/evaluation/download_complete_dataset.py`](file:///D:/web%20project/gujcamera/fixtures/datasets/evaluation/download_complete_dataset.py)
- **Endpoint:** `https://zenodo.org/api/records/13954136/files/number_plate.zip/content`
- **Features:**
  - Resumable HTTP Range chunk downloading (`Range: bytes=...`).
  - MD5 checksum validation (`e0a3d1e121f52806abb65248c8b86149`).
  - Bit-level CRC32 verification against `zip_central_directory.json` upon extraction.
  - CLI commands: `--status`, `--download`, `--verify`, `--extract`.

### 6.2 Disk Space Accounting
| Asset | Required Bytes | Size (GB) | Location Disk Space Available |
| :--- | :---: | :---: | :---: |
| Download Archive (`number_plate.zip`) | $1,468,393,969$ | $1.40\text{ GB}$ | D: Drive ($534.37\text{ GB}$ Free) |
| Extracted Images (1,700 files) | $1,575,462,774$ | $1.50\text{ GB}$ | D: Drive ($534.37\text{ GB}$ Free) |
| **Total Disk Space Required** | **$3,043,856,743$** | **$\approx 2.90\text{ GB}$** | **Ample Capacity ($< 0.6\%$ of free space)** |

---

## 7. Automated Test & Validation Results

Executed full dataset evaluation regression suite (52 unit tests across 7 test suites):

```bash
python -m pytest ai-worker/tests/test_complete_dataset_readiness.py \
                 ai-worker/tests/test_pilot_freeze.py \
                 ai-worker/tests/test_pilot_adjudication.py \
                 ai-worker/tests/test_pilot_quality_audit.py \
                 ai-worker/tests/test_tool_converter.py \
                 ai-worker/tests/test_annotation_validator.py \
                 ai-worker/tests/test_pilot_dataset_validator.py -v
```

- `test_complete_dataset_readiness.py`: **5 / 5 PASSED** (Manifest 1,700 counts, 90-task non-collision, base64 PNG decoding, ambiguous record isolation, interface v2 validation)
- `test_pilot_freeze.py`: **6 / 6 PASSED**
- `test_pilot_adjudication.py`: **5 / 5 PASSED**
- `test_pilot_quality_audit.py`: **5 / 5 PASSED**
- `test_tool_converter.py`: **9 / 9 PASSED**
- `test_annotation_validator.py`: **14 / 14 PASSED**
- `test_pilot_dataset_validator.py`: **8 / 8 PASSED**
- **Total Suite:** **52 / 52 tests PASSED in 0.19s** (100% green, zero failures)

---

## 8. Summary Import Readiness Accounting

```
================================================================================
COMPLETE DATASET IMPORT READINESS ACCOUNTING
================================================================================
Total Source Images Expected                        : 1,700
Images Available Locally on Disk                    : 100
Images Successfully Verified (CRC32 & Dimensions)   : 100
Existing Label Studio Tasks Preserved               : 10 (Tasks 1–10)
Immediate Additional Tasks Ready for Import         : 90 (Tasks 11–100)
Images Awaiting Zenodo Download / Extraction        : 1,600
Ambiguous Metadata Typo Records Isolated            : 4 (C270, C407, DL36, WB55)
Total Expected Tasks Upon Full Download Completion  : 1,696 (Unambiguous)
Estimated Archive Download Size                     : 1,400.37 MB (1.40 GB)
Estimated Total Disk Footprint (Archive + Images)   : ~2.90 GB
================================================================================
```

---

## 9. Recommended Next Action

**Recommended Next Action:** **Import the 90-Task Pilot Batch into Project 2 in Label Studio**

1. Update Project 2 labeling interface with [`label_studio_interface_v2.xml`](file:///D:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_interface_v2.xml).
2. Drag and drop [`label_studio_import_pilot_90_tasks_embedded.json`](file:///D:/web%20project/gujcamera/fixtures/datasets/evaluation/annotations/tool_integration/label_studio_import_pilot_90_tasks_embedded.json) into Project 2's **Import** tab.
3. This brings the active human annotation pool to 100 complete tasks while preserving tasks 1–10.
4. When ready to ingest the remaining 1,600 images, execute `python fixtures/datasets/evaluation/download_complete_dataset.py --download --extract`.
