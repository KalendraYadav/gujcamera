# NETRAVA — Phase 5.7: Human Annotation Tool Integration & Execution Readiness Guide
**Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `NETRA-DOC-PHASE5-7-TOOL-INTEGRATION-2026-V1`  
**Security Classification:** Evaluation & Dataset Engineering Operational Standard  
**Role:** Senior Computer-Vision Dataset Engineer & Annotation Workflow Specialist  
**Status:** READY FOR HUMAN EXECUTION / AWAITING HUMAN OPERATOR SESSIONS  

---

## 1. Executive Summary & Tool Selection Audit

Phase 5.7 establishes the operational integration between external visual annotation tooling and the NETRAVA ground-truth verification pipeline for the **10-Image Human Annotation Pilot**.

### 1.1 Tool Selection & Environmental Audit
During environment discovery, neither **Label Studio** nor **CVAT** was detected as pre-installed on the local host or container network.

#### Selected Workflow: Label Studio (Recommended Standard)
We recommend **Label Studio** (`v1.12+`) as the primary visual annotation interface for the following architectural reasons:
1. **Zero-Friction Local Deployment:** Runs with a single command via Python (`pip install label-studio && label-studio start --port 8080`) or Docker (`docker run -d -p 8080:8080 heartexlabs/label-studio:latest`).
2. **Configurable XML UI:** Supports simultaneous spatial bounding boxes, categorical flags, and structured transcript inspection dropdowns within a single synchronized view.
3. **Structured JSON Interchange:** Imports and exports clean JSON payloads, eliminating proprietary binary dependencies.
4. **Offline / Standalone Compatibility:** Allows local file serving (`LOCAL_FILES_SERVING_ENABLED=true`) without external network transmission.

---

## 2. 10-Image Import Package Architecture

The import package is located in `fixtures/datasets/evaluation/annotations/tool_integration/` (strictly excluded from Git via `.gitignore`):

```
fixtures/datasets/evaluation/annotations/tool_integration/
├── label_studio_import_tasks.json     # 10 verified evaluation tasks ready for tool import
├── label_studio_interface.xml         # XML labeling interface definition
└── transcript_sidecar_ledger.json     # Immutable sidecar mapping sample IDs to SHA-256 hashes
```

### 2.1 Verified Sample Inventory
Each of the 10 selected samples was independently verified against physical files on disk:

| Sample ID | Image Filename | Canvas Geometry | Format | File Status | Sidecar Transcript SHA-256 (Prefix) |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`PILOT-001`** | `AN1.png` | $272 \times 575$ | PNG | **Verified on Disk** | `94eade71fbf1...` (9 chars) |
| **`PILOT-004`** | `AN4.png` | $272 \times 363$ | PNG | **Verified on Disk** | `90ea1a172fd7...` (7 chars) |
| **`PILOT-008`** | `AP1.png` | $272 \times 204$ | PNG | **Verified on Disk** | `de514ae19676...` (10 chars) |
| **`PILOT-014`** | `AP16.png` | $272 \times 153$ | PNG | **Verified on Disk** | `80a7708c53ee...` (10 chars) |
| **`PILOT-020`** | `AP21.png` | $272 \times 173$ | PNG | **Verified on Disk** | `eef277abd169...` (10 chars) |
| **`PILOT-035`** | `AP41.png` | $271 \times 327$ | PNG | **Verified on Disk** | `de32d5bd6922...` (9 chars) |
| **`PILOT-045`** | `AR1.png` | $272 \times 153$ | PNG | **Verified on Disk** | `021f5deb299b...` (8 chars) |
| **`PILOT-055`** | `AR8.png` | $272 \times 592$ | PNG | **Verified on Disk** | `f837ee024558...` (8 chars) |
| **`PILOT-070`** | `AS22.png` | $272 \times 481$ | PNG | **Verified on Disk** | `2876c0ea6df4...` (10 chars) |
| **`PILOT-100`** | `C (101).png` | $400 \times 267$ | PNG | **Verified on Disk** | `8ae1590d87f6...` (7 chars) |

*Zero Plaintext Exposure:* In compliance with data privacy mandates, plaintext vehicle registration numbers are omitted from all files, logs, and reports.

---

## 3. Label Studio Interface Configuration

The labeling interface configuration is defined in `label_studio_interface.xml`:

