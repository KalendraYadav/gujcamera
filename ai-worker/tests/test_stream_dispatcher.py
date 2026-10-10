"""
Unit Tests for Dynamic Stream Dispatcher
Tests dynamic camera activation, deactivation, Redis hash state sync,
and Pub/Sub event handling without restarting the AI Worker.
"""

import json
import time
from unittest.mock import MagicMock, patch
import pytest
import redis

from app.stream_dispatcher import DynamicStreamDispatcher
from app.stream_consumer import StreamConsumer
from app.health import StreamStatus


@pytest.fixture
def mock_callback():
    return MagicMock()


@pytest.fixture
def dispatcher(mock_callback):
    return DynamicStreamDispatcher(
        sample_fps=3.0,
        base_reconnect_delay=1.0,
        max_reconnect_delay=10.0,
        frame_callback=mock_callback,
        enabled=False,  # Don't auto-start background thread during unit test
    )


def test_dispatcher_initialization(dispatcher):
    assert dispatcher.sample_fps == 3.0
    assert len(dispatcher.consumers) == 0
    assert dispatcher.get_managed_camera_ids() == []


def test_dispatcher_add_camera_lifecycle(dispatcher):
    with patch.object(StreamConsumer, "start") as mock_start, \
         patch.object(StreamConsumer, "is_running", return_value=True):

        success = dispatcher.add_camera("CAM-SUR-01", "rtsp://video-gateway:8554/cam-sur-01")
        assert success is True
        assert "CAM-SUR-01" in dispatcher.get_managed_camera_ids()

        consumer = dispatcher.get_consumer("CAM-SUR-01")
        assert consumer is not None
        assert consumer.config.id == "CAM-SUR-01"
        assert consumer.config.url == "rtsp://video-gateway:8554/cam-sur-01"
        mock_start.assert_called_once()


def test_dispatcher_add_duplicate_matching_url(dispatcher):
    with patch.object(StreamConsumer, "start") as mock_start, \
         patch.object(StreamConsumer, "is_running", return_value=True):

        dispatcher.add_camera("CAM-SUR-01", "rtsp://video-gateway:8554/cam-sur-01")
        assert mock_start.call_count == 1

        # Adding same camera with identical URL should be a no-op
        res = dispatcher.add_camera("CAM-SUR-01", "rtsp://video-gateway:8554/cam-sur-01")
        assert res is True
        assert mock_start.call_count == 1  # Not called again


def test_dispatcher_update_camera_url(dispatcher):
    with patch.object(StreamConsumer, "start") as mock_start, \
         patch.object(StreamConsumer, "stop") as mock_stop, \
         patch.object(StreamConsumer, "is_running", return_value=True):

        dispatcher.add_camera("CAM-SUR-01", "rtsp://video-gateway:8554/cam-sur-01")
        assert mock_start.call_count == 1

        # Update stream URL: old consumer stopped, new started
        res = dispatcher.add_camera("CAM-SUR-01", "rtsp://video-gateway:8554/cam-sur-01-new")
        assert res is True
        mock_stop.assert_called_once()
        assert mock_start.call_count == 2
        assert dispatcher.get_consumer("CAM-SUR-01").config.url == "rtsp://video-gateway:8554/cam-sur-01-new"


def test_dispatcher_remove_camera(dispatcher):
    with patch.object(StreamConsumer, "start"), \
         patch.object(StreamConsumer, "stop") as mock_stop:

        dispatcher.add_camera("CAM-SUR-01", "rtsp://video-gateway:8554/cam-sur-01")
        assert "CAM-SUR-01" in dispatcher.get_managed_camera_ids()

        removed = dispatcher.remove_camera("CAM-SUR-01")
        assert removed is True
        assert "CAM-SUR-01" not in dispatcher.get_managed_camera_ids()
        mock_stop.assert_called_once()

        # Removing again returns False
        assert dispatcher.remove_camera("CAM-SUR-01") is False


