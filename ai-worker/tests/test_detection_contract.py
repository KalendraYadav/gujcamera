"""
Unit Tests for Detection Contract and Entity Validation (Phase 3C)
"""

import numpy as np
import pytest
from app.detection_contract import (
    BoundingBox,
    DetectedObject,
    DetectedPlate,
    DetectionResult,
    VehicleClass,
)


def test_bounding_box_geometry():
    box = BoundingBox(x1=100, y1=150, x2=300, y2=400)
    assert box.width == 200
    assert box.height == 250
    assert box.area == 50000
    assert box.to_list() == [100, 150, 300, 400]
    assert box.to_dict() == {"x1": 100, "y1": 150, "x2": 300, "y2": 400}


def test_bounding_box_validation():
    # Valid box
    assert BoundingBox(10, 20, 100, 200).validate(frame_w=640, frame_h=480) is True

    # Negative coordinates
    assert BoundingBox(-5, 20, 100, 200).validate(frame_w=640, frame_h=480) is False

    # Inverted coordinates (x1 >= x2)
    assert BoundingBox(100, 20, 50, 200).validate(frame_w=640, frame_h=480) is False

    # Exceeding frame bounds
    assert BoundingBox(10, 20, 700, 200).validate(frame_w=640, frame_h=480) is False
    assert BoundingBox(10, 20, 100, 500).validate(frame_w=640, frame_h=480) is False


def test_bounding_box_clipping():
    box = BoundingBox(x1=-20, y1=-10, x2=800, y2=600)
    clipped = box.clip(frame_w=640, frame_h=480)
    assert clipped.x1 == 0
    assert clipped.y1 == 0
    assert clipped.x2 == 640
    assert clipped.y2 == 480
    assert clipped.validate(640, 480) is True


def test_vehicle_class_normalization():
    # Standard vehicles
    assert VehicleClass.from_detector_label("car") == VehicleClass.CAR
    assert VehicleClass.from_detector_label("automobile") == VehicleClass.CAR
    assert VehicleClass.from_detector_label("SUV") == VehicleClass.CAR
    assert VehicleClass.from_detector_label("motorcycle") == VehicleClass.MOTORCYCLE
    assert VehicleClass.from_detector_label("motorbike") == VehicleClass.MOTORCYCLE
    assert VehicleClass.from_detector_label("bus") == VehicleClass.BUS
    assert VehicleClass.from_detector_label("truck") == VehicleClass.TRUCK
    assert VehicleClass.from_detector_label("lorry") == VehicleClass.TRUCK

    # Other vehicles
    assert VehicleClass.from_detector_label("van") == VehicleClass.OTHER_VEHICLE
    assert VehicleClass.from_detector_label("auto-rickshaw") == VehicleClass.OTHER_VEHICLE
    assert VehicleClass.from_detector_label("three_wheeler") == VehicleClass.OTHER_VEHICLE
    assert VehicleClass.from_detector_label("tractor") == VehicleClass.OTHER_VEHICLE
    assert VehicleClass.from_detector_label("unknown_label") == VehicleClass.OTHER_VEHICLE


def test_detected_plate_structure():
    box = BoundingBox(x1=50, y1=80, x2=150, y2=110)
    plate = DetectedPlate(
        plate_id="plt_001",
        bbox=box,
        confidence=0.88,
        vehicle_id="veh_001",
    )
    assert plate.plate_id == "plt_001"
    assert plate.vehicle_id == "veh_001"
    assert plate.confidence == 0.88
    assert plate.bbox.to_list() == [50, 80, 150, 110]
    # Verify plate contract contains NO text and NO image crop
    assert not hasattr(plate, "text")
    assert not hasattr(plate, "plate_number")
    assert not hasattr(plate, "crop")


def test_detection_result_aggregation():
    veh = DetectedObject(
        object_id="veh_1",
        vehicle_class=VehicleClass.CAR,
        confidence=0.92,
        bbox=BoundingBox(100, 100, 400, 300),
    )
    plt = DetectedPlate(
        plate_id="plt_1",
        bbox=BoundingBox(200, 250, 300, 280),
        confidence=0.85,
        vehicle_id="veh_1",
    )
    result = DetectionResult(
        camera_id="CAM-AHM-01",
        captured_at=1000.0,
        frame_sequence=15,
        frame_width=640,
        frame_height=480,
        inference_timestamp=1000.05,
        inference_latency_ms=45.2,
        plate_localizer_mode="HEURISTIC_PLATE_LOCALIZER",
        detected_objects=[veh],
        plates=[plt],
    )

    assert result.vehicle_count == 1
    assert result.plate_count == 1
    assert result.plate_localizer_mode == "HEURISTIC_PLATE_LOCALIZER"
    summary = result.summary()
    assert summary["camera_id"] == "CAM-AHM-01"
    assert summary["frame_sequence"] == 15
    assert summary["latency_ms"] == 45.2
    assert summary["plate_localizer_mode"] == "HEURISTIC_PLATE_LOCALIZER"
    assert len(summary["vehicles"]) == 1
    assert summary["vehicles"][0]["class"] == "CAR"
    assert len(summary["plates"]) == 1
    assert summary["plates"][0]["confidence"] == 0.85
