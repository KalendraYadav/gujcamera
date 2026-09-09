"""
Unit Tests for Stream Consumer (Phase 3B)
"""

import time
from unittest.mock import MagicMock, patch
import numpy as np
import pytest

from app.config import CameraConfig
from app.health import CameraHealthTracker, StreamStatus
from app.stream_consumer import StreamConsumer
from app.frame_contract import FramePayload


@pytest.fixture
def mock_cam_config():
    return CameraConfig(id="CAM-TEST", url="rtsp://video-gateway:8554/cam-test")


@pytest.fixture
def health_tracker():
    return CameraHealthTracker("CAM-TEST")


def test_consumer_initialization(mock_cam_config, health_tracker):
    consumer = StreamConsumer(
        config=mock_cam_config,
        health_tracker=health_tracker,
        sample_fps=4.0,
        base_reconnect_delay=1.0,
        max_reconnect_delay=10.0,
        decode_failure_threshold=3,
    )
    assert consumer.sample_fps == 4.0
    assert consumer.sample_interval == 0.25
    assert consumer.base_reconnect_delay == 1.0
    assert consumer.max_reconnect_delay == 10.0
    assert consumer.decode_failure_threshold == 3
    assert not consumer.is_running()


def test_consumer_sampling_cadence(mock_cam_config, health_tracker):
    """Verify that consumer samples frames only when sample_interval has elapsed"""
    sampled_payloads = []

    def callback(payload: FramePayload):
        sampled_payloads.append(payload)

    consumer = StreamConsumer(
        config=mock_cam_config,
        health_tracker=health_tracker,
        sample_fps=5.0,  # 0.2s interval
        frame_callback=callback,
    )

    # Mock cv2.VideoCapture with deterministic frames
    fake_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True

    # Return 10 frames with simulated timestamps
    call_count = 0
    def mock_read():
        nonlocal call_count
        call_count += 1
        if call_count > 10:
            consumer._stop_event.set()
            return False, None
        return True, fake_frame

    mock_cap.read.side_effect = mock_read

    with patch.object(consumer, "_open_capture", return_value=mock_cap):
        # Run consume stream directly once
        consumer._consume_stream()

    # 10 frames read
    assert health_tracker.frames_received == 10
    # At least 1 sampled frame was passed to callback
    assert health_tracker.frames_sampled >= 1
    assert len(sampled_payloads) == health_tracker.frames_sampled
    assert sampled_payloads[0].camera_id == "CAM-TEST"
    assert sampled_payloads[0].width == 640
    assert sampled_payloads[0].height == 480


def test_consumer_decode_failures_trigger_reconnect(mock_cam_config, health_tracker):
    """Verify that consecutive decode failures exceeding threshold exit stream consume"""
    consumer = StreamConsumer(
        config=mock_cam_config,
        health_tracker=health_tracker,
        decode_failure_threshold=3,
    )

    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    # Always return failure
    mock_cap.read.return_value = (False, None)

    with patch.object(consumer, "_open_capture", return_value=mock_cap):
        consumer._consume_stream()

    # Should have recorded 3 decode failures before breaking out
    assert health_tracker.decode_failures == 3
    mock_cap.release.assert_called_once()


def test_consumer_open_capture_failure(mock_cam_config, health_tracker):
    """Verify that failing to open capture sets OFFLINE without crashing"""
    consumer = StreamConsumer(
        config=mock_cam_config,
        health_tracker=health_tracker,
    )

    with patch.object(consumer, "_open_capture", return_value=None):
        consumer._consume_stream()

    assert health_tracker.status == StreamStatus.OFFLINE


def test_consumer_start_and_stop_lifecycle(mock_cam_config, health_tracker):
    consumer = StreamConsumer(
        config=mock_cam_config,
        health_tracker=health_tracker,
        base_reconnect_delay=0.1,
    )

    # Mock _run_reconnect_loop to just wait on stop_event
    with patch.object(consumer, "_consume_stream") as mock_consume:
        def wait_stop():
            consumer._stop_event.wait(timeout=0.2)
        mock_consume.side_effect = wait_stop

        consumer.start()
        assert consumer.is_running()

        # Stop consumer
        consumer.stop(timeout=1.0)
        assert not consumer.is_running()
        assert health_tracker.status == StreamStatus.STOPPED
