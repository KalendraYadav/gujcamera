# NETRAVA — India-First, Vehicle-Balanced Dataset Audit

**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-INDIA-FIRST-DATASET-AUDIT-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Senior Computer Vision Engineer & Dataset Curator  
**Status:** EMPIRICAL AUDIT COMPLETE / NON-DESTRUCTIVE BASELINE ESTABLISHED  

---

## 1. Executive Summary & Objective

This audit investigates the current state, geographic distribution, vehicle category balance, and plate appearance diversity of the NETRAVA evaluation dataset. 

As a CCTV vehicle intelligence platform engineered for deployment across Gujarat and Indian urban centers, NETRAVA requires a ground-truth dataset that authenticates real-world Indian road dynamics. This requires representation across:
1. **Diverse Indian vehicle categories** (two-wheelers, auto-rickshaws, passenger cars, light commercial vehicles, heavy multi-axle trucks, buses, agricultural tractors).
2. **Geographic and registration-region diversity** (stratified across India's 28 states and 8 union territories, avoiding single-state domination).
3. **Registration plate color and format diversity** (private white plates, commercial yellow plates, electric vehicle green plates, commercial rental black plates, and Bharat series).

This audit establishes empirical baselines, proves or disproves earlier assumptions regarding dataset size and balance, verifies the non-negotiable protection of the existing 50 Label Studio tasks, and outlines an evidence-based roadmap for reconstruction.

---

## 2. Answers to the Core Audit Inquiries

```
+--------------------------------------------------------------------------------------------------------+
|                                    EXECUTIVE AUDIT FINDINGS SUMMARY                                    |
+------------------------------------------------------+-------------------------------------------------+
| Audit Question                                       | Empirical Finding & Measured Status             |
+------------------------------------------------------+-------------------------------------------------+
| 1. Does the claimed 700-image selection exist?       | NO. Grep and directory scans prove NO 700-image |
|                                                      | selection manifest or directory exists.         |
| 2. Total source images available locally on disk     | Exactly 100 images (fixtures/datasets/          |
|                                                      | evaluation/images/, 14.80 MB).                  |
| 3. Total images in the original source archive       | Exactly 1,700 images in remote Zenodo archive   |
|                                                      | (DOI: 10.5281/zenodo.13954136, 1.40 GB zip).   |
| 4. Was the full 1,700 archive downloaded & extracted?| NO. Only 100 pilot images were materialized;    |
|                                                      | 1,600 images remain remote on Zenodo.           |
| 5. Candidates with verified Indian context evidence  | Local: 100 / 100 (100%). Remote: 1,696 / 1,700. |
| 6. Images currently included in Label Studio tasks   | Exactly 50 images (Tasks 1 to 50 in Project 2). |
| 7. Tasks with completed human annotations            | Exactly 24 tasks (Tasks 1–24 submitted in DB).  |
| 8. Tasks staged with AI proposals awaiting review    | Exactly 26 tasks (Tasks 25–50 in Project 2).    |
| 9. Unselected verified local images remaining        | Exactly 50 images (PILOT-048 to PILOT-099).     |
| 10. Can the current source support a balanced 700 set?| NO. Zenodo archive is 67% Andhra Pradesh and    |
|                                                      | severely lacks 2-wheelers, 3-wheelers & tractors|
| 11. Were existing 50 tasks & LS data preserved?      | YES. 100% verified, SHA-256 hashed, untouched.  |
+------------------------------------------------------+-------------------------------------------------+
```

---

## 3. Non-Negotiable Protection of the First 50 Tasks

A direct query to the active Label Studio container (`netrava_label_studio`, port 8080) and inspection of persistent Docker volume `netrava_label_studio_data` confirmed:
- **Project 2:** `NETRAVA — Vehicle & Number Plate Annotation Pilot`
- **Total tasks active in Project 2:** **50 tasks** (Task IDs `1` to `50`).
- **Human annotation submissions:** **24 completed tasks** (`task_completion` table in `label_studio.sqlite3`):
  - Tasks 1–10: Phase 5.6/5.7 manual pilot (adjudicated and dual-pass audited).
  - Tasks 11–15: Phase 5.7 AI-assisted pilot slice.
  - Tasks 16–24: Completed human reviews from the 35-task expansion batch.
- **Staged AI prediction tasks:** **26 tasks** (Task IDs `25` to `50`).

### Machine-Readable Preservation Manifest
All 50 image files, resolutions, and cryptographic SHA-256 digests were cataloged in:
[`fixtures/datasets/evaluation/india_first_protected_50_manifest.json`](file:///d:/web%20project/gujcamera/fixtures/datasets/evaluation/india_first_protected_50_manifest.json)

**Preservation Mandate:** No deletion, renaming, volume removal, or automatic re-import may target Tasks 1–50.

---

## 4. Source Dataset Provenance & Inherent Biases

The single currently integrated source is CERN Zenodo Record **13954136**:
- **Dataset Title:** *Number Plate Number Identification Dataset*
- **Author Citation:** DOI `10.5281/zenodo.13954136`
- **License:** Creative Commons Attribution 4.0 International (`CC-BY-4.0`)
- **Collection Methodology:** Explicitly stated in the author's metadata:
  > *"This dataset is collected from various vehicles in the campus of Bapatla Engineering College, and Bapatla town, Andhra Pradesh, India."*

### Implications of Collection Methodology:
1. **Geographic Concentration:** Because images were captured in Bapatla, Andhra Pradesh, **1,141 of the 1,700 images (67.1%)** represent Andhra Pradesh vehicles:
   - `Y` series (Private vehicles): 858 images (50.5%)
   - `C` series (Commercial fleet): 246 images (14.5%)
   - `AP` directory: 37 images (2.2%)
2. **Vehicle Category Skew:** The campus and town collection heavily favored standard passenger cars parked or driving on campus, along with regional freight trucks.
3. **Severe Vehicle Category Deficits:** Two-wheelers (scooters/motorcycles), auto-rickshaws (three-wheelers), agricultural tractors, and construction vehicles are largely omitted.

---

## 5. Geographic and Registration-Region Distribution

Across India's 28 states and 8 union territories, empirical representation was measured across the Zenodo archive, the local 100 images, and the 50 protected tasks:

```
+---------------------------------------------+-------------+------------+--------------+---------------+
| State / Union Territory                     | Zenodo 1700 | Local 100  | Protected 50 | Next Local 50 |
+---------------------------------------------+-------------+------------+--------------+---------------+
| Andhra Pradesh (Private Y Series)           | 858         | 0          | 0            | 0             |
| Andhra Pradesh (Commercial C Series)        | 246         | 4          | 1            | 3             |
| Andhra Pradesh (AP Prefix)                  | 37          | 37         | 37 (74%)     | 0             |
| Assam (AS)                                  | 24          | 24         | 1            | 23 (46%)      |
| Bihar (BR)                                  | 16          | 16         | 0            | 16 (32%)      |
| Arunachal Pradesh (AR)                      | 12          | 12         | 4 (8%)       | 8 (16%)       |
| Andaman and Nicobar Islands (AN)            | 7           | 7          | 7 (14%)      | 0             |
| Delhi (DL)                                  | 35          | 0          | 0            | 0             |
| Meghalaya (ML)                              | 35          | 0          | 0            | 0             |
| Jammu and Kashmir (JK)                      | 33          | 0          | 0            | 0             |
| Gujarat (GJ)                                | 27          | 0          | 0            | 0             |
| Punjab (PB)                                 | 27          | 0          | 0            | 0             |
| West Bengal (WB)                            | 25          | 0          | 0            | 0             |
| Maharashtra (MH)                            | 24          | 0          | 0            | 0             |
| Uttar Pradesh (UP)                          | 24          | 0          | 0            | 0             |
| Odisha (OD)                                 | 22          | 0          | 0            | 0             |
| Haryana (HR)                                | 21          | 0          | 0            | 0             |
| Himachal Pradesh (HP)                       | 20          | 0          | 0            | 0             |
| Karnataka (KA)                              | 20          | 0          | 0            | 0             |
| Chhattisgarh (CG)                           | 19          | 0          | 0            | 0             |
| Jharkhand (JH)                              | 18          | 0          | 0            | 0             |
| Puducherry (PY)                             | 17          | 0          | 0            | 0             |
| Telangana (TS)                              | 16          | 0          | 0            | 0             |
| Goa (GA)                                    | 13          | 0          | 0            | 0             |
| Kerala (KL)                                 | 13          | 0          | 0            | 0             |
| Sikkim (SK)                                 | 13          | 0          | 0            | 0             |
| Madhya Pradesh (MP)                         | 11          | 0          | 0            | 0             |
| Tamil Nadu (TN)                             | 10          | 0          | 0            | 0             |
| Tripura (TR)                                | 10          | 0          | 0            | 0             |
| Uttarakhand (UK)                            | 10          | 0          | 0            | 0             |
| Chandigarh (CH)                             | 9           | 0          | 0            | 0             |
| Dadra and Nagar Haveli (DN)                 | 8           | 0          | 0            | 0             |
| Nagaland (NL)                               | 8           | 0          | 0            | 0             |
| Rajasthan (RJ)                              | 7           | 0          | 0            | 0             |
| Manipur (MN)                                | 5           | 0          | 0            | 0             |
+---------------------------------------------+-------------+------------+--------------+---------------+
| TOTALS                                      | 1,700       | 100        | 50           | 50            |
+---------------------------------------------+-------------+------------+--------------+---------------+
```

### Critical Geographic Observations:
1. **Existing 50 Tasks Are Heavily Skewed:** $74\%$ of the protected 50 tasks are from Andhra Pradesh (`AP`), because the pilot selection chose alphabetically (`AN`, `AP`, `AR`).
2. **Immediate Diversification Opportunity:** The remaining 50 local unselected images are heavily weighted toward Eastern and North-Eastern India: **Assam ($23$)**, **Bihar ($16$)**, and **Arunachal Pradesh ($8$)**.
3. **National Representation in Remote Archive:** If the remaining 1,600 images are downloaded, **31 states and union territories** have authentic representation, but each has only $5$ to $35$ samples.

---

## 6. Vehicle Category Balancing & Shortfall Analysis

Evaluating candidates against the 8 standardized Indian vehicle categories revealed substantial structural deficits:

```
+--------------------------+---------------+--------------+------------+--------------+---------------+
| Category                 | 700 Target %  | 700 Target N | Local 100  | Protected 50 | Gap / Deficit |
+--------------------------+---------------+--------------+------------+--------------+---------------+
| TWO_WHEELER              | 20.0%         | 140          | 1 (1%)     | 1 (2%)       | -139 (SEVERE) |
| THREE_WHEELER            | 15.0%         | 105          | 0 (0%)     | 0 (0%)       | -105 (TOTAL)  |
| FOUR_WHEELER_PASSENGER   | 20.0%         | 140          | 61 (61%)   | 30 (60%)     | Surplus       |
| LIGHT_COMMERCIAL         | 10.0%         | 70           | 0 (0%)     | 0 (0%)       | -70 (HIGH)    |
| HEAVY_COMMERCIAL         | 10.0%         | 70           | 17 (17%)   | 8 (16%)      | -53           |
| BUS                      | 10.0%         | 70           | 8 (8%)     | 3 (6%)       | -62           |
| TRACTOR_AND_AGRICULTURAL | 5.0%          | 35           | 0 (0%)     | 0 (0%)       | -35 (TOTAL)   |
| SPECIAL_AND_OTHER        | 10.0%         | 70           | 0 (0%)     | 0 (0%)       | -70 (TOTAL)   |
| UNKNOWN_VEHICLE_TYPE     | 0.0%          | 0            | 13 (13%)   | 8 (16%)      | (Tight crops) |
+--------------------------+---------------+--------------+------------+--------------+---------------+
```

### Key Engineering Conclusion on Balancing:
**The Zenodo source cannot satisfy the 700-image vehicle balancing quotas on its own.**
Even if all 1,700 images are extracted, three-wheelers, tractors, and two-wheelers remain virtually absent. Attempting to force a 700-image selection from Zenodo alone would violate the balancing directive by padding with additional passenger cars.

---

## 7. Registration Plate Appearance Distribution

```
+----------------------------------+-------------+------------+--------------+---------------+
| Appearance Category              | Zenodo 1700 | Local 100  | Protected 50 | Next Local 50 |
+----------------------------------+-------------+------------+--------------+---------------+
| WHITE_BACKGROUND_BLACK_TEXT      | 1,454 (85%) | 96 (96%)   | 49 (98%)     | 47 (94%)      |
| YELLOW_BACKGROUND_BLACK_TEXT     | 246 (15%)   | 4 (4%)     | 1 (2%)       | 3 (6%)        |
| GREEN_BACKGROUND_WHITE_TEXT (EV) | 0 (0%)      | 0 (0%)     | 0 (0%)       | 0 (0%)        |
| BLACK_BACKGROUND_WHITE_TEXT (Rent| 0 (0%)      | 0 (0%)     | 0 (0%)       | 0 (0%)        |
| OTHER_OR_SPECIAL (Defense/Dipl)  | 0 (0%)      | 0 (0%)     | 0 (0%)       | 0 (0%)        |
+----------------------------------+-------------+------------+--------------+---------------+
```

### Plate Appearance Findings:
- Private white plates and commercial yellow plates are the only variants present in the Zenodo dataset.
- Green EV plates and self-drive rental black plates are completely absent from this 2024 source.

---

## 8. Immediate Next Batch Potential (100–200 Images)

### From Current Local Storage (Immediate, Zero Download):
- Exactly **50 verified images** are available on disk right now in `fixtures/datasets/evaluation/images/` (`PILOT-048` to `PILOT-099`).
- Geographic distribution: **23 Assam**, **16 Bihar**, **8 Arunachal Pradesh**, **3 Commercial**.
- All 50 are verified Indian road vehicles. Staging this batch would bring the total annotated/staged corpus to **100 images** while introducing critical East/North-East regional diversity.

### From Remote Archive (Requires Download of 1.40 GB):
- If `number_plate.zip` is downloaded and extracted, approximately **100–150 non-Andhra Pradesh images** across Gujarat (`GJ`), Maharashtra (`MH`), Delhi (`DL`), Punjab (`PB`), and Uttar Pradesh (`UP`) can be selected with stratified caps (max 15–20 per state).
- This would expand the corpus to 200–250 verified images across 25+ states.

---

## 9. Recommended Supplementary Sources for Gap Remediation

To satisfy the 700-image targets for missing categories (Two-Wheelers, Auto-Rickshaws, Tractors, EV plates), credible India-first open research datasets should be integrated in Phase 5.12:

1. **Indian Driving Dataset (IDD) / AutoNue (IIIT Hyderabad):**
   - High-density CCTV and dashcam scenes covering auto-rickshaws, motorcycles, and tractors in Indian urban and rural contexts. Open academic research license.
2. **Open-ALPR India / Roboflow Universe (India Traffic BBox Datasets):**
   - Verified CC-BY annotations with explicit classes for auto-rickshaws, two-wheelers, and commercial tempos.
3. **Mahanagar Traffic Feeds (Gujarat Police CCTV Corpus):**
   - Direct sample extractions from Ahmedabad, Surat, and Gandhinagar junction cameras to anchor models directly on Gujarat jurisdiction plates and local vehicle types.
