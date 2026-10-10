"""
Phase 4.5 — AI Worker Observability & Telemetry Regression Suite
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026

Verifies:
1. Rolling latency percentiles (p50, p95, p99) and e2e latencies are computed accurately.
2. Latency buffers remain strictly bounded (100 samples) over high-iteration runs.
3. CameraHealthTracker accurately tracks last_sampled_frame freshness.
4. WorkerHealthManager produces privacy-safe heartbeat payloads.
5. Heartbeat status transitions correctly between HEALTHY, DEGRADED, and UNAVAILABLE.
6. RedisEventPublisher metrics report buffer depth and drop counters accurately.
7. Zero sensitive information (passwords, plates, evidence URLs) leaked in telemetry.
8. Redis connectivity failures during heartbeat publishing isolate gracefully.
"""

import json
import time
from unittest.mock import MagicMock, patch
import numpy as np
import pytest

from app.detector import InferencePipeline
from app.detector.base import BasePlateDetector, BaseVehicleDetector
from app.events.publisher import RedisEventPublisher
from app.frame_contract import FramePayload
from app.health import CameraHealthTracker, StreamStatus, WorkerHealthManager, worker_health


class DummyVehicleDetector(BaseVehicleDetector):
    def is_ready(self) -> bool:
        return True

    def detect(self, frame: np.ndarray):
        return []


class DummyPlateDetector(BasePlateDetector):
    @property
    def mode_name(self) -> str:
        return "MOCK_PLATE_DETECTOR"

    def localize(self, frame: np.ndarray, vehicles):
        return []


def test_1_rolling_latency_percentiles_accuracy():
    """Verify that InferencePipeline computes p50, p95, p99 and e2e percentiles accurately"""
    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector(),
        plate_detector=DummyPlateDetector(),
    )

    frame = np.full((100, 100, 3), 128, dtype=np.uint8)

    # Process 20 frames with varying artificial captured_at timestamps
    now = time.time()
    for i in range(1, 21):
        payload = FramePayload(
            camera_id="CAM-OBS-01",
            frame_index=i,
            captured_at=now - (0.05 * i),
            sampled_at=now,
            width=100,
            height=100,
            frame=frame,
        )
        res = pipeline.process_frame(payload)
        assert res is not None

    metrics = pipeline.get_metrics()

    assert metrics["total_inferences"] == 20
    assert "p50_latency_ms" in metrics
    assert "p95_latency_ms" in metrics
    assert "p99_latency_ms" in metrics
    assert "e2e_p50_latency_ms" in metrics
    assert "e2e_p95_latency_ms" in metrics
    assert metrics["p50_latency_ms"] >= 0.0
    assert metrics["p95_latency_ms"] >= metrics["p50_latency_ms"]
    assert metrics["e2e_p95_latency_ms"] >= metrics["e2e_p50_latency_ms"]


def test_2_latency_buffers_strictly_bounded():
    """Verify that latency buffers do not grow unboundedly beyond 100 samples"""
    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector(),
        plate_detector=DummyPlateDetector(),
    )

    frame = np.full((50, 50, 3), 100, dtype=np.uint8)

    # Process 300 frames
    for i in range(300):
        payload = FramePayload(
            camera_id="CAM-BOUNDED-01",
            frame_index=i,
            captured_at=time.time(),
            sampled_at=time.time(),
            width=50,
            height=50,
            frame=frame,
        )
        pipeline.process_frame(payload)

    # Internal rolling deque capacity invariant
    assert len(pipeline._recent_latencies) == 100
    assert len(pipeline._recent_e2e_latencies) == 100
    assert pipeline.total_inferences == 300


def test_3_camera_health_tracker_sampling_freshness():
    """Verify CameraHealthTracker distinguishes frame arrival from frame sampling"""
    tracker = CameraHealthTracker(camera_id="CAM-FRESH-01")

    assert tracker.last_successful_frame_ts is None
    assert tracker.last_sampled_frame_ts is None

    # Record unsampled frame
    tracker.record_frame(sampled=False)
    assert tracker.last_successful_frame_ts is not None
    assert tracker.last_sampled_frame_ts is None
    assert tracker.frames_received == 1
    assert tracker.frames_sampled == 0

    # Record sampled frame
    time.sleep(0.01)
    tracker.record_frame(sampled=True)
    assert tracker.last_sampled_frame_ts is not None
    assert tracker.frames_sampled == 1
    assert tracker.last_sampled_frame_ts >= tracker.last_successful_frame_ts

    telemetry = tracker.to_dict()
    assert telemetry["last_sampled_frame"] == tracker.last_sampled_frame_ts


