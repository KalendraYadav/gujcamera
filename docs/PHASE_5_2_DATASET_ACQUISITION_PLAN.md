# NETRAVA — Phase 5.2: Ground-Truth Dataset Acquisition Readiness Audit
**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-PHASE5-2-DATASET-AUDIT-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Architecture  
**Author:** Senior Computer-Vision Evaluation Engineer  
**Status:** COMPLETE / READY FOR ANNOTATION PROTOCOL  

---

## 1. Executive Summary

Phase 5.2 establishes the data governance, legal provenance, and technical feasibility for acquiring an independently verified ground-truth benchmark dataset to evaluate NETRAVA's vehicle detection, plate localization, and number-plate recognition pipeline.

### Core Audit Conclusion
- **Candidate Evaluation:** Six candidate datasets spanning academic research, open-source repositories, commercial vendors, and internal fixtures were systematically evaluated against 9 strict technical and legal criteria.
- **Selected Dataset:** **Zenodo Number Plate Number Identification Dataset (DOI: 10.5281/zenodo.13954136)** is officially recommended as the primary benchmark corpus. It provides 1,700 high-resolution Indian vehicle images under a verifiable **Creative Commons Attribution 4.0 International (CC-BY 4.0)** license, accompanied by author-verified ground-truth plate strings in an independent Excel ledger.
- **Annotation Requirement:** Because the Zenodo corpus was published for image-to-text and OCR validation without spatial bounding boxes, a pilot evaluation split of **100 curated samples** requires manual two-pass vehicle and license plate bounding-box annotation before end-to-end detector mAP can be benchmarked.
- **Strict Data Isolation:** All evaluation data, bounding-box labels, and transcripts reside outside version control and remain strictly isolated from PostgreSQL, Redis Streams, and MinIO storage.

---

## 2. Candidate Dataset Evaluation Matrix

