# NETRAVAHA — Judge Q&A Technical Preparation
**Gujarat Police Innovation Challenge 2026**  
**Document Reference:** `docs/JUDGE_QA_PREPARATION.md`  
**Classification:** Technical Defense & Architectural Fact Sheet  
**Status:** READY FOR FINAL EVALUATION DEFENSE

---

### 1. What problem does NETRAVAHA solve?
**Answer:** NETRAVAHA solves the problem of jurisdictional fragmentation and manual investigation delays across Gujarat's massive CCTV ecosystem. Today, disparate municipal corporations, district headquarters, and national highway authorities operate isolated camera networks with incompatible protocols and proprietary VMS software. When a suspect or stolen vehicle traverses district boundaries (such as Ahmedabad City into Gandhinagar District), officers face hours of manual footage extraction, differing formats, and fragmented coordination. NETRAVAHA provides a unified, federated CCTV intelligence platform that standardizes camera discovery, runs automated edge-based ANPR and spatio-temporal transit correlation, protects evidence integrity with cryptographic hashing, and presents actionable inter-district pursuit intelligence in a single glass pane.

---

### 2. Are these real Gujarat Police CCTV feeds?
**Answer:** **No.** In this evaluation environment, all camera feeds are **simulated live CCTV feeds** running over standard TCP RTSP through our MediaMTX video streaming gateway. While the camera locations, geographic coordinates, corridor layout (e.g., Pakwan Crossroad on SG Highway, Swastik Char Rasta on C.G. Road, CH-0 Circle Gandhinagar), and surveillance scenarios reflect realistic Gujarat Police deployment corridors, the video streams are looped high-definition surveillance test fixtures. Connecting to production police networks or government CCTV command centres is strictly prohibited without formal administrative sanction, security vetting, and isolated network accreditation.

---

### 3. Why are you using simulated CCTV?
**Answer:** For three essential legal and technical reasons:
1. **Statutory & Operational Security:** Real police surveillance networks operate inside air-gapped government intranets (such as GSWAN/GSWAN-2) with sensitive PII and active ongoing investigations; external access during competition evaluation is illegal and unconstitutional.
2. **Reproducibility & Fair Benchmarking:** Evaluation requires deterministic, reproducible test scenarios where all evaluators see the exact same vehicle movements, transit speeds, and edge cases.
3. **Safety & Zero Disruption:** Developing and testing stream ingestion, disconnect recovery, and load limits against live police infrastructure risks disrupting actual law enforcement operations.

---

### 4. How will this connect to real government cameras?
**Answer:** In production deployment, NETRAVAHA connects via **Regional Edge Gateways** deployed within authorized police and municipal control rooms (Command and Control Centres / Netram CCCs). These regional gateways interface directly with the local VMS (Video Management System) or NVR/DVR arrays via secure local network interfaces. Streams are ingested via RTSP/RTP or ONVIF Profile S/G/T directly from authorized internal IP subnets. No physical camera needs to be exposed to the public internet; all traffic between regional edge nodes and the central NETRAVAHA cluster traverses encrypted mTLS tunnels over the Gujarat State Wide Area Network (GSWAN).

---

### 5. What protocols are supported?
**Answer:**
- **Streaming Ingestion:** RTSP (Real-Time Streaming Protocol over TCP), HLS (HTTP Live Streaming for secure browser playback), and WebRTC (low-latency operator previews).
- **Camera Discovery & Device Control:** ONVIF (Open Network Video Interface Forum) Profile S (basic video streaming) and Profile G/T (event handling and PTZ discovery).
- **Event Messaging:** Redis Streams (asynchronous, backpressure-managed distributed event log) and WebSockets (RFC 6455) for sub-second frontend push notifications.
- **REST & Security:** HTTPS/REST with OpenAPI 3.0, JSON Web Tokens (JWT), and AWS S3-compatible API for object storage.

---