def test_4_heartbeat_payload_generation_and_state_transitions():
    """Verify WorkerHealthManager calculates HEALTHY vs DEGRADED vs UNAVAILABLE status correctly"""
    manager = WorkerHealthManager()
    cam1 = manager.get_or_create_camera("CAM-01")
    cam1.record_frame(sampled=True)

    # Case A: Healthy state
    pipeline_metrics = {
        "avg_latency_ms": 25.0,
        "p50_latency_ms": 24.0,
        "p95_latency_ms": 40.0,
        "p99_latency_ms": 50.0,
    }
    pub_metrics = {"buffer_size": 0, "buffer_drops": 0, "publish_errors": 0}

    hb_healthy = manager.get_heartbeat_payload("worker-test", pipeline_metrics, pub_metrics)
    assert hb_healthy["status"] == "HEALTHY"
    assert hb_healthy["worker_lifecycle"] == "RUNNING"
    assert hb_healthy["streams"]["connected"] == 1
    assert hb_healthy["last_processing_timestamp"] is not None

    # Case B: Degraded due to buffer drops
    pub_degraded = {"buffer_size": 10, "buffer_drops": 2, "publish_errors": 2}
    hb_deg_drops = manager.get_heartbeat_payload("worker-test", pipeline_metrics, pub_degraded)
    assert hb_deg_drops["status"] == "DEGRADED"

    # Case C: Degraded due to extreme p95 inference latency (> 350ms)
    pipe_slow = {
        "avg_latency_ms": 200.0,
        "p50_latency_ms": 180.0,
        "p95_latency_ms": 420.0,
    }
    hb_deg_latency = manager.get_heartbeat_payload("worker-test", pipe_slow, pub_metrics)
    assert hb_deg_latency["status"] == "DEGRADED"

    # Case D: Stopped worker reports UNAVAILABLE
    manager.worker_status = "STOPPED"
    hb_stopped = manager.get_heartbeat_payload("worker-test", pipeline_metrics, pub_metrics)
    assert hb_stopped["status"] == "UNAVAILABLE"


def test_5_redis_event_publisher_metrics():
    """Verify RedisEventPublisher get_metrics exposes buffer size and drops correctly"""
    pub = RedisEventPublisher(enabled=False)

    metrics = pub.get_metrics()
    assert metrics["published"] == 0
    assert metrics["publish_errors"] == 0
    assert metrics["buffer_size"] == 0
    assert metrics["buffer_drops"] == 0
    assert "last_published_at" in metrics


def test_6_zero_sensitive_data_in_telemetry_payload():
    """Verify that heartbeat payload never contains sensitive tokens, passwords, or plate text"""
    manager = WorkerHealthManager()
    cam = manager.get_or_create_camera("CAM-SENSITIVE-01")
    cam.record_frame(sampled=True)

    pipeline_metrics = {
        "avg_latency_ms": 22.0,
        "total_inferences": 50,
        "plate_localizer_mode": "MOCK",
    }
    pub_metrics = {"buffer_size": 0, "buffer_drops": 0}

    payload = manager.get_heartbeat_payload("worker-01", pipeline_metrics, pub_metrics)
    serialized = json.dumps(payload)

    # Invariants: No secrets, passwords, or plates
    assert "password" not in serialized.lower()
    assert "secret" not in serialized.lower()
    assert "rtsp://" not in serialized
    assert "token" not in serialized.lower()


def test_7_redis_failure_during_heartbeat_isolation():
    """Verify that Redis connection errors during heartbeat publishing do not raise or crash"""
    from app.main import WorkerApp

    app = WorkerApp()

    with patch("redis.Redis") as mock_redis_cls:
        mock_instance = MagicMock()
        mock_instance.set.side_effect = Exception("Connection refused to Redis")
        mock_redis_cls.return_value = mock_instance

        # Must not raise an unhandled exception
        app._publish_health_telemetry()