| Candidate Dataset | Official Source & Custodian | Declared License | Redistribution & Research Rights | Sample Count | Vehicle Boxes Present? | Plate Boxes Present? | Exact Plate Text Present? | CCTV / Angle Suitability | Qualification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Zenodo Number Plate Identification** | CERN Zenodo / Bapatla Engineering College ([DOI: 10.5281/zenodo.13954136](https://doi.org/10.5281/zenodo.13954136)) | **CC-BY 4.0** (Open Access) | Permitted (Share & Adapt with Attribution) | 1,700 images | No (Chassis boxes missing) | Partial (Centered crop view) | **YES** (1,700 verified in author Excel ledger) | Varied angles, distances, real Indian plates | **QUALIFIED (Selected for OCR + Annotation)** |
| **2. IIIT Hyderabad IDD (Detection)** | IIIT-H CVIT / iHub-Data ([idd.insaan.iiit.ac.in](https://idd.insaan.iiit.ac.in/)) | Academic Research Open Access | Non-commercial research only; redistribution restricted | 54,000+ frames | **YES** (Car, motorcycle, auto-rickshaw, bus, truck) | **NO** (0 plate boxes) | **NO** (0 plate strings) | Ego-vehicle dashcam (moving car view) | **DISQUALIFIED FOR ANPR** (No plate data; dashcam perspective) |
| **3. AI City Challenge (CityFlowV2)** | NVIDIA / University of Washington IPL ([aicitychallenge.org](https://www.aicitychallenge.org/)) | Restricted Academic Agreement | Prohibited (Strict NDA, no redistribution) | 229,680 boxes / 46 cameras | **YES** (Vehicle tracking boxes) | **NO** | **NO (Permanently blurred/redacted)** | Fixed roadside intersection cameras | **DISQUALIFIED** (Plates redacted; non-distributable) |
| **4. Roboflow Universe (Indian Plates)** | Roboflow Community Open Workspaces | CC-BY 4.0 (Community) | Permitted with attribution | 200–500 images | Variable by workspace | **YES** (Pre-annotated YOLO plate boxes) | **NO / Unverified** (Boxes labeled without text transcripts) | Mixed street photos | **DISQUALIFIED FOR OCR** (Missing verified text strings) |
| **5. DataCluster Labs Indian Plates** | DataCluster Labs ([datacluster.ai](https://datacluster.ai/)) | Proprietary / Commercial | Prohibited without paid commercial license | 5,000+ images (paid) | Yes (Paid tier) | Yes (Paid tier) | Yes (Paid tier) | High-resolution road imagery | **DISQUALIFIED** (Proprietary paywall; non-reproducible) |
| **6. In-House NETRAVA Fixtures (`SRC-SYNTH-*`)** | Local Repo (`video-gateway/fixtures/`) | Open Project Asset (GPIC-2026) | Permitted | 2 video clips (300 frames) | Procedural (drawbox coordinates) | Procedural | Known (`GJ01AB1234`) | Synthetic 2D cartoon animation | **DISQUALIFIED FOR BENCHMARK** (Rule 7: synthetic != physical ground truth) |

---

## 3. Deep-Dive: Selected Dataset Provenance & Rights

### 3.1 Provenance Record
- **Dataset Title:** *Number Plate Number Identification Dataset*
- **Persistent Digital Object Identifier:** `https://doi.org/10.5281/zenodo.13954136`
- **Hosting Repository:** Zenodo (CERN Data Centre, Geneva, Switzerland)
- **Principal Investigators & Curators:**
  - Dr. Chandra Mohan Bhuma (ORCID: `0000-0002-7566-4739`)
  - V M S N Pavan Kumar CH (ORCID: `0000-0002-4354-4185`)
  - Katakam, Venkata Varma Bethala, Sai Vatada, Sambaiah Kagitha
- **Institutional Affiliation:** Bapatla Engineering College, Bapatla, Andhra Pradesh, India
- **Collection Environment:** Multi-sensor capture (Realme 8i 50MP, IQOO Z9 50MP, Vivo T2X 50MP, Redmi Note 13 Pro 200MP) across diverse real-world Indian vehicles (motorcycles, cars, commercial autos).
- **Ground-Truth Data Structure:** Bundled `number_plate.zip` contains uncompressed image files alongside an authoritative Excel sheet mapping `image_name` $\rightarrow$ `actual license plate number`.

### 3.2 Licensing & Legal Clearance
- **Declared License:** **Creative Commons Attribution 4.0 International (`CC-BY 4.0`)**
- **Permitted Rights:**
  - *Sharing:* Copying and redistributing the material in any medium or format.
  - *Adapting:* Remixing, transforming, and building upon the material for any purpose, including evaluation and benchmarking.
  - *Attribution:* Fully satisfied by citing the Zenodo DOI and authors in NETRAVA documentation.
- **Privacy & Redaction Boundary:** The dataset was gathered on public campus and municipal thoroughfares specifically for computer vision research; ground-truth transcripts are already published openly under CC-BY 4.0.

---

## 4. Isolated Directory & Annotation Architecture (Phase C)

To ensure zero collision with version control and production databases, the evaluation corpus is structured as follows:

```
fixtures/datasets/
├── README.md                              # Dataset governance and citation policy
├── evaluation/                            # [GIT-IGNORED] Isolated evaluation workspace
│   ├── manifest.json                      # Cryptographic SHA-256 digests and metadata
│   ├── images/                            # Raw 100-sample evaluation images (.jpg/.png)
│   ├── labels/
│   │   ├── vehicles/                      # YOLO vehicle bounding boxes (.txt): [class x y w h]
│   │   └── plates/                        # YOLO license plate bounding boxes (.txt): [0 x y w h]
│   ├── transcripts/
│   │   └── ground_truth_plates.tsv        # [filename \t clean_plate \t valid_format_flag]
│   └── predictions/                       # Output logs from isolated benchmark runs (.json)
```

### 4.1 Manual Annotation Protocol (No Model Leakage)
Strict adherence to Rule 5 (*"Do not claim accuracy without verified ground-truth labels"*) requires independent label generation:
1. **Zero Model Pre-Labeling:** YOLOv8 or Tesseract must **NEVER** generate initial candidate labels. All ground-truth annotations must originate independently.
2. **Plate Text Ground Truth:** Extracted directly from the authors' verified Excel ledger (`number_plate.xlsx`) and normalized using standard uppercase alphanumeric formatting (`^[A-Z0-9]+$`).
3. **Bounding-Box Annotation Tool:** Use an independent, open-source labeling tool (Label Studio or CVAT).
4. **Two-Pass Verification:**
   - *Pass 1 (Primary Annotator):* Draw tight bounding boxes around vehicle chassis and license plate mounting area.
   - *Pass 2 (Verification Reviewer):* Independently inspect box tightness, verify plate text match against image pixels, and mark occlusion flags.

---

## 5. Security & Isolation Boundaries (Phase D)

1. **Database Safety:** The benchmark execution script (`ai-worker/scripts/benchmark_accuracy.py`) operates strictly offline. It must **not** establish connections to `localhost:5432/gujcamera_db`.
2. **Message Broker Isolation:** The harness must **not** connect to Redis or publish events to `stream:vehicle:sightings`.
3. **Storage Vault Isolation:** No evaluation crops or test frames may be uploaded to MinIO bucket `police-evidence-vault`.
4. **Git Exclusions:** The raw evaluation image binaries are excluded via `.gitignore` to prevent repository bloat and ensure privacy compliance.

---

## 6. Remaining Blockers Before Phase 5.3 Benchmarking

| Blocker Item | Description | Mitigation Action |
| :--- | :--- | :--- |
| **B1: Bounding-Box Annotation** | The Zenodo corpus contains plate text but lacks standardized YOLO bounding boxes for vehicle and plate contours. | Execute two-pass human annotation on a 100-sample evaluation split. |
| **B2: Multi-Frame Temporal Video** | The Zenodo dataset consists of static images; multi-frame consensus filtering requires video sequences. | Separate single-frame ANPR evaluation (Zenodo) from multi-frame consensus evaluation (recorded corridor sequences). |
