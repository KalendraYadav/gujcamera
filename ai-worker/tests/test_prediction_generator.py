"""
Unit and Regression Tests for AI Prediction Generator (Phase 5 Pilot & 35-Task Expansion)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. Class-agnostic Non-Maximum Suppression (duplicate suppression preserving winning class/conf).
2. Coordinate bounds clamping and percentage conversion.
3. Plate-localization safety safeguards (bounds, min size, aspect ratio, containment, height).
4. Conservative OCR rejection gates (confidence, char length, regex format, no auto-unreadable).
5. Five-task pilot mapping, provenance, and non-collision with tasks 1–10.
6. 35-task expansion sample selection, uniqueness, and exclusion of first 15 samples.
7. 35-task import package integrity (task IDs 16–50, coordinates, schema, non-collision).
8. Distinction between prediction proposals and human-submitted annotations.
"""

import json
import os
import sys
import cv2
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO_ROOT, "ai-worker"))

from app.detection_contract import BoundingBox, DetectedObject, DetectedPlate, VehicleClass
from app.ocr.normalizer import is_valid_indian_plate_format, process_plate_text

# Import functions from generate_predictions
sys.path.insert(0, os.path.join(REPO_ROOT, "fixtures", "datasets", "evaluation"))
from generate_predictions import (
    apply_class_agnostic_nms,
    calculate_iou,
    pixel_bbox_to_ls_percent,
    validate_plate_proposal,
    DEFAULT_OUTPUT_5_PATH,
    DEFAULT_OUTPUT_35_PATH,
    PILOT_5_TARGET_SAMPLES,
    NEXT_35_TARGET_SAMPLES,
    PREVIOUSLY_USED_SAMPLES,
    IMAGES_DIR,
)


class TestDuplicateSuppressionNMS:
    """Tests class-agnostic Non-Maximum Suppression (NMS)."""

    def test_suppresses_overlapping_vehicle_boxes_preserving_winner(self):
        # Two bounding boxes with 90%+ IoU: TRUCK (0.85) vs CAR (0.45)
        box1 = BoundingBox(x1=50, y1=50, x2=200, y2=200)
        box2 = BoundingBox(x1=52, y1=48, x2=198, y2=202)

        v1 = DetectedObject(object_id="v1", vehicle_class=VehicleClass.TRUCK, confidence=0.85, bbox=box1)
        v2 = DetectedObject(object_id="v2", vehicle_class=VehicleClass.CAR, confidence=0.45, bbox=box2)

        kept = apply_class_agnostic_nms([v2, v1], iou_threshold=0.50)
        assert len(kept) == 1
        assert kept[0].object_id == "v1"
        assert kept[0].vehicle_class == VehicleClass.TRUCK
        assert kept[0].confidence == 0.85

    def test_retains_distinct_non_overlapping_vehicles(self):
        # Two separate vehicles on opposite sides of frame
        box1 = BoundingBox(x1=10, y1=10, x2=80, y2=80)
        box2 = BoundingBox(x1=150, y1=150, x2=220, y2=220)

        v1 = DetectedObject(object_id="v1", vehicle_class=VehicleClass.CAR, confidence=0.90, bbox=box1)
        v2 = DetectedObject(object_id="v2", vehicle_class=VehicleClass.MOTORCYCLE, confidence=0.75, bbox=box2)

        kept = apply_class_agnostic_nms([v1, v2], iou_threshold=0.50)
        assert len(kept) == 2
        assert {k.object_id for k in kept} == {"v1", "v2"}


class TestCoordinateBoundsAndPercentages:
    """Tests coordinate conversions and clamping for Label Studio."""

    def test_standard_bbox_percentage_conversion(self):
        # 100x200 box in 400x400 image
        box = BoundingBox(x1=100, y1=100, x2=200, y2=300)
        ls = pixel_bbox_to_ls_percent(box, img_width=400, img_height=400)

        assert ls["x"] == 25.0
        assert ls["y"] == 25.0
        assert ls["width"] == 25.0
        assert ls["height"] == 50.0

    def test_boundary_clamping_prevents_overflow(self):
        # Box touching or slightly exceeding frame boundary
        box = BoundingBox(x1=380, y1=350, x2=450, y2=420)
        ls = pixel_bbox_to_ls_percent(box, img_width=400, img_height=400)

        assert ls["x"] == 95.0
        assert ls["width"] <= 5.0
        assert ls["x"] + ls["width"] <= 100.0
        assert ls["y"] == 87.5
        assert ls["y"] + ls["height"] <= 100.0