### 6. Why RTSP?
**Answer:** RTSP (RFC 2326 / RFC 7826) is the universal, vendor-neutral surveillance standard supported by virtually 100% of commercial IP cameras, NVRs, and municipal VMS systems (Hikvision, Dahua, Axis, Hanwha, Bosch, Milestone, Genetec). Using RTSP over TCP avoids proprietary vendor SDK lock-in, eliminates licensing fees for proprietary drivers, guarantees packet-loss resilience over lossy municipal backhauls, and enables standardized demuxing via FFmpeg and OpenCV.

---

### 7. What role does ONVIF play?
**Answer:** ONVIF provides standardized IP device discovery, capability interrogation, credential validation, and PTZ (Pan-Tilt-Zoom) management across heterogeneous multi-vendor camera fleets. Instead of manually entering camera parameters, NETRAVAHA's `OnvifConnectorAdapter` queries WS-Discovery and ONVIF Device/Media services to automatically retrieve available video stream URIs, supported codecs (H.264/H.265), native resolutions, frame rates, and physical device serial numbers.

---

### 8. What happens when a camera goes offline?
**Answer:** NETRAVAHA employs a multi-tiered failover and health tracking architecture:
1. **Gateway Detection:** MediaMTX and the backend `CameraHealthPollerService` continuously monitor stream heartbeats, socket readiness, and frame ingestion rates every 30 seconds.
2. **Status Degradation:** When frame delivery halts or socket timeout occurs, the camera state transitions from `ONLINE` to `DEGRADED` or `OFFLINE` in PostgreSQL, and an operational telemetry alert is logged.
3. **Exponential Backoff:** The AI Stream Consumer terminates the stalled decode loop and enters an exponential backoff retry cycle (base: 2.0s, cap: 30.0s, jitter enabled) to prevent thundering-herd network collapse.
4. **UI Notification:** The frontend Live CCTV grid and GIS map update in real-time via WebSockets, rendering an amber/red offline badge so operators immediately know coverage is lost.
5. **Auto-Recovery:** The instant the stream becomes available again, the gateway reconnects, restores the worker thread, updates PostgreSQL to `ONLINE`, and resumes live AI inferencing without requiring any backend or frontend restart.

---

### 9. How does vehicle search work?
**Answer:** Vehicle search in NETRAVAHA operates across two synchronized index layers:
1. **Relational & Prefix Search:** License plates are normalized using standard Indian HSRP rules (uppercase alphanumeric, whitespace/hyphen stripped, e.g., `GJ-01-AB-1234` $\rightarrow$ `GJ01AB1234`). PostgreSQL B-tree indices on `plate_normalized` and trigram GiST indices enable sub-10ms exact and fuzzy prefix lookups.
2. **Temporal & Spatial Scoping:** Queries can be filtered by time window, jurisdictional police department (hierarchical CTE query), and geographic bounding radius using PostGIS spatial indexing (`ST_DWithin` on camera geography points).

---

### 10. How does cross-camera correlation work?
**Answer:** Cross-camera correlation in NETRAVAHA is built on **Spatio-Temporal Plausibility Analysis**. When sightings of a plate occur across multiple cameras:
1. Sightings are sorted chronologically: $S_1(t_1, x_1, y_1) \rightarrow S_2(t_2, x_2, y_2) \rightarrow \dots \rightarrow S_n(t_n, x_n, y_n)$.
2. For each consecutive hop, the system calculates geographic distance using PostGIS spherical distance (`ST_DistanceSphere`) and computes implied transit velocity: $v = \frac{\Delta d}{\Delta t}$.
3. If implied velocity is physically realistic for the corridor (e.g., $15 \text{ km/h} \le v \le 120 \text{ km/h}$), the hop is assigned a high plausibility confidence score.
4. If implied velocity exceeds physical limits (e.g., $400 \text{ km/h}$), the system flags an anomaly (potential cloned plate or duplicate registration).
5. The resulting trajectory is visualized on GIS as a connected corridor path with hops, transit times, and directional arrows.

---

