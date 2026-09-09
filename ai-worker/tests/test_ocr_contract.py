"""
Unit Tests for OCR Result Contract (Phase 3D)
"""

from app.ocr.contract import OCRErrorCode, OCRResult


def test_ocr_result_structure():
    res = OCRResult(
        plate_id="plt_001",
        raw_text="GJ 01 AB 1234",
        normalized_text="GJ01AB1234",
        confidence=0.925,
        confidence_available=True,
        format_valid=True,
        engine="TESSERACT_OCR",
        processing_latency_ms=18.5,
        preprocessing_variant="clahe_otsu",
        success=True,
        error_code=None,
        error_message=None,
    )

    assert res.plate_id == "plt_001"
    assert res.raw_text == "GJ 01 AB 1234"
    assert res.normalized_text == "GJ01AB1234"
    assert res.confidence == 0.925
    assert res.confidence_available is True
    assert res.format_valid is True
    assert res.engine == "TESSERACT_OCR"
    assert res.success is True
    assert res.error_code is None

    d = res.to_dict()
    assert d["plate_id"] == "plt_001"
    assert d["normalized_text"] == "GJ01AB1234"
    assert d["confidence"] == 0.925
    assert d["latency_ms"] == 18.5


def test_ocr_result_failure_representation():
    res = OCRResult(
        plate_id="plt_fail_01",
        raw_text="",
        normalized_text="",
        confidence=None,
        confidence_available=False,
        format_valid=False,
        engine="TESSERACT_OCR",
        processing_latency_ms=5.0,
        preprocessing_variant="clahe_otsu",
        success=False,
        error_code=OCRErrorCode.NO_TEXT_DETECTED.value,
        error_message="No alphanumeric characters recognized",
    )

    assert res.success is False
    assert res.confidence is None
    assert res.confidence_available is False
    assert res.error_code == "NO_TEXT_DETECTED"
    d = res.to_dict()
    assert d["confidence"] is None
    assert d["success"] is False
    assert d["error_code"] == "NO_TEXT_DETECTED"