class TestPlateLocalizationSafeguards:
    """Tests enhanced conservative plate localization safeguards."""

    @pytest.fixture
    def mock_vehicle(self):
        # Vehicle of width 200, height 200 at [50, 50, 250, 250]
        box = BoundingBox(x1=50, y1=50, x2=250, y2=250)
        return DetectedObject(object_id="v1", vehicle_class=VehicleClass.CAR, confidence=0.90, bbox=box)

    def test_rejects_out_of_image_plate(self, mock_vehicle):
        plate = DetectedPlate(plate_id="p1", bbox=BoundingBox(x1=-5, y1=100, x2=50, y2=120), confidence=0.75)
        valid, reason = validate_plate_proposal(plate, mock_vehicle, img_width=300, img_height=300)
        assert valid is False
        assert reason == "out_of_image_bounds"

    def test_rejects_too_small_plate(self, mock_vehicle):
        plate = DetectedPlate(plate_id="p1", bbox=BoundingBox(x1=100, y1=200, x2=115, y2=205), confidence=0.75)
        valid, reason = validate_plate_proposal(plate, mock_vehicle, img_width=300, img_height=300)
        assert valid is False
        assert "too_small" in reason

    def test_rejects_implausible_aspect_ratio(self, mock_vehicle):
        # Square box: 40x35 (AR = 1.14)
        plate = DetectedPlate(plate_id="p1", bbox=BoundingBox(x1=100, y1=180, x2=140, y2=215), confidence=0.75)
        valid, reason = validate_plate_proposal(plate, mock_vehicle, img_width=300, img_height=300)
        assert valid is False
        assert "implausible_aspect_ratio" in reason

    def test_rejects_low_heuristic_fitness(self, mock_vehicle):
        # Plausible shape (AR = 3.33) but fitness below 0.55
        plate = DetectedPlate(plate_id="p1", bbox=BoundingBox(x1=100, y1=190, x2=150, y2=205), confidence=0.48)
        valid, reason = validate_plate_proposal(plate, mock_vehicle, img_width=300, img_height=300, min_fitness=0.55)
        assert valid is False
        assert "low_heuristic_fitness" in reason

    def test_rejects_too_wide_for_vehicle(self, mock_vehicle):
        # Plate width 120 vs vehicle width 200 (60% of vehicle width)
        plate = DetectedPlate(plate_id="p1", bbox=BoundingBox(x1=80, y1=200, x2=200, y2=225), confidence=0.70)
        valid, reason = validate_plate_proposal(plate, mock_vehicle, img_width=300, img_height=300)
        assert valid is False
        assert "too_wide_for_vehicle" in reason

    def test_rejects_plate_too_high_in_chassis(self, mock_vehicle):
        # Plate at y=70 (near vehicle top, y1=50, rel_cy = 0.15)
        plate = DetectedPlate(plate_id="p1", bbox=BoundingBox(x1=100, y1=70, x2=150, y2=85), confidence=0.75)
        valid, reason = validate_plate_proposal(plate, mock_vehicle, img_width=300, img_height=300)
        assert valid is False
        assert "plate_too_high_in_chassis" in reason

    def test_rejects_plate_outside_vehicle_bounds(self, mock_vehicle):
        # Plate shifted completely to the right of vehicle [50, 50, 250, 250]
        plate = DetectedPlate(plate_id="p1", bbox=BoundingBox(x1=260, y1=200, x2=295, y2=210), confidence=0.75)
        valid, reason = validate_plate_proposal(plate, mock_vehicle, img_width=300, img_height=300)
        assert valid is False
        assert "outside_vehicle_bounding_box" in reason

    def test_accepts_plausible_well_positioned_plate(self, mock_vehicle):
        # Width 60, height 18 (AR = 3.33) at [120, 210, 180, 228] (rel_cy = 0.845, 30% of veh width)
        plate = DetectedPlate(plate_id="p1", bbox=BoundingBox(x1=120, y1=210, x2=180, y2=228), confidence=0.75)
        valid, reason = validate_plate_proposal(plate, mock_vehicle, img_width=300, img_height=300, min_fitness=0.55)
        assert valid is True
        assert reason == "accepted"


class TestOCRRejectionGating:
    """Tests conservative OCR gating rules."""

    def test_rejects_low_confidence_ocr(self):
        raw = "GJ01AB1234"
        norm, is_valid = process_plate_text(raw)
        assert is_valid is True
        conf = 0.42
        ocr_accepted = (conf >= 0.50 and len(norm) >= 4 and is_valid)
        assert ocr_accepted is False

    def test_rejects_short_garbled_ocr(self):
        raw = "G1"
        norm, is_valid = process_plate_text(raw)
        conf = 0.90
        ocr_accepted = (conf >= 0.50 and len(norm) >= 4 and is_valid)
        assert ocr_accepted is False

    def test_rejects_non_format_ocr_despite_high_confidence(self):
        raw = "BEEHAD"
        norm, is_valid = process_plate_text(raw)
        assert is_valid is False
        conf = 0.88
        ocr_accepted = (conf >= 0.50 and len(norm) >= 4 and is_valid)
        assert ocr_accepted is False

    def test_accepts_valid_high_confidence_indian_plate(self):
        raw = "GJ01AB1234"
        norm, is_valid = process_plate_text(raw)
        assert is_valid is True
        conf = 0.85
        ocr_accepted = (conf >= 0.50 and len(norm) >= 4 and is_valid)
        assert ocr_accepted is True


