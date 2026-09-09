"""
In-Memory OCR Result Contract (Phase 3D)
Defines structured entities for License Plate Character Recognition.
Independent from database models and external persistence.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional


class OCRErrorCode(str, Enum):
    """Structured failure categories for plate OCR processing"""
    EMPTY_CROP = "EMPTY_CROP"
    INVALID_BBOX = "INVALID_BBOX"
    CROP_TOO_SMALL = "CROP_TOO_SMALL"
    NO_TEXT_DETECTED = "NO_TEXT_DETECTED"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    OCR_ENGINE_UNAVAILABLE = "OCR_ENGINE_UNAVAILABLE"
    OCR_EXCEPTION = "OCR_EXCEPTION"


@dataclass(slots=True)
class OCRResult:
    """Structured character recognition outcome for a localized license plate"""
    plate_id: str
    raw_text: str
    normalized_text: str
    confidence: Optional[float]
    confidence_available: bool
    format_valid: bool
    engine: str
    processing_latency_ms: float
    preprocessing_variant: str
    success: bool
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plate_id": self.plate_id,
            "raw_text": self.raw_text,
            "normalized_text": self.normalized_text,
            "confidence": round(self.confidence, 4) if self.confidence is not None else None,
            "confidence_available": self.confidence_available,
            "format_valid": self.format_valid,
            "engine": self.engine,
            "latency_ms": round(self.processing_latency_ms, 2),
            "preprocessing_variant": self.preprocessing_variant,
            "success": self.success,
            "error_code": self.error_code,
            "error_message": self.error_message,
        }
