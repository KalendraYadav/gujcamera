"""
Unit Tests for Configuration Management (Phase 3B)
"""

import json
import pytest
from app.config import Settings, CameraConfig, sanitize_url


def test_sanitize_url():
    raw_url = "rtsp://admin:P@ssword123!@192.168.1.100:554/stream1"
    sanitized = sanitize_url(raw_url)
    assert "admin" not in sanitized
    assert "P@ssword123!" not in sanitized
    assert sanitized == "rtsp://***:***@192.168.1.100:554/stream1"

    # URL without credentials
    clean_url = "rtsp://video-gateway:8554/cam-ahm-01"
    assert sanitize_url(clean_url) == clean_url


def test_camera_config_sanitization():
    cam = CameraConfig(id="CAM-TEST", url="rtsp://operator:secret@gateway:8554/test")
    assert cam.sanitized_url() == "rtsp://***:***@gateway:8554/test"


def test_default_cameras_when_empty():
    settings = Settings(CAMERA_STREAMS="", CAMERAS_JSON="")
    cameras = settings.get_camera_configs()
    assert len(cameras) == 2
    assert cameras[0].id == "CAM-AHM-01"
    assert cameras[0].url == "rtsp://video-gateway:8554/cam-ahm-01"
    assert cameras[1].id == "CAM-AHM-02"
    assert cameras[1].url == "rtsp://video-gateway:8554/cam-ahm-02"


def test_camera_streams_env_parsing():
    stream_str = "CAM-01=rtsp://host1:8554/live,CAM-02=rtsp://host2:8554/live"
    settings = Settings(CAMERA_STREAMS=stream_str)
    cameras = settings.get_camera_configs()
    assert len(cameras) == 2
    assert cameras[0].id == "CAM-01"
    assert cameras[0].url == "rtsp://host1:8554/live"
    assert cameras[1].id == "CAM-02"
    assert cameras[1].url == "rtsp://host2:8554/live"


def test_cameras_json_env_parsing():
    json_str = json.dumps([
        {"id": "CAM-JSON-1", "url": "rtsp://gw:8554/json1"},
        {"id": "CAM-JSON-2", "url": "rtsp://gw:8554/json2"}
    ])
    settings = Settings(CAMERAS_JSON=json_str)
    cameras = settings.get_camera_configs()
    assert len(cameras) == 2
    assert cameras[0].id == "CAM-JSON-1"
    assert cameras[1].id == "CAM-JSON-2"


def test_sample_fps_bounds():
    s = Settings(SAMPLE_FPS=5.0)
    assert s.SAMPLE_FPS == 5.0

    with pytest.raises(Exception):
        Settings(SAMPLE_FPS=0.1)  # Below minimum 0.5

    with pytest.raises(Exception):
        Settings(SAMPLE_FPS=60.0)  # Above maximum 30.0


def test_consensus_window_bounds():
    """
    Critical Check 1 & 11:
    CONSENSUS_WINDOW_SIZE must be strictly between 5 and 8 frames (inclusive).
    Default must be 5. Values 4 and 9 must be rejected.
    """
    # Default is 5
    s_default = Settings()
    assert s_default.CONSENSUS_WINDOW_SIZE == 5

    # 5 is valid
    s5 = Settings(CONSENSUS_WINDOW_SIZE=5)
    assert s5.CONSENSUS_WINDOW_SIZE == 5

    # 8 is valid
    s8 = Settings(CONSENSUS_WINDOW_SIZE=8)
    assert s8.CONSENSUS_WINDOW_SIZE == 8

    # 4 is rejected / invalid (< 5)
    with pytest.raises(Exception):
        Settings(CONSENSUS_WINDOW_SIZE=4)

    # 9 is rejected / invalid (> 8)
    with pytest.raises(Exception):
        Settings(CONSENSUS_WINDOW_SIZE=9)