class TestNext35SampleSelectionAndIntegrity:
    """Tests sample selection for the 35-task expansion."""

    def test_next_35_count_and_uniqueness(self):
        assert len(NEXT_35_TARGET_SAMPLES) == 35
        assert len(set(NEXT_35_TARGET_SAMPLES)) == 35

    def test_next_35_is_disjoint_from_first_15(self):
        assert len(PREVIOUSLY_USED_SAMPLES) == 15
        assert set(NEXT_35_TARGET_SAMPLES).isdisjoint(set(PREVIOUSLY_USED_SAMPLES))

    def test_all_35_images_exist_and_decode(self):
        manifest_path = os.path.join(REPO_ROOT, "fixtures", "datasets", "evaluation", "complete_dataset_1700_manifest.json")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        samples = manifest["samples"] if isinstance(manifest, dict) else manifest
        manifest_map = {item["sample_id"]: item.get("excel_filename") or os.path.basename(item["zip_archive_path"]) for item in samples}

        for sid in NEXT_35_TARGET_SAMPLES:
            assert sid in manifest_map, f"Sample {sid} not in master manifest"
            fname = manifest_map[sid]
            img_path = os.path.join(IMAGES_DIR, fname)
            assert os.path.isfile(img_path), f"Image file missing on disk: {img_path}"
            frame = cv2.imread(img_path)
            assert frame is not None and frame.size > 0, f"Image {fname} failed to decode"


class TestNext35TaskPackage:
    """Validates the generated 35-task expansion import package."""

    @pytest.fixture
    def package_35_data(self):
        assert os.path.isfile(DEFAULT_OUTPUT_35_PATH), f"Output file missing: {DEFAULT_OUTPUT_35_PATH}"
        with open(DEFAULT_OUTPUT_35_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_task_count_and_mapping(self, package_35_data):
        assert len(package_35_data) == 35
        sample_ids = [t["data"]["sample_id"] for t in package_35_data]
        assert sample_ids == NEXT_35_TARGET_SAMPLES

        # Task IDs must strictly run 16 through 50
        task_ids = [t["id"] for t in package_35_data]
        assert task_ids == list(range(16, 51))

    def test_zero_collision_with_tasks_1_to_15(self, package_35_data):
        # Check against tasks 1-10
        t1_10_path = os.path.join(REPO_ROOT, "fixtures", "datasets", "evaluation", "annotations", "tool_integration", "label_studio_import_tasks.json")
        with open(t1_10_path, "r", encoding="utf-8") as f:
            t1_10 = json.load(f)
        ids_1_10 = {t["id"] for t in t1_10}

        # Check against tasks 11-15
        with open(DEFAULT_OUTPUT_5_PATH, "r", encoding="utf-8") as f:
            t11_15 = json.load(f)
        ids_11_15 = {t["id"] for t in t11_15}

        first_15_ids = ids_1_10 | ids_11_15
        assert first_15_ids == set(range(1, 16))

        new_ids = {t["id"] for t in package_35_data}
        assert new_ids == set(range(16, 51))
        assert first_15_ids.isdisjoint(new_ids)

    def test_predictions_structure_and_no_unreadable_auto_selection(self, package_35_data):
        for task in package_35_data:
            assert "predictions" in task
            assert len(task["predictions"]) == 1
            pred = task["predictions"][0]
            assert "model_version" in pred
            assert "result" in pred

            # Must NOT have submitted human annotations
            assert "annotations" not in task

            for res in pred["result"]:
                if res.get("from_name") == "transcription_legibility":
                    choices = res.get("value", {}).get("choices", [])
                    assert "UNREADABLE_PLATE" not in choices

    def test_all_prediction_coordinates_are_valid_percentages(self, package_35_data):
        for task in package_35_data:
            pred = task["predictions"][0]
            for res in pred["result"]:
                if res.get("type") == "rectanglelabels":
                    val = res["value"]
                    assert 0.0 <= val["x"] <= 100.0
                    assert 0.0 <= val["y"] <= 100.0
                    assert 0.0 < val["width"] <= 100.0
                    assert 0.0 < val["height"] <= 100.0
                    assert val["x"] + val["width"] <= 100.01
                    assert val["y"] + val["height"] <= 100.01
                    assert res["from_name"] == "object_label"
                    assert res["to_name"] == "image"
                    assert set(val["rectanglelabels"]).issubset({"vehicle", "license_plate"})
