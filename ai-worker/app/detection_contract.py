"""
In-Memory Detection Contract for AI Vision Pipeline (Phase 3C)
Defines structured entities for Vehicle Detection and License Plate Localization.
Independent from Prisma database models and external persistence.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
import numpy as np


class VehicleClass(str, Enum):
    """Normalized road-vehicle classification vocabulary"""
    CAR = "CAR"
    MOTORCYCLE = "MOTORCYCLE"
    BUS = "BUS"
    TRUCK = "TRUCK"
    OTHER_VEHICLE = "OTHER_VEHICLE"

    @classmethod
    def from_detector_label(cls, label: str) -> "VehicleClass":
        """Map raw detector label string or COCO class name to normalized vocabulary"""
        clean = label.strip().lower().replace("-", "_").replace(" ", "_")
        mapping = {
            "car": cls.CAR,
            "automobile": cls.CAR,
            "sedan": cls.CAR,
            "suv": cls.CAR,
            "motorcycle": cls.MOTORCYCLE,
            "motorbike": cls.MOTORCYCLE,
            "scooter": cls.MOTORCYCLE,
            "bike": cls.MOTORCYCLE,
            "bus": cls.BUS,
            "minibus": cls.BUS,
            "truck": cls.TRUCK,
            "lorry": cls.TRUCK,
            "pickup": cls.TRUCK,
            "van": cls.OTHER_VEHICLE,
            "auto_rickshaw": cls.OTHER_VEHICLE,
            "rickshaw": cls.OTHER_VEHICLE,
            "three_wheeler": cls.OTHER_VEHICLE,
            "tractor": cls.OTHER_VEHICLE,
            "other": cls.OTHER_VEHICLE,
        }
        return mapping.get(clean, cls.OTHER_VEHICLE)


@dataclass(slots=True)
class BoundingBox:
    """Standardized 2D bounding box in pixel coordinates [x1, y1, x2, y2]"""
    x1: int
    y1: int
    x2: int
    y2: int

    @property
    def width(self) -> int:
        return max(0, self.x2 - self.x1)

    @property
    def height(self) -> int:
        return max(0, self.y2 - self.y1)

    @property
    def area(self) -> int:
        return self.width * self.height

    def to_list(self) -> List[int]:
        return [self.x1, self.y1, self.x2, self.y2]

    def to_dict(self) -> Dict[str, int]:
        return {"x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2}

    def validate(self, frame_w: int, frame_h: int) -> bool:
        """Validate that coordinates form a non-empty box within frame bounds"""
        if frame_w <= 0 or frame_h <= 0:
            return False
        if self.x1 < 0 or self.y1 < 0:
            return False
        if self.x1 >= self.x2 or self.y1 >= self.y2:
            return False
        if self.x2 > frame_w or self.y2 > frame_h:
            return False
        return True

    def clip(self, frame_w: int, frame_h: int) -> "BoundingBox":
        """Clamp coordinates within frame bounds"""
        cx1 = max(0, min(self.x1, frame_w - 1))
        cy1 = max(0, min(self.y1, frame_h - 1))
        cx2 = max(cx1 + 1, min(self.x2, frame_w))
        cy2 = max(cy1 + 1, min(self.y2, frame_h))
        return BoundingBox(x1=cx1, y1=cy1, x2=cx2, y2=cy2)


@dataclass(slots=True)
class DetectedObject:
    """A detected vehicle entity in a single frame"""
    object_id: str
    vehicle_class: VehicleClass
    confidence: float
    bbox: BoundingBox

    def to_dict(self) -> Dict[str, Any]:
        return {
            "object_id": self.object_id,
            "class": self.vehicle_class.value,
            "confidence": round(self.confidence, 4),
            "bbox": self.bbox.to_list(),
        }


@dataclass(slots=True)
class DetectedPlate:
    """A localized license plate bounding box within a frame (NO OCR, NO image crop in Phase 3C)"""
    plate_id: str
    bbox: BoundingBox
    confidence: float
    vehicle_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plate_id": self.plate_id,
            "vehicle_id": self.vehicle_id,
            "confidence": round(self.confidence, 4),
            "bbox": self.bbox.to_list(),
        }


@dataclass(slots=True)
class DetectionResult:
    """Frame-level structured detection outcome containing vehicles and localized plates"""
    camera_id: str
    captured_at: float
    frame_sequence: int
    frame_width: int
    frame_height: int
    inference_timestamp: float
    inference_latency_ms: float
    plate_localizer_mode: str = "HEURISTIC_PLATE_LOCALIZER"
    detected_objects: List[DetectedObject] = field(default_factory=list)
    plates: List[DetectedPlate] = field(default_factory=list)

    @property
    def vehicle_count(self) -> int:
        return len(self.detected_objects)

    @property
    def plate_count(self) -> int:
        return len(self.plates)

    def summary(self) -> Dict[str, Any]:
        """Produce lightweight summary dictionary for logging and metrics"""
        return {
            "camera_id": self.camera_id,
            "frame_sequence": self.frame_sequence,
            "dimensions": f"{self.frame_width}x{self.frame_height}",
            "latency_ms": round(self.inference_latency_ms, 2),
            "plate_localizer_mode": self.plate_localizer_mode,
            "vehicles": [obj.to_dict() for obj in self.detected_objects],
            "plates": [plate.to_dict() for plate in self.plates],
        }
