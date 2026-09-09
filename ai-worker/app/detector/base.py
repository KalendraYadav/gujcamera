"""
Abstract Base Classes for Detectors (Phase 3C)
Establishes clean pluggable interfaces for vehicle detection and plate localization.
"""

from abc import ABC, abstractmethod
from typing import List
import numpy as np

from app.detection_contract import DetectedObject, DetectedPlate


class BaseVehicleDetector(ABC):
    """Abstract interface for vehicle bounding box detectors (YOLO family)"""

    @abstractmethod
    def detect(self, frame: np.ndarray) -> List[DetectedObject]:
        """
        Detect vehicle objects in a single video frame.

        Args:
            frame: Decoded BGR image matrix (np.ndarray)

        Returns:
            List of DetectedObject instances with normalized classes and bounding boxes.
        """
        pass

    @abstractmethod
    def is_ready(self) -> bool:
        """Check whether the detector model is loaded and ready for inference"""
        pass


class BasePlateDetector(ABC):
    """Abstract interface for license plate localization within vehicles or frames"""

    @abstractmethod
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
            (Does NOT return plate text - Phase 3C boundary)
        """
        pass

    @property
    @abstractmethod
    def mode_name(self) -> str:
        """Return the active plate localizer mode (e.g. DEDICATED_ML_PLATE_LOCALIZER or HEURISTIC_PLATE_LOCALIZER)"""
        pass