def test_dispatcher_sync_from_redis_hash(dispatcher):
    mock_redis = MagicMock()
    mock_redis.hgetall.return_value = {
        b"CAM-SUR-01": json.dumps({"internal_url": "rtsp://video-gateway:8554/cam-sur-01"}).encode(),
        b"CAM-VAD-02": json.dumps({"stream_url": "rtsp://video-gateway:8554/cam-vad-02"}).encode(),
    }

    with patch.object(StreamConsumer, "start"):
        count = dispatcher.sync_from_redis(mock_redis)
        assert count == 2
        assert sorted(dispatcher.get_managed_camera_ids()) == ["CAM-SUR-01", "CAM-VAD-02"]


def test_dispatcher_stop_cleans_all_consumers(dispatcher):
    with patch.object(StreamConsumer, "start"), \
         patch.object(StreamConsumer, "stop") as mock_stop:

        dispatcher.add_camera("CAM-01", "rtsp://video-gateway:8554/cam-01")
        dispatcher.add_camera("CAM-02", "rtsp://video-gateway:8554/cam-02")
        assert len(dispatcher.consumers) == 2

        dispatcher.stop()
        assert len(dispatcher.consumers) == 0
        assert mock_stop.call_count == 2


# ==============================================================================
# Phase 4.1 Startup Camera Fleet Synchronization Regression Tests
# ==============================================================================

def test_dispatcher_discovers_cameras_present_before_startup(dispatcher):
    """Test 2: Worker discovers cameras already present in Redis before it starts"""
    mock_redis = MagicMock()
    mock_redis.hgetall.return_value = {
        b"4150b788-2f6e-4164-bc06-8d28b3fb2b9c": json.dumps({
            "id": "4150b788-2f6e-4164-bc06-8d28b3fb2b9c",
            "name": "CAM-VAD-03: Fatehgunj - MSU Circle",
            "internal_url": "rtsp://simulator:8554/live/cam-vad-03",
            "status": "ONLINE",
        }).encode(),
        b"94ccae4d-7caf-4a0e-91bf-c2d211dc56a9": json.dumps({
            "id": "94ccae4d-7caf-4a0e-91bf-c2d211dc56a9",
            "name": "CAM-AHM-04: SG Highway - ISKCON",
            "internal_url": "rtsp://simulator:8554/live/cam-ahm-04",
            "status": "OFFLINE",
        }).encode(),
    }

    with patch.object(StreamConsumer, "start") as mock_start:
        count = dispatcher.sync_from_redis(mock_redis)
        assert count == 2
        assert mock_start.call_count == 2
        assert "4150b788-2f6e-4164-bc06-8d28b3fb2b9c" in dispatcher.get_managed_camera_ids()
        assert "94ccae4d-7caf-4a0e-91bf-c2d211dc56a9" in dispatcher.get_managed_camera_ids()


def test_dispatcher_camera_registered_after_worker_startup_discovered_via_sync(dispatcher):
    """Test 3: A camera registered after worker startup is discovered via SYNC event"""
    mock_redis = MagicMock()
    # Initially 1 camera
    mock_redis.hgetall.return_value = {
        b"cam-initial": json.dumps({"internal_url": "rtsp://gateway:8554/cam-1"}).encode(),
    }

    with patch.object(StreamConsumer, "start"):
        dispatcher.sync_from_redis(mock_redis)
        assert dispatcher.get_managed_camera_ids() == ["cam-initial"]

        # Backend adds a new camera and triggers SYNC
        mock_redis.hgetall.return_value = {
            b"cam-initial": json.dumps({"internal_url": "rtsp://gateway:8554/cam-1"}).encode(),
            b"cam-newly-added": json.dumps({"internal_url": "rtsp://gateway:8554/cam-2"}).encode(),
        }
        count = dispatcher.sync_from_redis(mock_redis)
        assert count == 2
        assert sorted(dispatcher.get_managed_camera_ids()) == ["cam-initial", "cam-newly-added"]


