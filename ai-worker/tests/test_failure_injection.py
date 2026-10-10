"""
Phase 4.6 — AI Worker Operational Failure-Injection and Recovery Verification
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026

Scenarios Tested on AI Worker:
1. Worker stops publishing heartbeats (TTL expiry)
2. Worker heartbeats but stops processing frames (FPS resets to 0.0, is_processing_active: False, status: DEGRADED)
3. MediaMTX stream path disconnect and recovery (DEGRADED -> OFFLINE -> CONNECTED)
4. Redis temporary outage and in-process buffer recovery (buffered FIFO, zero mutation, flushed on reconnect)
8. Graceful worker shutdown (lifecycle STOPPED, override heartbeat published with short TTL)
"""

import json
import time
from unittest.mock import MagicMock, patch
import pytest

from app.events.contract import VehicleSightingCreatedEvent, VideoSourceType
from app.events.publisher import RedisEventPublisher
from app.health import CameraHealthTracker, StreamStatus, WorkerHealthManager
from app.main import WorkerApp


def create_test_event(sighting_id: str) -> VehicleSightingCreatedEvent:
    return VehicleSightingCreatedEvent.create(
        sighting_id=sighting_id,
        evidence_id=f"ev-{sighting_id}",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB1234",
        confidence=0.95,
        consensus_of=3,
        total_observations=5,
        storage_ref=f"s3://police-evidence-vault/{sighting_id}.jpg",
        evidence_hash="315cb76daa3caa030ef0de4aecbaafa8dd20c114901d940682cceb1a9fa42db7",
        captured_at_ts=time.time(),
        correlation_id=f"corr-{sighting_id}",
        source_type=VideoSourceType.RESEARCH_VIDEO,
    )


# ==============================================================================
# Scenario 1: AI worker stops publishing heartbeats (TTL expiry)
# ==============================================================================
def test_scenario_1_worker_heartbeat_stops_and_expires():
    """Verify that a worker heartbeat published with TTL expires on real Redis when publishing stops"""
    try:
        import redis
        r = redis.Redis(host="localhost", port=6379, socket_timeout=2.0)
        r.ping()
        redis_live = True
    except Exception:
        redis_live = False

    if not redis_live:
        pytest.skip("Local Redis server not reachable for live TTL test")

    test_key = f"gujcamera:telemetry:ai-worker:test-s1-py-{int(time.time() * 1000)}"
    manager = WorkerHealthManager()
    payload = manager.get_heartbeat_payload("test-worker-s1")

    # Write key with 1-second TTL
    r.set(test_key, json.dumps(payload), ex=1)
    assert r.get(test_key) is not None

    # Wait for TTL to expire
    time.sleep(1.2)
    assert r.get(test_key) is None
    r.close()


# ==============================================================================
# Scenario 2: Worker continues heartbeating but frame processing stops
# ==============================================================================
def test_scenario_2_heartbeat_without_frame_processing():
    """Verify that if worker continues heartbeating while frame processing stalls:
    1. Stream actual FPS drops to 0.0
    2. Heartbeat reports is_processing_active: False
    3. Worker status transitions to DEGRADED
    """
    tracker = CameraHealthTracker(camera_id="CAM-STALL-01")

    # Step A: Camera was previously receiving and sampling frames
    tracker.record_frame(sampled=True)
    time.sleep(0.01)
    tracker.record_frame(sampled=True)

    # Artificially age the last frame timestamp to 4 seconds ago (> 3.0s threshold)
    tracker.last_successful_frame_ts = time.time() - 4.0
    tracker.last_sampled_frame_ts = time.time() - 4.0
    tracker.fps_actual = 25.0  # Previous rolling rate

    telemetry = tracker.to_dict()
    # Invariant: Reported actual FPS must dynamically zero out when frames stop
    assert telemetry["fps_actual"] == 0.0

    # Step B: Worker Health Manager evaluates stalled stream
    manager = WorkerHealthManager()
    cam = manager.get_or_create_camera("CAM-STALL-01")
    cam.status = StreamStatus.CONNECTED
    cam.last_sampled_frame_ts = time.time() - 45.0  # 45s since last frame (> 30s)

    payload = manager.get_heartbeat_payload("test-worker-stall")

    # Invariants:
    # 1. Processing is NOT falsely reported as active
    assert payload["is_processing_active"] is False
    # 2. Worker health status is DEGRADED
    assert payload["status"] == "DEGRADED"


