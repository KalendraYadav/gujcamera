"""
Controlled Fixture Tests for OCR Engine (Phase 3D)
Validates character extraction against synthetic, deterministic test plate images.
DISCLAIMER: Controlled test fixtures validate OCR component mechanics; they do not represent real-world CCTV accuracy.
"""

import cv2
import numpy as np
import pytest

from app.ocr import (
    TesseractOCREngine,
    is_valid_indian_plate_format,
    normalize_license_plate,
)


def create_synthetic_plate_image(text: str, width: int = 280, height: int = 70) -> np.ndarray:
    """
    Generate synthetic license plate image with black text on white background.
    Used exclusively as a deterministic, controlled test fixture.
    """
    img = np.full((height, width, 3), 255, dtype=np.uint8)

    # Clean centered text with standard font scaling
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 1.1
    thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(text, font, font_scale, thickness)

    text_x = max(15, (width - text_w) // 2)
    text_y = int((height + text_h) / 2)

    cv2.putText(img, text, (text_x, text_y), font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)
    return img


def test_tesseract_ocr_controlled_fixture():
    engine = TesseractOCREngine()
    if not engine.is_ready():
        pytest.skip("Tesseract OCR is not installed or available in this test environment")

    # Controlled fixture 1: "GJ 01 AB 1234" (standard Indian registration plate spacing)
    fixture_gj = create_synthetic_plate_image("GJ 01 AB 1234")
    raw_text, conf, variant = engine.recognize(fixture_gj)

    normalized = normalize_license_plate(raw_text)
    assert normalized == "GJ01AB1234"
    assert is_valid_indian_plate_format(normalized) is True
    if conf is not None:
        assert conf >= 0.50

    # Controlled fixture 2: "MH 12 CD 5678"
    fixture_mh = create_synthetic_plate_image("MH 12 CD 5678")
    raw_text2, conf2, variant2 = engine.recognize(fixture_mh)

    normalized2 = normalize_license_plate(raw_text2)
    assert normalized2 == "MH12CD5678"
    assert is_valid_indian_plate_format(normalized2) is True


def test_tesseract_ocr_noise_fixture_produces_no_fake_plate():
    engine = TesseractOCREngine()
    if not engine.is_ready():
        pytest.skip("Tesseract OCR is not installed or available in this test environment")

    # Blank image with slight random noise
    noise_img = np.random.randint(200, 255, (60, 240, 3), dtype=np.uint8)
    raw_text, conf, variant = engine.recognize(noise_img)

    normalized = normalize_license_plate(raw_text)
    # Must not hallucinate a valid plate from noise
    assert is_valid_indian_plate_format(normalized) is False
