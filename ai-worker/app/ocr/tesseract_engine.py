"""
Tesseract OCR Engine Implementation (Phase 3D)
Wraps Tesseract 5 LSTM engine with single text line segmentation and image_to_data confidence extraction.
"""

import logging
import shutil
from typing import Optional, Tuple
import numpy as np

from app.ocr.base import BaseOCREngine
from app.ocr.preprocessor import preprocess_plate_crop

logger = logging.getLogger("ai_worker.ocr.tesseract")

# Tesseract configuration for license plate reading:
# PSM 7: Treat the image as a single text line
# Using standard LSTM engine without artificial character whitelists preserves native Tesseract word-level confidence values
TESSERACT_PLATE_CONFIG = "--psm 7"


class TesseractOCREngine(BaseOCREngine):
    """
    Tesseract 5 LSTM OCR Engine for license plate recognition.
    Extracts raw text and computes aggregate confidence from the word-level confidence
    values returned by Tesseract's image_to_data output, normalized to the [0.0, 1.0] range.
    """

    def __init__(self, tesseract_cmd: Optional[str] = None):
        self._is_ready = False
        self._tesseract_cmd = tesseract_cmd or shutil.which("tesseract") or "/usr/bin/tesseract"

        self._check_availability()

    def _check_availability(self) -> None:
        """Verify presence of Tesseract binary and pytesseract library"""
        try:
            import pytesseract

            if self._tesseract_cmd:
                pytesseract.pytesseract.tesseract_cmd = self._tesseract_cmd

            # Simple test to check whether binary is functional
            version = pytesseract.get_tesseract_version()
            self._is_ready = True
            logger.info("Tesseract OCR initialized successfully (version: %s, binary: %s)", version, self._tesseract_cmd)
        except Exception as ex:
            logger.warning(
                "Tesseract OCR is not available in current environment (%s). OCR engine will run in fallback idle mode.",
                str(ex),
            )
            self._is_ready = False

    def is_ready(self) -> bool:
        return self._is_ready

    @property
    def engine_name(self) -> str:
        return "TESSERACT_OCR"

    def recognize(self, crop: np.ndarray) -> Tuple[str, Optional[float], str]:
        """
        Run preprocessing and Tesseract character recognition on plate crop.

        Args:
            crop: BGR cropped license plate matrix

        Returns:
            Tuple of (raw_text: str, confidence: Optional[float], variant: str)
        """
        if not self.is_ready():
            return "", None, "engine_unavailable"

        if crop is None or crop.size == 0:
            return "", None, "empty_crop"

        try:
            import pytesseract

            # Apply deterministic CCTV plate preprocessing
            processed, variant = preprocess_plate_crop(crop, target_height=64, variant="clahe_otsu")
            if processed is None or processed.size == 0:
                return "", None, "preprocess_failed"

            # Execute Tesseract data extraction
            data = pytesseract.image_to_data(
                processed,
                config=TESSERACT_PLATE_CONFIG,
                output_type=pytesseract.Output.DICT,
            )

            texts = data.get("text", [])
            confs = data.get("conf", [])

            valid_words = []
            valid_confs = []

            for text, conf in zip(texts, confs):
                clean_text = text.strip()
                try:
                    conf_val = float(conf)
                except (ValueError, TypeError):
                    conf_val = -1.0

                # Tesseract reports -1 for bounding boxes with no text
                if clean_text and conf_val >= 0:
                    valid_words.append(clean_text)
                    valid_confs.append(conf_val)

            if not valid_words:
                return "", None, variant

            raw_text = " ".join(valid_words)
            # Average confidence scaled to [0.0, 1.0]
            avg_conf = (sum(valid_confs) / len(valid_confs)) / 100.0 if valid_confs else None

            return raw_text, avg_conf, variant

        except Exception as ex:
            logger.error("Error during Tesseract OCR inference: %s", str(ex), exc_info=True)
            return "", None, "exception"
