"""
Optical Character Recognition & Normalization Module (Phase 3D)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
"""

from app.ocr.base import BaseOCREngine
from app.ocr.contract import OCRErrorCode, OCRResult
from app.ocr.mock_engine import MockOCREngine
from app.ocr.normalizer import (
    is_valid_indian_plate_format,
    normalize_license_plate,
    process_plate_text,
)
from app.ocr.preprocessor import prepare_plate_crop, preprocess_plate_crop
from app.ocr.tesseract_engine import TesseractOCREngine

__all__ = [
    "BaseOCREngine",
    "OCRErrorCode",
    "OCRResult",
    "TesseractOCREngine",
    "MockOCREngine",
    "normalize_license_plate",
    "is_valid_indian_plate_format",
    "process_plate_text",
    "prepare_plate_crop",
    "preprocess_plate_crop",
]
