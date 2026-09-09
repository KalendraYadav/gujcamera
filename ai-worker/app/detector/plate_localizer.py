"""
License Plate Localizer (Phase 3C)
Localizes license plate bounding boxes and confidence within vehicle regions.
STRICT SCOPE: Outputs plate bbox + confidence. Zero OCR or text extraction.
"""

import logging
import os
import uuid
from typing import List, Optional
import cv2
import numpy as np

from app.detection_contract import BoundingBox, DetectedObject, DetectedPlate
from app.detector.base import BasePlateDetector

logger = logging.getLogger("ai_worker.plate_localizer")


class PlateLocalizer(BasePlateDetector):
    """
    Two-stage license plate localization component.
    Supports pluggable YOLO plate model or high-accuracy morphological contour localization.
    Produces plate bounding box and confidence score in frame coordinates.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        confidence_threshold: float = 0.35,
        device: str = "cpu",
    ):
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.device = device
        self.yolo_model = None

        if self.model_path and os.path.exists(self.model_path):
            self._load_yolo_model()
        else:
            logger.info("No dedicated plate weights provided; running in HEURISTIC_PLATE_LOCALIZER mode (PoC Fallback).")

    @property
    def mode_name(self) -> str:
        """Return active mode: DEDICATED_ML_PLATE_LOCALIZER or HEURISTIC_PLATE_LOCALIZER"""
        if self.yolo_model is not None:
            return "DEDICATED_ML_PLATE_LOCALIZER"
        return "HEURISTIC_PLATE_LOCALIZER"

    def _load_yolo_model(self) -> None:
        """Load dedicated YOLO plate detector if provided"""
        try:
            from ultralytics import YOLO

            logger.info("Loading dedicated YOLO plate model from %s...", self.model_path)
            self.yolo_model = YOLO(self.model_path, task="detect")
            logger.info("Dedicated YOLO plate model loaded successfully")
        except Exception as ex:
            logger.warning(
                "Failed to load dedicated plate model from %s: %s. Falling back to morphological localizer.",
                self.model_path,
                str(ex),
            )
            self.yolo_model = None

    def localize(
        self, frame: np.ndarray, vehicle_objects: List[DetectedObject]
    ) -> List[DetectedPlate]:
        """
        Localize license plates for identified vehicles in the frame.

        Args:
            frame: Full decoded BGR image matrix
            vehicle_objects: List of detected vehicles in this frame

        Returns:
            List of DetectedPlate instances with bounding boxes and confidence scores.
        """
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            return []

        if not vehicle_objects:
            return []

        frame_h, frame_w = frame.shape[:2]
        all_plates: List[DetectedPlate] = []

        for vehicle in vehicle_objects:
            vb = vehicle.bbox
            # Skip unreasonably small vehicle crops
            if vb.width < 32 or vb.height < 32:
                continue

            # Extract vehicle crop safely
            crop = frame[vb.y1:vb.y2, vb.x1:vb.x2]
            if crop is None or crop.size == 0:
                continue

            if self.yolo_model is not None:
                plates = self._localize_with_yolo(crop, vehicle, vb.x1, vb.y1, frame_w, frame_h)
            else:
                plates = self._localize_with_morphology(crop, vehicle, vb.x1, vb.y1, frame_w, frame_h)

            all_plates.extend(plates)

        return all_plates

    def _localize_with_yolo(
        self,
        crop: np.ndarray,
        vehicle: DetectedObject,
        offset_x: int,
        offset_y: int,
        frame_w: int,
        frame_h: int,
    ) -> List[DetectedPlate]:
        """Localize plate using dedicated YOLO model on vehicle crop"""
        try:
            results = self.yolo_model.predict(
                source=crop,
                conf=self.confidence_threshold,
                device=self.device,
                verbose=False,
            )
            if not results or len(results) == 0:
                return []

            boxes = results[0].boxes
            if boxes is None or len(boxes) == 0:
                return []

            plates: List[DetectedPlate] = []
            for idx in range(len(boxes)):
                conf = float(boxes.conf[idx].item())
                if conf < self.confidence_threshold:
                    continue

                xyxy = boxes.xyxy[idx].cpu().numpy()
                px1 = int(round(xyxy[0])) + offset_x
                py1 = int(round(xyxy[1])) + offset_y
                px2 = int(round(xyxy[2])) + offset_x
                py2 = int(round(xyxy[3])) + offset_y

                bbox = BoundingBox(x1=px1, y1=py1, x2=px2, y2=py2).clip(frame_w, frame_h)
                plate_id = f"plt_{uuid.uuid4().hex[:8]}"

                plates.append(
                    DetectedPlate(
                        plate_id=plate_id,
                        bbox=bbox,
                        confidence=conf,
                        vehicle_id=vehicle.object_id,
                    )
                )

            return plates
        except Exception as ex:
            logger.warning("Error in YOLO plate localization: %s", str(ex))
            return []

    def _localize_with_morphology(
        self,
        crop: np.ndarray,
        vehicle: DetectedObject,
        offset_x: int,
        offset_y: int,
        frame_w: int,
        frame_h: int,
    ) -> List[DetectedPlate]:
        """
        Localize license plate using morphological gradient and aspect ratio filtering.
        Focuses on the lower 60% of the vehicle crop where license plates are standardly placed.
        """
        vh, vw = crop.shape[:2]
        # Search lower 65% of vehicle crop
        y_search_start = int(vh * 0.35)
        roi = crop[y_search_start:vh, 0:vw]
        if roi.size == 0:
            return []

        roi_h, roi_w = roi.shape[:2]

        try:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            # Contrast normalization
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            contrast = clahe.apply(gray)

            # Sobel horizontal gradient (detecting vertical character edges of plate)
            grad_x = cv2.Sobel(contrast, cv2.CV_16S, 1, 0, ksize=3)
            abs_grad_x = cv2.convertScaleAbs(grad_x)

            # Morphological close with horizontal rectangular kernel
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 3))
            closed = cv2.morphologyEx(abs_grad_x, cv2.MORPH_CLOSE, kernel)

            # Otsu thresholding
            _, thresh = cv2.threshold(closed, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

            # Clean noise with additional horizontal close
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

            # Find external contours
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            candidates: List[DetectedPlate] = []
            roi_area = roi_w * roi_h

            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                if h <= 0 or w <= 0:
                    continue

                aspect_ratio = float(w) / float(h)
                area = w * h

                # Indian license plates: standard aspect ratio 2.0 to 5.5
                # Area between 0.5% and 25% of the vehicle ROI
                if 2.0 <= aspect_ratio <= 5.5 and (0.005 * roi_area) <= area <= (0.25 * roi_area):
                    if w < 24 or h < 8:
                        continue

                    # Calculate confidence based on ideal aspect ratio ~3.5:1 and fill density
                    ratio_diff = abs(aspect_ratio - 3.5) / 3.5
                    ratio_score = max(0.0, 1.0 - ratio_diff)
                    cnt_area = cv2.contourArea(cnt)
                    extent = float(cnt_area) / area
                    conf = min(0.95, max(self.confidence_threshold, (ratio_score * 0.6) + (extent * 0.4)))

                    if conf >= self.confidence_threshold:
                        # Convert back to full frame coordinates
                        fx1 = offset_x + x
                        fy1 = offset_y + y_search_start + y
                        fx2 = fx1 + w
                        fy2 = fy1 + h

                        bbox = BoundingBox(x1=fx1, y1=fy1, x2=fx2, y2=fy2).clip(frame_w, frame_h)
                        plate_id = f"plt_{uuid.uuid4().hex[:8]}"

                        # NOTE: Heuristic score represents geometric aspect-ratio/fill fitness, NOT ML model confidence
                        candidates.append(
                            DetectedPlate(
                                plate_id=plate_id,
                                bbox=bbox,
                                confidence=round(conf, 3),
                                vehicle_id=vehicle.object_id,
                            )
                        )

            # Return top candidate per vehicle (highest confidence)
            if candidates:
                candidates.sort(key=lambda p: p.confidence, reverse=True)
                return [candidates[0]]

            return []

        except Exception as ex:
            logger.debug("Morphological plate localization error: %s", str(ex))
            return []
