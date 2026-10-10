"""
Health and Telemetry Tracking for AI Vision Worker (Phase 3B)
Maintains thread-safe in-memory stream metrics and worker lifecycle states.
Distinguishes worker process health from camera stream health.
"""

import time
import threading
from enum import Enum
from typing import Dict, Optional, Any


class StreamStatus(str, Enum):
    CONNECTED = "CONNECTED"
    DEGRADED = "DEGRADED"
    OFFLINE = "OFFLINE"
    STOPPED = "STOPPED"


class CameraHealthTracker:
    """Tracks telemetry and health state for a single camera RTSP stream"""
    def __init__(self, camera_id: str):
        self.camera_id = camera_id
        self.status = StreamStatus.OFFLINE
        self.frames_received: int = 0
        self.frames_sampled: int = 0
        self.decode_failures: int = 0
        self.reconnect_count: int = 0
        self.last_successful_frame_ts: Optional[float] = None
        self.last_sampled_frame_ts: Optional[float] = None
        self.last_fps_calc_ts: float = time.time()
        self.last_fps_calc_frames: int = 0
        self.fps_actual: float = 0.0
        self.packet_loss: float = 0.0
        self._lock = threading.Lock()

    def record_frame(self, sampled: bool = False) -> None:
        """Record successful frame ingestion and update rolling FPS"""
        with self._lock:
            now = time.time()
            self.frames_received += 1
            if sampled:
                self.frames_sampled += 1
                self.last_sampled_frame_ts = now
            self.last_successful_frame_ts = now
            self.status = StreamStatus.CONNECTED

            # Calculate rolling actual FPS every 2 seconds
            elapsed = now - self.last_fps_calc_ts
            if elapsed >= 2.0:
                frames_delta = self.frames_received - self.last_fps_calc_frames
                self.fps_actual = round(frames_delta / elapsed, 2)
                self.last_fps_calc_ts = now
                self.last_fps_calc_frames = self.frames_received

                # Packet loss approximation based on decode failures
                total_attempts = frames_delta + self.decode_failures
                if total_attempts > 0:
                    self.packet_loss = round((self.decode_failures / total_attempts) * 100.0, 2)

    def record_decode_failure(self) -> None:
        """Record frame read/decode failure and transition to DEGRADED if persistent"""
        with self._lock:
            self.decode_failures += 1
            # If we have failures without recent frames, mark DEGRADED
            if self.status == StreamStatus.CONNECTED:
                self.status = StreamStatus.DEGRADED

    def record_reconnect(self) -> None:
        """Record a stream reconnection attempt"""
        with self._lock:
            self.reconnect_count += 1
            self.status = StreamStatus.OFFLINE
            self.fps_actual = 0.0

    def set_status(self, status: StreamStatus) -> None:
        """Set explicit stream status"""
        with self._lock:
            self.status = status
            if status in (StreamStatus.OFFLINE, StreamStatus.STOPPED):
                self.fps_actual = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Produce telemetry dictionary representation"""
        with self._lock:
            now = time.time()
            # If no frame has arrived for more than 3.0 seconds, actual FPS drops to 0.0
            fps = self.fps_actual
            if self.last_successful_frame_ts is not None and (now - self.last_successful_frame_ts > 3.0):
                fps = 0.0
            return {
                "camera_id": self.camera_id,
                "status": self.status.value,
                "frames_received": self.frames_received,
                "frames_sampled": self.frames_sampled,
                "decode_failures": self.decode_failures,
                "reconnect_count": self.reconnect_count,
                "last_successful_frame": self.last_successful_frame_ts,
                "last_sampled_frame": self.last_sampled_frame_ts,
                "fps_actual": fps,
                "packet_loss": self.packet_loss,
            }


class WorkerHealthManager:
    """Manages worker process status and aggregates camera stream telemetry"""
    def __init__(self):
        self.started_at: float = time.time()
        self.worker_status: str = "RUNNING"
        self._cameras: Dict[str, CameraHealthTracker] = {}
        self._lock = threading.Lock()

    def get_or_create_camera(self, camera_id: str) -> CameraHealthTracker:
        with self._lock:
            if camera_id not in self._cameras:
                self._cameras[camera_id] = CameraHealthTracker(camera_id)
            return self._cameras[camera_id]

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            uptime = round(time.time() - self.started_at, 1)
            stream_metrics = {cid: tracker.to_dict() for cid, tracker in self._cameras.items()}

            connected_count = sum(1 for s in stream_metrics.values() if s["status"] == StreamStatus.CONNECTED.value)
            degraded_count = sum(1 for s in stream_metrics.values() if s["status"] == StreamStatus.DEGRADED.value)
            offline_count = sum(1 for s in stream_metrics.values() if s["status"] == StreamStatus.OFFLINE.value)

            return {
                "worker": {
                    "status": self.worker_status,
                    "uptime_seconds": uptime,
                    "total_managed_streams": len(self._cameras),
                    "connected_streams": connected_count,
                    "degraded_streams": degraded_count,
                    "offline_streams": offline_count,
                },
                "streams": stream_metrics
            }

    def get_heartbeat_payload(
        self,
        worker_name: str,
        pipeline_metrics: Optional[Dict[str, Any]] = None,
        publisher_metrics: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Produce structured, privacy-safe heartbeat payload for Redis publication"""
        summary = self.get_summary()
        w = summary["worker"]

        # Collect process CPU and memory metrics safely
        cpu_pct = 0.0
        rss_mb = 0.0
        try:
            import psutil
            import os
            proc = psutil.Process(os.getpid())
            cpu_pct = round(proc.cpu_percent(), 1)
            rss_mb = round(proc.memory_info().rss / (1024 * 1024), 1)
        except Exception:
            pass

        now = time.time()

        # Find latest frame processing timestamp across active streams
        last_proc_ts: Optional[float] = None
        for sm in summary["streams"].values():
            ts = sm.get("last_sampled_frame")
            if ts and (last_proc_ts is None or ts > last_proc_ts):
                last_proc_ts = ts

        is_processing_active = bool(last_proc_ts and (now - last_proc_ts < 30.0))

        # Determine overall AI health status
        overall_status = "HEALTHY"
        if w["status"] != "RUNNING":
            overall_status = "UNAVAILABLE"
        elif publisher_metrics and publisher_metrics.get("buffer_drops", 0) > 0:
            overall_status = "DEGRADED"
        elif pipeline_metrics and pipeline_metrics.get("p95_latency_ms", 0) > 350.0:
            overall_status = "DEGRADED"
        elif w["total_managed_streams"] > 0 and w["connected_streams"] == 0:
            overall_status = "DEGRADED"
        elif w["total_managed_streams"] > 0 and last_proc_ts is not None and not is_processing_active:
            overall_status = "DEGRADED"

        return {
            "worker_name": worker_name,
            "status": overall_status,
            "worker_lifecycle": w["status"],
            "timestamp": now,
            "uptime_seconds": w["uptime_seconds"],
            "streams": {
                "total": w["total_managed_streams"],
                "connected": w["connected_streams"],
                "degraded": w["degraded_streams"],
                "offline": w["offline_streams"],
            },
            "last_processing_timestamp": last_proc_ts,
            "is_processing_active": is_processing_active,
            "inference": pipeline_metrics or {},
            "events": publisher_metrics or {},
            "system": {
                "cpu_percent": cpu_pct,
                "rss_mb": rss_mb,
            },
        }


# Singleton worker health manager
worker_health = WorkerHealthManager()