### 11. Is this continuous GPS tracking?
**Answer:** **No, absolutely not.** It is vital to understand that CCTV intelligence is **discrete spatio-temporal observation**, not continuous GPS telematics. A vehicle is only observed when it physically passes within the optical field of view of a registered surveillance camera. Between cameras, the system has no knowledge of the vehicle's exact path, side turns, or stops. NETRAVAHA makes this distinction explicitly visible in the UI with a permanent legal and operational disclaimer: *"Observed movement between camera observations; does not represent an exact physical driving route or turn-by-turn navigation."*

---

### 12. Can the system prove that two observations are the same physical vehicle?
**Answer:** **No, and the system never claims to.** Identical license plates can be observed on different vehicles due to stolen number plates, cloned plates, counterfeit registrations, or OCR classification errors. NETRAVAHA provides evidentiary linkage of *observations*, including high-resolution evidence snapshots, vehicle make/model/color classification, and velocity plausibility. Final physical attribution remains the strict responsibility of investigating police officers and forensic examiners.

---

### 13. How does the AI handle OCR errors?
**Answer:** NETRAVAHA uses a **Multi-Frame Consensus Aggregator**:
1. Single-frame OCR is inherently vulnerable to motion blur, glare, partial occlusion, and character confusion (e.g., '8' vs 'B', '0' vs 'D').
2. Instead of publishing single-frame inferences, the worker maintains a rolling temporal window (5–8 frames within 3.0 seconds).
3. The consensus engine requires at least 3 high-confidence observations with a minimum agreement ratio ($\ge 60\%$) across frames before accepting a candidate plate.
4. In fallback environments without GPU acceleration, heuristic character sanity checks (standard 10-character Indian plate syntax `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`) prevent garbage strings from entering the database.

---

### 14. How is evidence integrity verified?
**Answer:** NETRAVAHA implements a verifiable cryptographic chain of custody:
1. The exact video frame that triggered the multi-frame consensus detection is captured directly from memory.
2. An unalterable **SHA-256 cryptographic digest** is computed immediately across the raw JPEG binary bytes.
3. The image is uploaded to the MinIO S3 Forensic Vault (`police-evidence-vault`).
4. The exact SHA-256 hash, S3 URI, camera ID, and timestamp are committed to the PostgreSQL `evidence` table.
5. In the UI Evidence Vault, officers can click **Verify Integrity**: the backend retrieves the raw binary from S3, re-computes the SHA-256 digest on the fly, and compares it byte-for-byte against the immutable database record. If a single bit has been altered, verification fails immediately.

---

### 15. Does SHA-256 prove legal admissibility?
**Answer:** **No.** SHA-256 proves **mathematical integrity** (that the stored binary payload has not been modified, corrupted, or tampered with since the moment of capture). Legal admissibility under Indian law (Section 65B of the Indian Evidence Act / Section 63 of Bharatiya Sakshya Adhiniyam, 2023) requires:
- Formal certification signed by the lawful custodian of the computer system,
- Proof of continuous lawful control and operational condition of the recording equipment,
- Documented audit logs showing who accessed, exported, or handled the record.  
NETRAVAHA provides the required technical artifacts (immutable audit trails, raw SHA-256 hashes, export packages) to *substantiate* a Section 65B/63 BSA certificate, but the cryptographic hash itself is not a legal substitute for judicial certification.

---

### 16. How does the architecture scale toward 80,000 cameras?
**Answer:** The architecture is designed with **stateless horizontal federation**:
1. **Edge Ingestion:** Centralizing 80,000 live RTSP streams to a single server is impossible and bandwidth-prohibitive. In our target architecture, regional edge nodes (deployed across 33 districts and 4 commissionerates) handle local RTSP decode, motion gating, and ANPR inference.
2. **Event-Only Transport:** Only lightweight metadata JSON payloads (sighting events, bounding boxes, SHA-256 hashes) are transmitted over Redis Streams / Apache Kafka back to the state cluster.
3. **Database Partitioning:** PostgreSQL sightings tables are partitioned by time (monthly declarative range partitioning) and indexed spatially via PostGIS.
4. **Storage Tiering:** Evidence images reside in distributed S3 object storage with lifecycle rules (hot 30 days, cold 90 days), preventing database bloat.
5. **Empirical Benchmarks:** In Phase 11 benchmarks, our PostGIS indexing sustained queries against simulated 80,000-camera coordinate topologies in sub-25ms.

