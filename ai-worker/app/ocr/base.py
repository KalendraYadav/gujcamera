"""
Abstract Base Class for OCR Engines (Phase 3D)
Defines clean pluggable interface for optical character recognition.
"""

from abc import ABC, abstractmethod
from typing import Optional, Tuple
import numpy as np


class BaseOCREngine(ABC):
    """Abstract interface for license plate optical character recognition"""

    @abstractmethod
    def recognize(self, image: np.ndarray) -> Tuple[str, Optional[float], str]:
        """
        Extract text and confidence score from a cropped plate image.

        Args:
            image: Preprocessed or raw crop matrix (np.ndarray)

        Returns:
            Tuple of (raw_text: str, confidence: Optional[float], variant: str).
            If no confidence available, confidence is None.
        """
        pass

    @abstractmethod
    def is_ready(self) -> bool:
        """Check whether the OCR engine is initialized and ready for inference"""
        pass

    @property
    @abstractmethod
    def engine_name(self) -> str:
        """Name of the active OCR engine (e.g. TESSERACT_OCR, MOCK_OCR)"""
        pass
