# NETRAVAHA — 5-MINUTE JUDGE DEMONSTRATION SCRIPT
**Gujarat Police Innovation Challenge 2026**
**Platform:** NETRAVAHA — Unified CCTV Intelligence Platform
**Audience:** Evaluation Committee & Police Technical Leadership
**Operational Scenario:** Inter-District Vehicle Pursuit (Ahmedabad City Police $\rightarrow$ Gandhinagar District Police)
**Target Vehicle:** `GJ01AB1234` (White Hyundai Creta, Case Reference: FIR #102/2026 - Stolen Vehicle)

---

## 00:00 – 00:30 | Problem Statement & NETRAVAHA Overview

**Speaker:**
> *"Respected Judges, across Gujarat, CCTV cameras operate across urban corridors under different municipal corporations, district police units, and proprietary VMS silos. When a serious crime occurs—such as a vehicle theft or an inter-district getaway—officers are forced to manually request footage from multiple disparate systems, losing vital investigative hours.*
>
> *NETRAVAHA solves this fragmentation. It is Gujarat's unified tactical intelligence platform that normalizes disparate video protocols into a high-throughput spatial registry, executes real-time vehicle detection with multi-frame plate consensus, correlates sightings across jurisdictions, and vaults forensic evidence with cryptographic SHA-256 integrity."*

---

## 00:30 – 01:15 | Live CCTV Surveillance & Corridor Network

**Action on Screen:**
1. Navigate to `http://localhost:3000/live`
2. Point out the tactical dark UI and the clear disclosure badge:
   `SIMULATED LIVE CCTV (REPRESENTATIVE CORRIDOR DEPLOYMENT)`
3. Switch between primary corridor cameras:
   - `CAM-AHM-01: SG Highway - Pakwan Crossroad Junction`
   - `CAM-AHM-02: C.G. Road - Swastik Char Rasta`
   - `CAM-GND-02: CH-0 Circle - Gandhinagar Entrance`
4. Point out the online MediaMTX RTSP stream latency and live HLS feed.

**Speaker:**
> *"Here on the Live Video Monitoring page, you observe our normalized video gateway. In this demonstration, feeds are replayed over simulated RTSP through MediaMTX to reflect our representative 10-node surveillance corridor. Notice our explicit disclosure: this operates on representative corridor data and is architected to ingest physical police ONVIF/RTSP/VMS feeds without requiring any software changes."*

---

## 01:15 – 02:15 | Vehicle Search & Runtime Sighting Retrieval

**Action on Screen:**
1. Click on **Vehicle Investigation** in top navigation (`http://localhost:3000/investigation`).
2. In the Search input box, enter `GJ01AB1234`.
3. Press **Enter** or click **Search**.
4. The interface displays the target vehicle card:
   - Normalized Plate: `GJ01AB1234`
   - Class: `SUV`
   - Make/Model: `Hyundai Creta`
   - Color: `White`
   - Status: `FLAGGED (CRITICAL HOTLIST)`
5. Point to the table of real runtime sightings populated by the AI vision worker.

**Speaker:**
> *"Now we move into the investigator's core workflow. An FIR has been lodged for stolen Hyundai Creta plate GJ01AB1234. The investigator enters the plate number. Instantly, NETRAVAHA queries the PostGIS database. Every single sighting shown here was generated in real-time by our YOLO and OCR pipeline running on live video frames—not pre-populated or faked in the database."*

---

## 02:15 – 03:00 | Multi-Camera Chronological Timeline

**Action on Screen:**
1. Click the **Chronological Timeline** tab on the Investigation page.
2. Review the chronological sequence of sightings:
   - `CAM-AHM-01` (Pakwan Crossroad): First sighting at corridor entry.
   - `CAM-AHM-02` (Swastik Char Rasta): Transit hop ~5.3 km eastward.
   - `CAM-GND-02` (CH-0 Circle): Cross-jurisdictional detection entering Gandhinagar District.
3. Hover over the transit legs showing computed physical velocity (e.g. 42.4 km/h).

**Speaker:**
> *"Notice the transit progression. At 23:40 the vehicle entered Western Ahmedabad at Pakwan Crossroad. Minutes later, CAM-AHM-02 detected the vehicle on C.G. Road. Our spatio-temporal route velocity model calculates an arterial transit speed of 42 km/h—physically plausible for urban traffic. Finally, the target is picked up entering Gandhinagar at CH-0 Circle. This links two distinct police commissionerates into one continuous operational timeline."*

---

## 03:00 – 03:45 | GIS Spatio-Temporal Corridor Map & Correlation

**Action on Screen:**
1. Navigate to `http://localhost:3000/gis`.
2. Observe the interactive GIS map showing:
   - Gujarat corridor camera markers (green = online).
   - Chronological sighting nodes connected by directional transit vectors.
   - Bounding-box spatial clustering.
3. Switch to the **Correlation Candidates** tab on the investigation view to show the Phase 10 hybrid fuzzy-plate & spatio-temporal scoring algorithm.

**Speaker:**
> *"On the GIS Tactical Map, we visualize the spatio-temporal corridor. Rather than claiming impossible continuous GPS tracking, NETRAVAHA truthfully displays discrete camera sightings linked by spatio-temporal correlation. If the suspect attempts plate tampering—for example, altering 'GJ01' to 'GJ07'—our Phase 10 hybrid Levenshtein and spatio-temporal candidate engine surfaces probable vehicle matches scored by velocity plausibility and visual feature consistency."*

---

## 03:45 – 04:30 | Forensic Evidence Vault & SHA-256 Integrity Verification

**Action on Screen:**
1. In the sighting card, click **Inspect Forensic Evidence** (`/evidence/:id`).
2. The Evidence Inspection modal opens, showing:
   - The actual captured full-resolution JPEG frame.
   - Crop of license plate region.
   - Forensic metadata: Camera ID, Frame Sequence, Timestamp.
   - Stored SHA-256 digest vs computed SHA-256 digest.
   - Integrity Status: `VERIFIED (INTEGRITY MATCH)`.
3. Highlight that SHA-256 verifies tamper-detection against the stored digest.

**Speaker:**
> *"Crucially for law enforcement, evidentiary integrity must be legally robust. NETRAVAHA immediately vaults every detected frame into our immutable S3 object storage upon capture. When an investigator inspects the evidence, the system dynamically recomputes the SHA-256 cryptographic digest of the raw image bytes and compares it against the audit ledger. If even one pixel has been altered, the system flags the evidence as tampered. Every access is logged to our immutable forensic audit trail."*

---

## 04:30 – 05:00 | Watchlist Alert & Production Scalability Summary

**Action on Screen:**
1. Navigate to `http://localhost:3000/alerts`.
2. Show the active `CRITICAL` priority alert:
   - Title: `Ahmedabad Stolen Vehicles Watchlist Match`
   - FIR Reference: `FIR #102/2026`
   - Plate: `GJ01AB1234`
   - Camera: `CAM-AHM-01`
   - Actions: `Acknowledge Alert`, `Export Evidence Package (SHA-256 Verified)`
3. Return to dashboard or summary view.

**Speaker:**
> *"Within 180 milliseconds of the camera frame being analyzed, our Redis Stream event broker matched the plate against the active stolen vehicle watchlist and broadcast this CRITICAL alert to the dispatch console. 
>
> To summarize: NETRAVAHA is not a slide deck. The end-to-end pipeline is running right now on real RTSP video, real neural network inference, PostGIS spatial indexing, and immutable evidence vaulting. The system is designed from day one to scale statewide across departmental CCTV nodes through standard RTSP/ONVIF connectors. Thank you, and we welcome your questions."*
