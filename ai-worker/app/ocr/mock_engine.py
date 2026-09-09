"""
Mock OCR Engine for Testing (Phase 3D)
Provides deterministic responses without external binary dependencies.
"""

from typing import Dict, Optional, Tuple
import numpy as np

from app.ocr.base import BaseOCREngine


class MockOCREngine(BaseOCREngine):
    """Configurable mock OCR engine for unit and contract testing"""

    def __init__(
        self,
        default_text: str = "",
        default_confidence: Optional[float] = None,
        is_ready_state: bool = True,
    ):
        self.default_text = default_text
        self.default_confidence = default_confidence
        self._ready = is_ready_state
        self.crop_map: Dict[str, Tuple[str, Optional[float]]] = {}

    def set_response_for_key(self, key: str, text: str, confidence: Optional[float]):
        self.crop_map[key] = (text, confidence)

    def is_ready(self) -> bool:
        return self._ready

    @property
    def engine_name(self) -> str:
        return "MOCK_OCR"

    def recognize(self, image: np.ndarray) -> Tuple[str, Optional[float], str]:
        if not self.is_ready():
            return "", None, "engine_unavailable"

        if image is None or image.size == 0:
            return "", None, "empty_crop"

        return self.default_text, self.default_confidence, "mock_variant"
