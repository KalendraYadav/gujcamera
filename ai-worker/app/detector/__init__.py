"""
Detector Subsystem Package for AI Vision Worker (Phase 3C)
"""

from app.detector.base import BaseVehicleDetector, BasePlateDetector
from app.detector.yolo_vehicle import YoloVehicleDetector
from app.detector.plate_localizer import PlateLocalizer
from app.detector.pipeline import InferencePipeline

__all__ = [
    "BaseVehicleDetector",
    "BasePlateDetector",
    "YoloVehicleDetector",
    "PlateLocalizer",
    "InferencePipeline",
]