```xml
<View>
  <Header value="NETRAVA Phase 5.7: Ten-Image Human Annotation Pilot" size="4"/>
  <Text name="task_metadata" value="Sample ID: $sample_id | File: $image_filename | Resolution: $image_width x $image_height | Transcript Length: $char_length chars" underline="true"/>
  
  <Image name="image" value="$image" zoom="true" zoomBy="1.5" rotateControl="true"/>

  <Header value="1. Spatial Localization (Bounding Boxes)" size="5"/>
  <RectangleLabels name="bbox_labels" toName="image" canRotate="false">
    <Label value="vehicle" background="#1D4ED8"/>
    <Label value="license_plate" background="#DC2626"/>
  </RectangleLabels>

  <Header value="2. Vehicle Body Absence Explanation (Required if no vehicle box drawn)" size="5"/>
  <Choices name="vehicle_unboundable_reason" toName="image" showInline="true">
    <Choice value="CROP_ONLY_NO_CHASSIS" hint="Image is a tight crop of the license plate mounting area; no vehicle body visible"/>
    <Choice value="SEVERE_OCCLUSION" hint="Vehicle chassis is fully occluded by external obstruction"/>
  </Choices>

  <Header value="3. License Plate Visual Quality Flags" size="5"/>
  <Choices name="plate_flags" toName="image" choice="multiple" showInline="true">
    <Choice value="is_truncated" hint="Plate boundary extends outside image frame"/>
    <Choice value="is_occluded" hint="Characters covered by tow bar, frame, strap, or dirt"/>
    <Choice value="is_blurred" hint="Motion blur or optical defocus impairs character edge sharpness"/>
    <Choice value="is_difficult" hint="Severe lighting glare, deep shadows, or low contrast"/>
  </Choices>

  <Header value="4. Authoritative Transcript Verification" size="5"/>
  <Choices name="transcript_verification" toName="image" required="true" showInline="true">
    <Choice value="VERIFIED_MATCH" hint="Every visible character matches the authoritative ledger transcript exactly"/>
    <Choice value="MISMATCH" hint="Plate is legible but characters differ from ledger (document in notes)"/>
    <Choice value="UNREADABLE" hint="Severe degradation prevents reliable human recognition of characters"/>
    <Choice value="NEEDS_SECOND_REVIEW" hint="Glyph ambiguity (e.g. 8 vs B, 0 vs D) requires independent second opinion"/>
  </Choices>

  <Header value="5. Human Review Notes" size="5"/>
  <TextArea name="notes" toName="image" rows="2" placeholder="Record character mismatch details, occlusion notes, or second-review reasoning..."/>
</View>
```

---

## 4. Coordinate Conversion & Ingestion Engine

When an annotator exports completed records from Label Studio, the conversion engine (`fixtures/datasets/evaluation/convert_tool_annotations.py`) transforms tool outputs into NETRAVA's strict schema:

### 4.1 Mathematical Transformation
Label Studio exports spatial geometry as percentage offsets $(x, y, w, h \in [0, 100])$. The converter transforms these into 0-indexed absolute integer pixel coordinates $[x_1, y_1, x_2, y_2]$:

$$x_1 = \text{int}\left(\text{round}\left(\frac{x}{100.0} \times W\right)\right)$$
$$y_1 = \text{int}\left(\text{round}\left(\frac{y}{100.0} \times H\right)\right)$$
$$x_2 = \text{int}\left(\text{round}\left(\frac{x + w}{100.0} \times W\right)\right)$$
$$y_2 = \text{int}\left(\text{round}\left(\frac{y + h}{100.0} \times H\right)\right)$$

### 4.2 Boundary Protection & Clamping
The engine clamps all coordinates:
$$0 \le x_1 < x_2 \le W \quad \text{and} \quad 0 \le y_1 < y_2 \le H$$
Zero-width, inverted, or out-of-bounds boxes are rejected immediately.

### 4.3 Sidecar Transcript Binding
The visual tool does **not** store or edit the authoritative ground-truth transcript hash. Instead, the ingestion engine looks up the sample ID in `transcript_sidecar_ledger.json` and immutably binds:
- `authoritative_transcript_sha256`
- `char_length`
- Human inspection decision: `VERIFIED_MATCH`, `MISMATCH`, `UNREADABLE`, or `NEEDS_SECOND_REVIEW`

---

## 5. End-to-End Human Execution Lifecycle

1. **Start Label Studio:**
   ```bash
   pip install label-studio
   export LABEL_STUDIO_LOCAL_FILES_SERVING_ENABLED=true
   label-studio start --port 8080
   ```
2. **Project Setup:**
   - Create project: `NETRAVA-Phase5.7-Pilot`.
   - In **Labeling Interface**, paste `label_studio_interface.xml`.
   - In **Data Import**, upload `label_studio_import_tasks.json`.
3. **Human Annotation:**
   - Real human reviewer opens each image.
   - Encloses visible vehicle chassis (or selects `CROP_ONLY_NO_CHASSIS`).
   - Encloses physical license plate.
   - Marks applicable quality flags.
   - Compares physical plate characters against authoritative transcript and assigns verification status.
   - Submits task.
4. **Export & Ingestion:**
   - Export project as JSON: `label_studio_export.json`.
   - Run ingestion converter:
     ```bash
     python fixtures/datasets/evaluation/convert_tool_annotations.py label_studio_export.json
     ```
   - Run validator:
     ```bash
     python fixtures/datasets/evaluation/validate_annotations.py
     ```
5. **Second-Pass Routing:**
   - Completed first-pass records are saved to `first_pass/records/<sample_id>.json`.
   - Independent second reviewer inspects image blind, compares with first-pass submission, resolves disagreements, and signs off.

---

## 6. Safety & Immutability Verification

- **Judge-Demo Database:** Verified strictly unmodified:
  - `cameras`: 15
  - `vehicle_sightings`: 16
  - `alerts`: 1
  - `watchlists`: 2 (`watchlist_entries`: 3)
- **External Services:** Zero queries or writes to MinIO, Redis, or PostgreSQL.
- **Git Hygiene:** All evaluation datasets, images, manifests, work items, and tool packages remain strictly gitignored under `fixtures/datasets/evaluation/`.
- **Privacy Protections:** Zero plaintext vehicle registration numbers in logs or code.
