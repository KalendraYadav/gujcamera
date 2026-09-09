# Video Gateway & CCTV Stream Simulator (Phase 3A)

> **Important Disclosure**: This component is a **simulated streaming gateway** for the Gujarat Police Innovation Challenge PoC. All video streams are generated from deterministic synthetic/recorded test fixtures looped continuously via FFmpeg. This does **NOT** connect to actual Gujarat Police surveillance infrastructure or live government CCTV cameras.
>
> **Architecture Flow**:
> `Deterministic Video Fixtures (.mp4) ──► FFmpeg Loop ──► MediaMTX (RTSP Gateway) ──► RTSP Feeds`

---

## 1. Overview & Architecture Role

Phase 3A establishes the continuous video ingestion foundation for the platform:
* **MediaMTX (`video-gateway`)**: Pinned at `bluenviron/mediamtx:1.9.3`. An ultra-lightweight, zero-dependency RTSP/HLS streaming server acting as the platform's video gateway. It opens TCP/UDP listeners on port 8554 (RTSP) and 8888 (HLS preview).
* **FFmpeg Stream Simulator (`stream-simulator`)**: Runs `linuxserver/ffmpeg:latest`. Reads local deterministic video fixtures from `/fixtures` and continuously loops them (`-re -stream_loop -1 -c:v copy`) over RTSP to MediaMTX using TCP transport.
* **Deterministic Fixtures**: Located in `video-gateway/fixtures/`, providing predictable vehicle motion and license plate test patterns (`GJ01AB1234`) without binary bloat.

---

## 2. Active RTSP Stream Endpoints

Both canonical and alias stream paths are published concurrently:

| Camera Identifier | Junction / Location | Internal Docker RTSP URL | Host RTSP URL |
|---|---|---|---|
| **CAM-AHM-01** | SG Highway - Pakwan Crossroad | `rtsp://video-gateway:8554/cam-ahm-01`<br>`rtsp://video-gateway:8554/live/cam-ahm-01`<br>`rtsp://simulator:8554/live/cam-ahm-01` | `rtsp://localhost:8554/cam-ahm-01` |
| **CAM-AHM-02** | C.G. Road - Swastik Char Rasta | `rtsp://video-gateway:8554/cam-ahm-02`<br>`rtsp://video-gateway:8554/live/cam-ahm-02`<br>`rtsp://simulator:8554/live/cam-ahm-02` | `rtsp://localhost:8554/cam-ahm-02` |

---

## 3. How to Start the Streaming Stack

From the repository root:

```bash
# Start the full infrastructure including MediaMTX and the FFmpeg stream simulator
docker compose up -d

# Verify all containers are running and healthy
docker compose ps
```

---

## 4. How to Verify Streams & Decode Frames

### 4.1 Probe Stream Information
Verify stream codec (H.264), resolution (1280x720), and framerate (25 FPS):

```bash
docker run --rm --network gujcamera_network --entrypoint ffprobe linuxserver/ffmpeg:latest \
  -rtsp_transport tcp -i rtsp://video-gateway:8554/cam-ahm-01
```

### 4.2 Decode Frames
Verify client connection and frame decoding:

```bash
docker run --rm --network gujcamera_network --entrypoint ffmpeg linuxserver/ffmpeg:latest \
  -rtsp_transport tcp -i rtsp://video-gateway:8554/cam-ahm-01 -vframes 25 -f null -
```

### 4.3 Verify Infinite Looping Beyond Fixture Duration
Verify that stream continues seamlessly across the 6-second fixture loop boundary (e.g. decoding 8 seconds):

```bash
docker run --rm --network gujcamera_network --entrypoint ffmpeg linuxserver/ffmpeg:latest \
  -rtsp_transport tcp -i rtsp://video-gateway:8554/cam-ahm-01 -t 8 -f null -
```

---

## 5. What is Real vs. What is Simulated

| Dimension | Status in Phase 3A |
|---|---|
| **RTSP Network Transport** | **REAL**: Standard RTSP handshake, SDP exchange, RTP/RTCP packetization over TCP. |
| **MediaMTX Gateway** | **REAL**: Production-grade open-source RTSP/HLS gateway binary. |
| **H.264 Video Stream** | **REAL**: Valid H.264 NAL units decoded by standard decoders. |
| **Video Fixture Source** | **SIMULATED**: Synthetic CCTV traffic scenes with animated vehicle motion and test plate `GJ01AB1234`. |
| **Edge Hardware Connection** | **SIMULATED**: No physical IP cameras or Gujarat Police C3/VMS network connections are accessed. |

---

## 6. What Remains for Future Subphases

* **Phase 3B**: Containerized Python 3.11 AI Worker scaffolding & frame consumer.
* **Phase 3C**: YOLO vehicle detection & license plate localization.
* **Phase 3D**: Indian license plate OCR & character confidence scoring.
* **Phase 3E**: Multi-frame consensus voting (5–8 frames) & MinIO evidence vaulting.
* **Phase 3F**: Redis Streams event bridge into Phase 2E Watchlist & Alert Engine.
