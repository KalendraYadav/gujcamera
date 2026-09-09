"""
Unit Tests for Health Tracking and Telemetry (Phase 3B)
"""

import threading
import time
from app.health import CameraHealthTracker, WorkerHealthManager, StreamStatus


def test_camera_health_initial_state():
    tracker = CameraHealthTracker("CAM-TEST-01")
    assert tracker.camera_id == "CAM-TEST-01"
    assert tracker.status == StreamStatus.OFFLINE
    assert tracker.frames_received == 0
    assert tracker.frames_sampled == 0
    assert tracker.decode_failures == 0
    assert tracker.reconnect_count == 0


def test_camera_health_state_transitions():
    tracker = CameraHealthTracker("CAM-TEST-01")

    # Initial state is OFFLINE
    assert tracker.status == StreamStatus.OFFLINE

    # Ingesting a frame brings it to CONNECTED
    tracker.record_frame(sampled=False)
    assert tracker.status == StreamStatus.CONNECTED
    assert tracker.frames_received == 1
    assert tracker.frames_sampled == 0

    # Ingesting a sampled frame
    tracker.record_frame(sampled=True)
    assert tracker.status == StreamStatus.CONNECTED
    assert tracker.frames_received == 2
    assert tracker.frames_sampled == 1

    # Decode failure triggers DEGRADED status
    tracker.record_decode_failure()
    assert tracker.status == StreamStatus.DEGRADED
    assert tracker.decode_failures == 1

    # Reconnect attempt triggers OFFLINE status
    tracker.record_reconnect()
    assert tracker.status == StreamStatus.OFFLINE
    assert tracker.reconnect_count == 1

    # Ingesting frame recovers back to CONNECTED
    tracker.record_frame(sampled=True)
    assert tracker.status == StreamStatus.CONNECTED


def test_camera_health_to_dict():
    tracker = CameraHealthTracker("CAM-TEST-01")
    tracker.record_frame(sampled=True)
    data = tracker.to_dict()

    assert data["camera_id"] == "CAM-TEST-01"
    assert data["status"] == "CONNECTED"
    assert data["frames_received"] == 1
    assert data["frames_sampled"] == 1
    assert data["decode_failures"] == 0
    assert data["reconnect_count"] == 0
    assert data["last_successful_frame"] is not None


def test_worker_health_manager_aggregation():
    manager = WorkerHealthManager()

    cam1 = manager.get_or_create_camera("CAM-1")
    cam2 = manager.get_or_create_camera("CAM-2")
    cam3 = manager.get_or_create_camera("CAM-3")

    cam1.record_frame(sampled=True)  # CONNECTED
    cam2.record_frame(sampled=False)
    cam2.record_decode_failure()      # DEGRADED
    # cam3 is left OFFLINE

    summary = manager.get_summary()
    worker = summary["worker"]

    assert worker["status"] == "RUNNING"
    assert worker["uptime_seconds"] >= 0.0
    assert worker["total_managed_streams"] == 3
    assert worker["connected_streams"] == 1
    assert worker["degraded_streams"] == 1
    assert worker["offline_streams"] == 1
    assert len(summary["streams"]) == 3


def test_camera_health_thread_safety():
    tracker = CameraHealthTracker("CAM-CONCURRENT")

    def worker():
        for _ in range(500):
            tracker.record_frame(sampled=True)
            tracker.record_decode_failure()

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert tracker.frames_received == 2000
    assert tracker.frames_sampled == 2000
    assert tracker.decode_failures == 2000
