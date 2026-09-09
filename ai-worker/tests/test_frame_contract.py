"""
Unit Tests for Frame Contract (Phase 3B)
"""

import time
import numpy as np
from app.frame_contract import FramePayload


def test_valid_frame_payload():
    matrix = np.zeros((480, 640, 3), dtype=np.uint8)
    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=42,
        captured_at=time.time(),
        sampled_at=time.time(),
        width=640,
        height=480,
        frame=matrix,
        channels=3,
    )
    assert payload.validate() is True
    summary = payload.summary()
    assert summary["camera_id"] == "CAM-AHM-01"
    assert summary["frame_index"] == 42
    assert summary["dimensions"] == "640x480"
    assert summary["channels"] == 3
    assert summary["byte_size"] == 640 * 480 * 3


def test_invalid_frame_payload_none_frame():
    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=1,
        captured_at=time.time(),
        sampled_at=time.time(),
        width=640,
        height=480,
        frame=None,  # type: ignore
    )
    assert payload.validate() is False


def test_invalid_frame_payload_dimension_mismatch():
    matrix = np.zeros((360, 480, 3), dtype=np.uint8)
    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=1,
        captured_at=time.time(),
        sampled_at=time.time(),
        width=640,  # Mismatch: matrix is 480 wide
        height=480,  # Mismatch: matrix is 360 high
        frame=matrix,
    )
    assert payload.validate() is False


def test_invalid_frame_payload_zero_dimensions():
    matrix = np.zeros((0, 0, 3), dtype=np.uint8)
    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=1,
        captured_at=time.time(),
        sampled_at=time.time(),
        width=0,
        height=0,
        frame=matrix,
    )
    assert payload.validate() is False
