"""
YOLO-Family Vehicle Detector (Phase 3C)
Runs lightweight YOLOv8 on CPU to detect road vehicles and normalize classes.
"""

import logging
import os
import uuid
from typing import Dict, List, Optional
import numpy as np

from app.detection_contract import BoundingBox, DetectedObject, VehicleClass
from app.detector.base import BaseVehicleDetector

logger = logging.getLogger("ai_worker.yolo_vehicle")

# Standard COCO dataset indices for road vehicles
COCO_VEHICLE_MAP: Dict[int, VehicleClass] = {
    2: VehicleClass.CAR,          # car
    3: VehicleClass.MOTORCYCLE,   # motorcycle
    5: VehicleClass.BUS,          # bus
    7: VehicleClass.TRUCK,        # truck
}


class YoloVehicleDetector(BaseVehicleDetector):
    """
    Lightweight YOLO vehicle detector.
    Defaults to YOLOv8 Nano on CPU with robust class normalization and coordinate clipping.
    """

    def __init__(
        self,
        model_path: str = "/app/models/yolov8n.pt",
        confidence_threshold: float = 0.40,
        device: str = "cpu",
    ):
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.device = device
        self.model = None
        self._is_ready = False

        self._load_model()

    def _load_model(self) -> None:
        """Attempt to load YOLO model weights with graceful error handling"""
        if not os.path.exists(self.model_path):
            logger.warning(
                "YOLO vehicle model weights not found at %s. Vehicle detector will run in fallback idle mode.",
                self.model_path,
            )
            self._is_ready = False
            return

        try:
            from ultralytics import YOLO

            logger.info(
                "Loading YOLO vehicle model from %s (device: %s)...",
                self.model_path,
                self.device,
            )
            # Load model with task set to detect
            self.model = YOLO(self.model_path, task="detect")
            self._is_ready = True
            logger.info("YOLO vehicle detector successfully loaded and initialized on %s", self.device)
        except Exception as ex:
            logger.error(
                "Failed to load YOLO vehicle model from %s: %s. Continuing in safe fallback mode.",
                self.model_path,
                str(ex),
                exc_info=True,
            )
            self.model = None
            self._is_ready = False

    def is_ready(self) -> bool:
        """Check whether the model is loaded and ready for inference"""
        return self._is_ready and self.model is not None

    def detect(self, frame: np.ndarray) -> List[DetectedObject]:
        """
        Detect vehicle objects in a single video frame.

        Args:
            frame: Decoded BGR image matrix (np.ndarray)

        Returns:
            List of DetectedObject instances with normalized classes and bounding boxes.
        """
        if not self.is_ready() or frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            return []

        h, w = frame.shape[:2]
        if w <= 0 or h <= 0:
            return []

        try:
            # Run inference with verbose logging suppressed
            results = self.model.predict(
                source=frame,
                conf=self.confidence_threshold,
                device=self.device,
                verbose=False,
            )

            if not results or len(results) == 0:
                return []

            result = results[0]
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                return []

            detected: List[DetectedObject] = []

            for idx in range(len(boxes)):
                cls_id = int(boxes.cls[idx].item())
                conf = float(boxes.conf[idx].item())

                # Filter for road vehicles only
                if cls_id not in COCO_VEHICLE_MAP:
                    continue

                if conf < self.confidence_threshold:
                    continue

                vehicle_class = COCO_VEHICLE_MAP[cls_id]

                # Extract coordinates [x1, y1, x2, y2]
                xyxy = boxes.xyxy[idx].cpu().numpy()
                raw_box = BoundingBox(
                    x1=int(round(xyxy[0])),
                    y1=int(round(xyxy[1])),
                    x2=int(round(xyxy[2])),
                    y2=int(round(xyxy[3])),
                )

                # Clip coordinates safely to frame boundary
                valid_box = raw_box.clip(w, h)
                if valid_box.width <= 4 or valid_box.height <= 4:
                    continue

                obj_id = f"veh_{uuid.uuid4().hex[:8]}"
                detected.append(
                    DetectedObject(
                        object_id=obj_id,
                        vehicle_class=vehicle_class,
                        confidence=conf,
                        bbox=valid_box,
                    )
                )

            return detected

        except Exception as ex:
            logger.error("Error during YOLO vehicle detection inference: %s", str(ex), exc_info=True)
            return []