---

### 17. What is currently demonstrated versus future?
**Answer:**
| Capability | Demonstrated in Prototype | Production / Future Requirement |
|---|---|---|
| **Video Ingestion** | Simulated live RTSP via MediaMTX & WSL FFmpeg | Authorized mTLS connection to police NVRs/VMS |
| **Cameras** | 15 cataloged Gujarat corridor cameras | Full statewide camera onboarding (80,000+ nodes) |
| **ANPR Inference** | Edge pipeline architecture & consensus contracts | GPU-accelerated TensorRT/YOLOv8 deployment on edge servers |
| **Evidence Vault** | MinIO S3 object store with on-the-fly SHA-256 verification | HSM-backed WORM (Write Once Read Many) enterprise storage |
| **Corridor Tracking** | 3-node inter-district scenario (Ahmedabad $\rightarrow$ Gandhinagar) | Statewide dynamic routing across all district commissionerates |
| **Security** | JWT authentication, RBAC, encrypted credentials (AES-256-GCM) | Government PKI, SSO (e-Pramaan), GSWAN MPLS boundary isolation |

---

### 18. What would be required to connect actual Gujarat Police CCTV?
**Answer:** Four concrete prerequisites:
1. **Administrative & Statutory Approvals:** Sanction from the Home Department, Director General of Police (DGP), and respective City Police Commissioners.
2. **Network Interconnect:** Provisioning dedicated, encrypted network drops on the GSWAN / Netram private fiber ring with static IP allocations.
3. **Hardware Gateway Nodes:** Deployment of edge appliances (1U rack servers with dual 10GbE NICs and hardware H.264/H.265 decoders) at each Netram Command and Control Centre.
4. **VMS/Camera API Credentials:** Authorized read-only RTSP/ONVIF service accounts configured on local Milestone, Genetec, or camera firmware installations.

---

### 19. What prevents unauthorized access to CCTV?
**Answer:**
1. **Role-Based Access Control (RBAC):** Strict role boundaries (Super Admin, District Admin, Police Investigator, CCTV Operator). Operators cannot view audit logs or manage watchlists; investigators cannot alter camera network settings.
2. **Credential Encryption at Rest:** Camera RTSP credentials and stream secrets are encrypted in PostgreSQL using AES-256-GCM with distinct initialization vectors (IVs) and authentication tags.
3. **Immutable Audit Trails:** Every user login, search query, stream playback, evidence export, and alert acknowledgment is automatically logged to an append-only `AuditLog` table with user ID, IP address, timestamp, and correlation ID.
4. **No Direct External Camera Exposure:** Cameras are never exposed to public IPs; browser users only receive authenticated HLS segments proxied through the Media Gateway.

---

### 20. What happens if one regional gateway fails?
**Answer:**
1. **Isolation of Failure:** NETRAVAHA follows a shared-nothing gateway topology. If the Surat regional gateway fails, Ahmedabad, Vadodara, and Gandhinagar continue operating with zero degradation.
2. **Local Edge Buffering:** Regional edge consumers maintain local disk-backed queues (or local Redis instances) during central network partitions, re-syncing batched sighting events when connectivity is restored.
3. **Central Health Detection:** The central health poller marks only that region's cameras as `DEGRADED`, alerting state administrators while leaving unaffected corridors fully searchable.
4. **Active-Passive Gateway Pairing:** In production, regional gateways are deployed in high-availability pairs with VRRP (Virtual Router Redundancy Protocol) for instant automatic failover.