def test_dispatcher_missed_pubsub_activation_recovered_by_periodic_reconciliation(dispatcher):
    """Test 4: A missed Pub/Sub activation is recovered by periodic reconciliation"""
    mock_redis = MagicMock()
    mock_redis.hgetall.return_value = {
        b"cam-missed-event": json.dumps({
            "id": "cam-missed-event",
            "internal_url": "rtsp://gateway:8554/cam-missed",
            "name": "CAM-MISSED",
        }).encode(),
    }

    with patch.object(StreamConsumer, "start") as mock_start:
        assert len(dispatcher.consumers) == 0
        # Simulating periodic reconciliation tick
        synced = dispatcher.sync_from_redis(mock_redis)
        assert synced == 1
        assert "cam-missed-event" in dispatcher.get_managed_camera_ids()
        mock_start.assert_called_once()


def test_dispatcher_reconciliation_idempotency_and_duplicate_prevention(dispatcher):
    """Test 5: Reconciliation does not create duplicate stream consumers (idempotent & alias replacement)"""
    mock_redis = MagicMock()
    canonical_uuid = "97416a52-ee79-4dcf-b4aa-682ba220f6ae"
    mock_redis.hgetall.return_value = {
        canonical_uuid.encode(): json.dumps({
            "id": canonical_uuid,
            "name": "CAM-AHM-01: SG Highway - Pakwan Crossroad",
            "path_name": "cam-ahm-01",
            "internal_url": "rtsp://simulator:8554/live/cam-ahm-01",
        }).encode(),
    }

    with patch.object(StreamConsumer, "start") as mock_start, \
         patch.object(StreamConsumer, "stop") as mock_stop, \
         patch.object(StreamConsumer, "is_running", return_value=True):

        # Pre-seed with boot static alias 'CAM-AHM-01'
        dispatcher.add_camera("CAM-AHM-01", "rtsp://video-gateway:8554/cam-ahm-01")
        assert "CAM-AHM-01" in dispatcher.get_managed_camera_ids()
        assert mock_start.call_count == 1

        # First sync: replaces static alias with canonical UUID camera
        synced_1 = dispatcher.sync_from_redis(mock_redis)
        assert synced_1 == 1
        assert mock_stop.call_count == 1  # Stopped static alias
        assert "CAM-AHM-01" not in dispatcher.get_managed_camera_ids()
        assert canonical_uuid in dispatcher.get_managed_camera_ids()
        assert mock_start.call_count == 2  # Started canonical camera

        # Second sync on identical state: strictly idempotent, no new starts/stops
        synced_2 = dispatcher.sync_from_redis(mock_redis)
        assert synced_2 == 1
        assert mock_stop.call_count == 1  # Unchanged
        assert mock_start.call_count == 2  # Unchanged
        assert dispatcher.get_managed_camera_ids() == [canonical_uuid]


def test_dispatcher_inactive_cameras_not_started(dispatcher):
    """Test 6: Inactive cameras or entries without stream URLs are not started"""
    mock_redis = MagicMock()
    mock_redis.hgetall.return_value = {
        b"cam-empty-url": json.dumps({"id": "cam-empty-url", "internal_url": ""}).encode(),
        b"cam-null-stream": json.dumps({"id": "cam-null-stream"}).encode(),
    }

    with patch.object(StreamConsumer, "start") as mock_start:
        count = dispatcher.sync_from_redis(mock_redis)
        assert count == 0
        assert mock_start.call_count == 0
        assert len(dispatcher.consumers) == 0


