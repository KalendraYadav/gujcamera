"""
Unit Tests for Plate Crop Preparation and Preprocessing (Phase 3D)
"""

import numpy as np
from app.detection_contract import BoundingBox
from app.ocr.preprocessor import prepare_plate_crop, preprocess_plate_crop


def test_prepare_plate_crop_valid_bounds():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[100:150, 200:350] = 255  # Draw mock white region

    bbox = BoundingBox(x1=200, y1=100, x2=350, y2=150)
    crop = prepare_plate_crop(frame, bbox)

    assert crop is not None
    assert crop.shape == (50, 150, 3)
    assert np.mean(crop) == 255


def test_prepare_plate_crop_out_of_bounds_clipping():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Box extending outside right and bottom of frame
    bbox = BoundingBox(x1=500, y1=400, x2=700, y2=550)
    crop = prepare_plate_crop(frame, bbox)

    assert crop is not None
    # Clipped to (480-400, 640-500) = (80, 140)
    assert crop.shape == (80, 140, 3)


def test_prepare_plate_crop_too_small_returns_none():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    tiny_box = BoundingBox(x1=10, y1=10, x2=20, y2=15)  # w=10 < 24, h=5 < 8
    crop = prepare_plate_crop(frame, tiny_box)
    assert crop is None


def test_prepare_plate_crop_invalid_inputs():
    assert prepare_plate_crop(None, BoundingBox(0, 0, 50, 20)) is None  # type: ignore
    assert prepare_plate_crop(np.zeros((0, 0, 3), dtype=np.uint8), BoundingBox(0, 0, 50, 20)) is None


def test_preprocess_plate_crop_output_matrix():
    raw_crop = np.full((25, 100, 3), fill_value=128, dtype=np.uint8)
    # Mock black character stroke in middle
    raw_crop[10:15, 40:60] = 0

    processed, variant = preprocess_plate_crop(raw_crop, target_height=64, variant="clahe_otsu")

    assert variant == "clahe_otsu"
    assert processed is not None
    assert len(processed.shape) == 2  # Single channel binarized
    assert processed.shape[0] == 64   # Rescaled to target height
    assert processed.dtype == np.uint8