# ==============================================================================
# Scenario 3: MediaMTX stream path disconnect and recovery
# ==============================================================================
def test_scenario_3_stream_disconnect_and_recovery():
    """Verify CameraHealthTracker transitions gracefully through stream failure and recovery"""
    tracker = CameraHealthTracker(camera_id="CAM-RECONNECT-01")

    # Initial frame
    tracker.record_frame(sampled=True)
    assert tracker.status == StreamStatus.CONNECTED

    # Stream read decode failure (packet loss / RTSP teardown)
    tracker.record_decode_failure()
    assert tracker.status == StreamStatus.DEGRADED
    assert tracker.decode_failures == 1

    # Reconnect attempt initiated
    tracker.record_reconnect()
    assert tracker.status == StreamStatus.OFFLINE
    assert tracker.fps_actual == 0.0
    assert tracker.reconnect_count == 1

    # Gateway stream recovers and frames resume
    tracker.record_frame(sampled=True)
    assert tracker.status == StreamStatus.CONNECTED
    assert tracker.frames_received == 2
    assert tracker.frames_sampled == 2


# ==============================================================================
# Scenario 4: Redis temporary outage and in-process buffer recovery
# ==============================================================================
def test_scenario_4_redis_temporary_outage_and_buffer_flush():
    """Verify that during temporary Redis outage:
    1. Events are buffered in-process in FIFO order
    2. Event IDs, sighting IDs, evidence hashes, and timestamps remain completely unmutated
    3. Buffered events are flushed to Redis once connection returns
    """
    try:
        import redis
        r = redis.Redis(host="localhost", port=6379, socket_timeout=2.0)
        r.ping()
        redis_live = True
        r.close()
    except Exception:
        redis_live = False

    if not redis_live:
        pytest.skip("Local Redis server not reachable for live buffer flush test")

    test_stream = f"test:stream:failure:publisher:{int(time.time() * 1000)}"

    # 1. Initialize publisher pointing to live Redis
    pub = RedisEventPublisher(
        host="localhost",
        port=6379,
        stream_name=test_stream,
        connect_timeout=2.0,
        reconnect_backoff_seconds=0.0,
    )
    assert pub.is_connected() is True

    # 2. Simulate Redis outage by closing connection and breaking client
    with pub._lock:
        pub._connected = False
        pub._client = None

    event1 = create_test_event("s-outage-01")
    event2 = create_test_event("s-outage-02")
    event3 = create_test_event("s-outage-03")

    # Invalidate connection attempts during the outage simulation
    with patch.object(pub, "_try_connect", return_value=False):
        res1 = pub.publish_sighting(event1)
        res2 = pub.publish_sighting(event2)
        res3 = pub.publish_sighting(event3)

    # Invariants during outage:
    # 1. Calls return None (buffered, not published)
    assert res1 is None
    assert res2 is None
    assert res3 is None
    # 2. Events are held in FIFO buffer
    assert len(pub._buffer) == 3
    metrics = pub.get_metrics()
    assert metrics["buffer_size"] == 3
    assert metrics["buffer_drops"] == 0

    # 3. Connectivity restored: Flush buffer to real Redis
    pub._last_connect_attempt = 0.0
    flushed_count = pub.flush_buffer()

    # Invariants upon recovery:
    assert flushed_count == 3
    assert len(pub._buffer) == 0
    assert pub.total_published == 3
    assert pub.total_retried_success == 3

    # 4. Verify stream contents on real Redis
    r = redis.Redis(host="localhost", port=6379, decode_responses=True)
    messages = r.xrange(test_stream)
    assert len(messages) == 3

    parsed_sightings = []
    for msg_id, fields in messages:
        payload = json.loads(fields["data"])
        parsed_sightings.append(payload["sighting_id"])
        # Invariant: Evidence hash and event ID unmutated
        assert payload["evidence_hash"] == "315cb76daa3caa030ef0de4aecbaafa8dd20c114901d940682cceb1a9fa42db7"

    assert parsed_sightings == ["s-outage-01", "s-outage-02", "s-outage-03"]

    # Clean up test stream
    r.delete(test_stream)
    r.close()
    pub.close()


# ==============================================================================
# Scenario 8: Worker graceful shutdown
# ==============================================================================
def test_scenario_8_worker_graceful_shutdown():
    """Verify that WorkerApp.stop() transitions lifecycle and publishes STOPPED telemetry"""
    app = WorkerApp()
    app._is_running = True

    with patch.object(app, "_publish_health_telemetry") as mock_pub, \
         patch.object(app.stream_dispatcher, "stop") as mock_disp_stop, \
         patch.object(app.event_publisher, "close") as mock_pub_close:

        app.stop()

        # Invariants:
        # 1. Dispatcher and publisher closed
        mock_disp_stop.assert_called_once()
        mock_pub_close.assert_called_once()
        # 2. Worker health marked STOPPED
        from app.health import worker_health
        assert worker_health.worker_status == "STOPPED"
        # 3. Telemetry override sent with STOPPED
        mock_pub.assert_called_with(override_status="STOPPED")
        # 4. App running flag set to False
        assert app._is_running is False