def test_dispatcher_removed_cameras_follow_existing_shutdown_behavior(dispatcher):
    """Test 7: Removed cameras follow existing shutdown/removal behavior"""
    mock_redis = MagicMock()
    # Step 1: sync 2 cameras from Redis
    mock_redis.hgetall.return_value = {
        b"cam-keep": json.dumps({"internal_url": "rtsp://gateway:8554/cam-keep"}).encode(),
        b"cam-remove": json.dumps({"internal_url": "rtsp://gateway:8554/cam-remove"}).encode(),
    }

    with patch.object(StreamConsumer, "start"), \
         patch.object(StreamConsumer, "stop") as mock_stop, \
         patch.object(StreamConsumer, "is_running", return_value=True):

        dispatcher.sync_from_redis(mock_redis)
        assert sorted(dispatcher.get_managed_camera_ids()) == ["cam-keep", "cam-remove"]

        # Step 2: cam-remove is deactivated in database and deleted from Redis registry
        mock_redis.hgetall.return_value = {
            b"cam-keep": json.dumps({"internal_url": "rtsp://gateway:8554/cam-keep"}).encode(),
        }

        dispatcher.sync_from_redis(mock_redis)
        # cam-remove should be stopped and removed
        assert dispatcher.get_managed_camera_ids() == ["cam-keep"]
        mock_stop.assert_called_once()


def test_dispatcher_temporary_redis_failures_do_not_crash_worker(dispatcher):
    """Test 8: Temporary Redis failures do not crash the worker"""
    mock_redis = MagicMock()
    mock_redis.hgetall.side_effect = redis.ConnectionError("Connection refused by Redis")

    # Must return 0 safely without re-raising exception
    count = dispatcher.sync_from_redis(mock_redis)
    assert count == 0


def test_dispatcher_periodic_synchronization_stops_cleanly():
    """Test 9: Periodic synchronization task stops cleanly during dispatcher shutdown"""
    mock_callback = MagicMock()
    disp = DynamicStreamDispatcher(
        sample_fps=3.0,
        reconcile_interval=0.1,  # Short interval for quick test
        frame_callback=mock_callback,
        enabled=True,
    )

    with patch.object(disp, "_run_listener_loop"), \
         patch.object(disp, "sync_from_redis") as mock_sync:

        disp.start_listener()
        assert disp._reconcile_thread is not None
        assert disp._reconcile_thread.is_alive()

        # Allow reconciliation thread to execute at least one cycle
        time.sleep(0.25)
        assert mock_sync.call_count >= 1

        disp.stop()
        # Verify thread joined cleanly
        assert not disp._reconcile_thread.is_alive()


def test_dispatcher_redispatch_wakes_disconnected_consumer(dispatcher):
    """Test 10: ACTIVATE redispatch awakens disconnected consumer without duplicate spawn"""
    with patch.object(StreamConsumer, "start") as mock_start, \
         patch.object(StreamConsumer, "is_running", return_value=True), \
         patch.object(StreamConsumer, "wake_reconnect") as mock_wake:

        # Initial activation
        dispatcher.add_camera("CAM-AHM-01", "rtsp://gateway:8554/cam-ahm-01")
        assert mock_start.call_count == 1
        consumer = dispatcher.get_consumer("CAM-AHM-01")
        assert consumer is not None

        # Simulate camera disconnected / in backoff
        consumer.health_tracker.status = StreamStatus.OFFLINE

        # Re-dispatch ACTIVATE: must awaken existing consumer, NOT spawn new one
        res = dispatcher.add_camera("CAM-AHM-01", "rtsp://gateway:8554/cam-ahm-01")
        assert res is True
        assert mock_start.call_count == 1  # No duplicate start
        mock_wake.assert_called_once()     # Awakened immediately


def test_dispatcher_redispatch_idempotent_when_connected(dispatcher):
    """Test 11: ACTIVATE redispatch on actively CONNECTED stream is an idempotent no-op"""
    with patch.object(StreamConsumer, "start") as mock_start, \
         patch.object(StreamConsumer, "is_running", return_value=True), \
         patch.object(StreamConsumer, "wake_reconnect") as mock_wake:

        dispatcher.add_camera("CAM-AHM-01", "rtsp://gateway:8554/cam-ahm-01")
        consumer = dispatcher.get_consumer("CAM-AHM-01")
        # Mark actively connected
        consumer.health_tracker.status = StreamStatus.CONNECTED

        res = dispatcher.add_camera("CAM-AHM-01", "rtsp://gateway:8554/cam-ahm-01")
        assert res is True
        assert mock_start.call_count == 1
        mock_wake.assert_not_called()

