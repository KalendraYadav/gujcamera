# NETRAVAHA — Video Datasets & External Research Corpora
**Gujarat Police Innovation Challenge 2026**

This directory documents external research datasets, video assets, and download instructions for the NETRAVAHA Unified CCTV Intelligence Platform demonstration.

---

## 1. Data Repository Policy

1. **Lightweight Repository Mandate**: Large binary video files ($\ge 20\text{ MB}$) must **NOT** be committed directly to version control.
2. **Deterministic Synthetic Assets**: Compact, code-generated synthetic fixtures are placed in `video-gateway/fixtures/` and are fully version-controlled.
3. **External Research Datasets**: Any external research video used for demonstration must have verified open access, a known cryptographic SHA-256 digest, and an explicit record in `docs/VIDEO_SOURCE_CATALOG.md`.
4. **No Unauthorized Police Surveillance**: NETRAVAHA never ingests live, unauthorized government CCTV or private surveillance feeds without explicit legal clearance.

---

## 2. Active Demonstration Video Assets

| Asset Name | Local Relative Path | Quality Class | Duration | Dimensions | FPS | SHA-256 Digest | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `cam-ahm-01.mp4` | `video-gateway/fixtures/cam-ahm-01.mp4` | Class A (Full ANPR) | 6.0s | 1280x720 | 25.0 | `53d479c2b7cd242523e53020c5e46e363fef42f908641873b89957c50ea891ad` | `VERIFIED_SYNTHETIC` |
| `cam-ahm-02.mp4` | `video-gateway/fixtures/cam-ahm-02.mp4` | Class A (Full ANPR) | 6.0s | 1280x720 | 25.0 | `fb0b650dc7cbc694d2f9c311a690f2e2f9784ae23dbdd5a2b7a02e266827d4a2` | `VERIFIED_SYNTHETIC` |
| `demo-traffic.mp4`| `video-gateway/fixtures/demo-traffic.mp4` | Class B (Vehicle Flow) | 29.7s | 1280x720 | 29.97 | `2dd87b64a25ed765fc23e8b9d5db44ed6acf5cdcf7cb835af3ddbd70818127a7` | `LICENSE_VERIFICATION_REQUIRED` |

---

## 3. Recommended External Open Datasets (Manual Download Reference)

If additional real-world traffic context footage is required for offline model benchmarking:

### A. IIIT Hyderabad — Indian Driving Dataset (IDD)
- **Official Portal**: https://idd.insaan.iiit.ac.in/
- **License**: Academic Research Open Access
- **Intended Use**: Offline YOLOv8 vehicle class evaluation on Indian vehicle distributions (`motorcycle`, `auto-rickshaw`, `bus`, `truck`).
- **Note**: Captured from moving ego-vehicle dashcams; do **NOT** use as fixed roadside CCTV ingestion.

### B. UA-DETRAC Benchmark
- **Official Portal**: http://detrac-db.rit.albany.edu/
- **License**: Academic Non-Commercial
- **Intended Use**: Traffic density and multi-vehicle bounding box tracking benchmark.
