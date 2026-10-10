# NETRAVA — India-First, Vehicle-Balanced Dataset Reconstruction Plan

**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-INDIA-FIRST-RECONSTRUCTION-PLAN-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Cautious Data-Pipeline Architect & Senior Computer Vision Engineer  
**Status:** RECONSTRUCTION ROADMAP APPROVED / NON-DESTRUCTIVE PHASED EXECUTION  

---

## 1. Overview & Phased Roadmap

This plan establishes a cautious, step-by-step methodology to reconstruct the NETRAVA ground-truth evaluation corpus into a balanced, India-first benchmark without disrupting existing Label Studio work.

```
+----------------------------------------------------------------------------------------------------+
|                           NETRAVA DATASET RECONSTRUCTION WORKFLOW                                  |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [PHASE 1: AUDIT & FREEZE] (Completed)                                                             |
|  - Audit local 100 images & remote 1,700 archive.                                                  |
|  - Generate `india_first_protected_50_manifest.json` (SHA-256 hashed).                            |
|  - Disprove existence of phantom 700-image selection.                                              |
|                                 │                                                                  |
|                                 ▼                                                                  |
|  [PHASE 2: IMMEDIATE LOCAL EXPANSION (Tasks 51–100)] (Ready to Execute)                             |
|  - Package remaining 50 local images (Assam 23, Bihar 16, Arunachal 8, Commercial 3).              |
|  - Run enhanced prediction generator (with plate safety guards & NMS).                            |
|  - Generate `label_studio_import_tasks_51_to_100.json`.                                            |
|  - Zero downloads required; breaks the Andhra Pradesh geographic monopoly.                         |
|                                 │                                                                  |
|                                 ▼                                                                  |
|  [PHASE 3: STRATIFIED ARCHIVE EXTRACTION (150–200 Images)]                                         |
|  - Download Zenodo archive `number_plate.zip` (1.40 GB) via resumable script.                     |
|  - Discard AP surplus; extract stratified quota (max 15–20 per state).                            |
|  - Ingest GJ (Gujarat), MH (Maharashtra), DL (Delhi), UP, PB, etc.                                 |
|                                 │                                                                  |
|                                 ▼                                                                  |
|  [PHASE 4: SUPPLEMENTARY SOURCE INTEGRATION (Filling Category Gaps)]                              |
|  - Integrate open India datasets (IDD / CC-BY) for missing Two-Wheelers, Three-Wheelers & Tractors.|
|  - Attain 700-image vehicle balancing quotas (20% 2W, 15% 3W, 20% Car, 10% LCV, 10% Truck).       |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Immediate Next Action: Staging Tasks 51 to 100

### 2.1 Why Tasks 51–100 Must Be Next
- Exactly **50 verified images** exist locally in `fixtures/datasets/evaluation/images/` that have not been imported into Label Studio.
- They require **zero internet bandwidth** and **zero external downloading**.
- They resolve the acute regional bias of Tasks 1–50 (which was $74\%$ Andhra Pradesh):
  - **Assam (`AS`):** 23 images
  - **Bihar (`BR`):** 16 images
  - **Arunachal Pradesh (`AR`):** 8 images
  - **Commercial Fleet (`C`):** 3 images
- Task IDs run strictly from **`51` to `100`**, ensuring **zero collision** with Tasks 1–50.

### 2.2 Task ID Mapping Table (Tasks 51–100)

| Task ID Range | Sample ID Range | Image Filenames | State / Jurisdiction | Proposed Processing |
| :---: | :---: | :---: | :---: | :---: |
| **51–58** | `PILOT-048` .. `PILOT-054`, `PILOT-056` | `AR12.png` .. `AR9.png` | Arunachal Pradesh (8) | YOLO + Plate Guard + OCR Gate |
| **59–81** | `PILOT-057` .. `PILOT-069`, `PILOT-071` .. `PILOT-080` | `AS1.png` .. `AS24.png` | Assam (23) | YOLO + Plate Guard + OCR Gate |
| **82–97** | `PILOT-081` .. `PILOT-096` | `BR1.png` .. `BR16.png` | Bihar (16) | YOLO + Plate Guard + OCR Gate |
| **98–100**| `PILOT-097` .. `PILOT-099` | `C (1).png`, `C (10).png`, `C (100).png` | Commercial Fleet (3) | YOLO + Plate Guard + OCR Gate |

---

## 3. Long-Term 700-Image Balancing Strategy

### 3.1 Resolving the 67% Andhra Pradesh Bias
Under [`india_first_selection_config.json`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/india_first_selection_config.json), a **5% state cap** (maximum 35 images per state or union territory) is enforced.
- Although Zenodo contains 1,141 Andhra Pradesh images, **only 35 will be retained** in the final 700-image selection.
- The remaining quota will be drawn from the 33 other states/UTs in Zenodo and supplementary Indian corpora.

### 3.2 Resolving the Missing Vehicle Categories
To satisfy the provisional targets:
- **Two-Wheelers (Target: 140):** Sourced from the Indian Driving Dataset (IDD) and Open-ALPR India motorcycle subsets.
- **Three-Wheelers / Auto-Rickshaws (Target: 105):** Sourced from IDD AutoNue auto-rickshaw splits.
- **Tractors & Agricultural (Target: 35):** Sourced from rural India CCTV/highway surveillance subsets.
- **Passenger Cars (Target: 140):** Readily satisfied from Zenodo (`Y` series and state folders).
- **Heavy Commercial Trucks (Target: 70):** Readily satisfied from Zenodo and local `BR`/`AS` freight images.
- **Buses (Target: 70):** Sourced from state transport corporation (STC) bus images in Zenodo and IDD.

---

## 4. Preservation & Non-Destructive Invariant Rules

1. **Volume Preservation:** Docker volume `netrava_label_studio_data` must not be pruned, recreated, or detached.
2. **Immutable Task IDs:** Tasks 1–50 must retain their assigned IDs. Any new import package must strictly begin at Task ID `51` or higher.
3. **Draft Proposal Status:** All AI-assisted imports must be loaded into `"predictions"`, never into `"annotations"`, preserving human auditability.
4. **Zero Plaintext Registration Numbers:** Privacy safeguards remain enforced across all reports and scripts.
