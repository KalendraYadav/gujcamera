"""
Unit Tests for Vehicle Detector, Plate Localizer, and Inference Pipeline (Phase 3C)
"""

import time
from unittest.mock import MagicMock, patch
import numpy as np
import pytest

from app.detection_contract import (
    BoundingBox,
    DetectedObject,
    DetectedPlate,
    VehicleClass,
)
from app.detector import InferencePipeline, PlateLocalizer, YoloVehicleDetector
from app.detector.base import BasePlateDetector, BaseVehicleDetector
from app.frame_contract import FramePayload


def test_yolo_vehicle_detector_missing_model_fallback():
    detector = YoloVehicleDetector(model_path="/non/existent/model.pt")
    assert detector.is_ready() is False
    # Calling detect on unready detector returns empty list safely
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    assert detector.detect(dummy_frame) == []


def test_yolo_vehicle_detector_empty_frame_handling():
    detector = YoloVehicleDetector(model_path="/non/existent/model.pt")
    assert detector.detect(None) == []  # type: ignore
    assert detector.detect(np.zeros((0, 0, 3), dtype=np.uint8)) == []


def test_plate_localizer_empty_vehicles():
    localizer = PlateLocalizer()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    plates = localizer.localize(frame, [])
    assert plates == []


def test_plate_localizer_morphological_output_contract():
    """Verify that plate localizer produces valid DetectedPlate with bbox and confidence only"""
    localizer = PlateLocalizer()
    # Create a frame with a simulated vehicle crop
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw simulated white license plate on dark vehicle background
    cv2_simulated = np.zeros((200, 300, 3), dtype=np.uint8)
    # Plate rectangle with aspect ratio ~3.5 (w=120, h=35)
    cv2_simulated[130:165, 90:210] = 255

    frame[100:300, 100:400] = cv2_simulated

    vehicle = DetectedObject(
        object_id="veh_test_01",
        vehicle_class=VehicleClass.CAR,
        confidence=0.85,
        bbox=BoundingBox(x1=100, y1=100, x2=400, y2=300),
    )

    plates = localizer.localize(frame, [vehicle])
    # The morphological localizer should find the high-contrast rectangular region
    assert isinstance(plates, list)
    for p in plates:
        assert isinstance(p, DetectedPlate)
        assert p.vehicle_id == "veh_test_01"
        assert p.confidence > 0.0
        assert p.bbox.validate(640, 480) is True
        # Explicit check: NO plate text and NO image crop attribute
        assert not hasattr(p, "plate_number")
        assert not hasattr(p, "text")
        assert not hasattr(p, "crop")


def test_plate_localizer_mode_reporting():
    """Verify that localizer correctly reports HEURISTIC_PLATE_LOCALIZER when no ML model weights are given"""
    localizer = PlateLocalizer()
    assert localizer.mode_name == "HEURISTIC_PLATE_LOCALIZER"


class DummyVehicleDetector(BaseVehicleDetector):
    def __init__(self, objects):
        self.objects = objects

    def is_ready(self) -> bool:
        return True

    def detect(self, frame):
        return self.objects


class DummyPlateDetector(BasePlateDetector):
    def __init__(self, plates, mode_name="HEURISTIC_PLATE_LOCALIZER"):
        self.plates = plates
        self._mode_name = mode_name

    def localize(self, frame, vehicle_objects):
        return self.plates

    @property
    def mode_name(self) -> str:
        return self._mode_name


def test_inference_pipeline_execution():
    sim_veh = DetectedObject(
        object_id="veh_01",
        vehicle_class=VehicleClass.CAR,
        confidence=0.90,
        bbox=BoundingBox(50, 50, 200, 200),
    )
    sim_plate = DetectedPlate(
        plate_id="plt_01",
        bbox=BoundingBox(90, 150, 160, 175),
        confidence=0.82,
        vehicle_id="veh_01",
    )

    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([sim_veh]),
        plate_detector=DummyPlateDetector([sim_plate], mode_name="HEURISTIC_PLATE_LOCALIZER"),
    )

    matrix = np.zeros((480, 640, 3), dtype=np.uint8)
    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=1,
        captured_at=time.time(),
        sampled_at=time.time(),
        width=640,
        height=480,
        frame=matrix,
    )

    result = pipeline.process_frame(payload)

    assert result.camera_id == "CAM-AHM-01"
    assert result.frame_sequence == 1
    assert result.vehicle_count == 1
    assert result.plate_count == 1
    assert result.plate_localizer_mode == "HEURISTIC_PLATE_LOCALIZER"
    assert result.inference_latency_ms >= 0.0

    metrics = pipeline.get_metrics()
    assert metrics["total_inferences"] == 1
    assert metrics["total_vehicles_detected"] == 1
    assert metrics["total_plates_localized"] == 1
    assert metrics["plate_localizer_mode"] == "HEURISTIC_PLATE_LOCALIZER"
    assert metrics["avg_latency_ms"] >= 0.0


def test_inference_pipeline_detector_exception_isolation():
    """Verify that an exception inside a detector does not crash the pipeline"""
    failing_detector = MagicMock()
    failing_detector.detect.side_effect = RuntimeError("Inference kernel crashed")

    pipeline = InferencePipeline(
        vehicle_detector=failing_detector,
        plate_detector=DummyPlateDetector([]),
    )

    matrix = np.zeros((480, 640, 3), dtype=np.uint8)
    payload = FramePayload(
        camera_id="CAM-AHM-02",
        frame_index=5,
        captured_at=time.time(),
        sampled_at=time.time(),
        width=640,
        height=480,
        frame=matrix,
    )

    # Should not raise exception
    result = pipeline.process_frame(payload)
    assert result.camera_id == "CAM-AHM-02"
    assert result.vehicle_count == 0
    assert result.plate_count == 0
