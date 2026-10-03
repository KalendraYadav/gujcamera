"""
Unit Tests for Dynamic Stream Dispatcher
Tests dynamic camera activation, deactivation, Redis hash state sync,
and Pub/Sub event handling without restarting the AI Worker.
"""

import json
import time
from unittest.mock import MagicMock, patch
import pytest

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
