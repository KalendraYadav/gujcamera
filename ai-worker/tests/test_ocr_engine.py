"""
Unit & Integration Tests for OCR Engines and Pipeline Integration (Phase 3D)
"""

import time
from unittest.mock import MagicMock
import numpy as np
import pytest

from app.detection_contract import (
    BoundingBox,
    DetectedObject,
    DetectedPlate,
    VehicleClass,
)
from app.detector import InferencePipeline
from app.detector.base import BasePlateDetector, BaseVehicleDetector
from app.frame_contract import FramePayload
from app.ocr import MockOCREngine, OCRErrorCode, TesseractOCREngine


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


def test_mock_ocr_engine_execution():
    engine = MockOCREngine(default_text="GJ 01 AB 1234", default_confidence=0.91)
    assert engine.is_ready() is True
    assert engine.engine_name == "MOCK_OCR"

    dummy = np.zeros((30, 100, 3), dtype=np.uint8)
    text, conf, variant = engine.recognize(dummy)
    assert text == "GJ 01 AB 1234"
    assert conf == 0.91


def test_pipeline_ocr_integration_success():
    sim_veh = DetectedObject(
        object_id="veh_01",
        vehicle_class=VehicleClass.CAR,
        confidence=0.92,
        bbox=BoundingBox(50, 50, 300, 250),
    )
    sim_plate = DetectedPlate(
        plate_id="plt_01",
        bbox=BoundingBox(100, 150, 250, 190),  # w=150, h=40
        confidence=0.88,
        vehicle_id="veh_01",
    )

    mock_ocr = MockOCREngine(default_text="gj-01 ab 1234", default_confidence=0.85)

    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([sim_veh]),
        plate_detector=DummyPlateDetector([sim_plate]),
        ocr_engine=mock_ocr,
        ocr_min_confidence=0.30,
        ocr_accept_confidence=0.60,
    )

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=1,
        captured_at=time.time(),
        sampled_at=time.time(),
        width=640,
        height=480,
        frame=frame,
    )

    result = pipeline.process_frame(payload)

    assert result.vehicle_count == 1
    assert result.plate_count == 1
    assert result.ocr_count == 1

    ocr_res = result.ocr_results[0]
    assert ocr_res.plate_id == "plt_01"
    assert ocr_res.raw_text == "gj-01 ab 1234"
    assert ocr_res.normalized_text == "GJ01AB1234"
    assert ocr_res.format_valid is True
    assert ocr_res.confidence == 0.85
    assert ocr_res.success is True
    assert ocr_res.error_code is None

    # Verify domain contract: NO image crop on plate or result
    assert not hasattr(result.plates[0], "crop")
    assert not hasattr(result, "crop")

    metrics = pipeline.get_metrics()
    assert metrics["total_ocr_processed"] == 1
    assert metrics["total_ocr_success"] == 1
    assert metrics["ocr_engine"] == "MOCK_OCR"


def test_pipeline_ocr_low_confidence_gate():
    sim_veh = DetectedObject("veh_01", VehicleClass.CAR, 0.90, BoundingBox(50, 50, 300, 250))
    sim_plate = DetectedPlate("plt_01", BoundingBox(100, 150, 250, 190), 0.80, "veh_01")

    # Mock OCR returning low confidence
    mock_ocr = MockOCREngine(default_text="XYZ 99", default_confidence=0.20)

    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([sim_veh]),
        plate_detector=DummyPlateDetector([sim_plate]),
        ocr_engine=mock_ocr,
        ocr_min_confidence=0.30,
    )

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    payload = FramePayload("CAM-AHM-01", 1, time.time(), time.time(), 640, 480, frame)

    result = pipeline.process_frame(payload)
    assert result.ocr_count == 1
    ocr_res = result.ocr_results[0]
    assert ocr_res.success is False
    assert ocr_res.error_code == OCRErrorCode.LOW_CONFIDENCE.value


def test_pipeline_ocr_exception_isolation():
    sim_veh = DetectedObject("veh_01", VehicleClass.CAR, 0.90, BoundingBox(50, 50, 300, 250))
    sim_plate = DetectedPlate("plt_01", BoundingBox(100, 150, 250, 190), 0.80, "veh_01")

    faulty_ocr = MagicMock()
    faulty_ocr.is_ready.return_value = True
    faulty_ocr.engine_name = "FAULTY_OCR"
    faulty_ocr.recognize.side_effect = RuntimeError("OCR core segmentation fault")

    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([sim_veh]),
        plate_detector=DummyPlateDetector([sim_plate]),
        ocr_engine=faulty_ocr,
    )

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    payload = FramePayload("CAM-AHM-01", 1, time.time(), time.time(), 640, 480, frame)

    # Must not raise exception
    result = pipeline.process_frame(payload)
    assert result.ocr_count == 1
    ocr_res = result.ocr_results[0]
    assert ocr_res.success is False
    assert ocr_res.error_code == OCRErrorCode.OCR_EXCEPTION.value


def test_tesseract_engine_unavailable_fallback():
    # Pass non-existent binary path
    engine = TesseractOCREngine(tesseract_cmd="/nonexistent/path/to/tesseract")
    assert engine.is_ready() is False

    dummy_crop = np.zeros((40, 120, 3), dtype=np.uint8)
    text, conf, variant = engine.recognize(dummy_crop)
    assert text == ""
    assert conf is None
    assert variant == "engine_unavailable"


def test_pipeline_ocr_empty_crop_handling():
    sim_veh = DetectedObject("veh_01", VehicleClass.CAR, 0.90, BoundingBox(50, 50, 300, 250))
    # Plate bbox is outside frame dimensions (frame is 100x100, plate is at 500,500)
    sim_plate = DetectedPlate("plt_01", BoundingBox(500, 500, 550, 520), 0.80, "veh_01")

    mock_ocr = MockOCREngine()
    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([sim_veh]),
        plate_detector=DummyPlateDetector([sim_plate]),
        ocr_engine=mock_ocr,
    )

    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    payload = FramePayload("CAM-AHM-01", 1, time.time(), time.time(), 100, 100, frame)

    result = pipeline.process_frame(payload)
    assert result.ocr_count == 1
    ocr_res = result.ocr_results[0]
    assert ocr_res.success is False
    assert ocr_res.error_code == OCRErrorCode.EMPTY_CROP.value


def test_pipeline_ocr_no_text_detected():
    sim_veh = DetectedObject("veh_01", VehicleClass.CAR, 0.90, BoundingBox(50, 50, 300, 250))
    sim_plate = DetectedPlate("plt_01", BoundingBox(60, 60, 180, 100), 0.80, "veh_01")

    # Engine returns empty string
    mock_ocr = MockOCREngine(default_text="   ", default_confidence=0.0)
    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([sim_veh]),
        plate_detector=DummyPlateDetector([sim_plate]),
        ocr_engine=mock_ocr,
    )

    frame = np.zeros((200, 400, 3), dtype=np.uint8)
    payload = FramePayload("CAM-AHM-01", 1, time.time(), time.time(), 400, 200, frame)

    result = pipeline.process_frame(payload)
    assert result.ocr_count == 1
    ocr_res = result.ocr_results[0]
    assert ocr_res.success is False
    assert ocr_res.error_code == OCRErrorCode.NO_TEXT_DETECTED.value
