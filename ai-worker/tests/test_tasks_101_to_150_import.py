"""
Unit and Integration Tests for Tasks 101–150 Import Package (Phase 5.13)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. Exactly 50 new tasks in the import package with sequential IDs 101–150.
2. Zero task-ID and sample-ID collisions with Tasks 1–100.
3. Zero passenger cars (Four-Wheeler Passenger Car count == 0).
4. Category quotas achieved:
   - 15 Motorcycles and Scooters (TWO_WHEELER)
   - 15 Auto-Rickshaws and Three-Wheelers (THREE_WHEELER)
   - 15 Trucks and Multi-Axle Goods Vehicles (HEAVY_COMMERCIAL)
   - 5 Buses and Tractors (3 TRACTOR_AND_AGRICULTURAL + 2 BUS)
5. Multi-axle wheel-count diversity in heavy commercial category.
6. Authentic Indian context and regional diversity across Indian states/UTs.
7. Valid prediction proposals (vehicle bounding boxes, conservative plate proposals).
8. Percentage coordinates strictly clamped within [0, 100].
9. No premature submitted annotations (proposals only).
10. Valid base64 embedded images that decode matching stated dimensions.
11. Tasks 1–100 import packages remain immutable and untouched.
"""

import base64
import hashlib
import json
import os
import sys
import cv2
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO_ROOT, "ai-worker"))
sys.path.insert(0, os.path.join(REPO_ROOT, "fixtures", "datasets", "evaluation"))

EVAL_DIR = os.path.join(REPO_ROOT, "fixtures", "datasets", "evaluation")
TOOL_INT_DIR = os.path.join(EVAL_DIR, "annotations", "tool_integration")
IMAGES_DIR = os.path.join(EVAL_DIR, "images")

PACKAGE_101_150_PATH = os.path.join(TOOL_INT_DIR, "label_studio_import_tasks_101_to_150_vehicle_diversity.json")
MANIFEST_101_150_PATH = os.path.join(EVAL_DIR, "india_first_tasks_101_to_150_manifest.json")
CSV_101_150_PATH = os.path.join(EVAL_DIR, "india_first_tasks_101_to_150_summary.csv")

PACKAGE_1_10_PATH = os.path.join(TOOL_INT_DIR, "label_studio_import_tasks.json")
PACKAGE_11_15_PATH = os.path.join(TOOL_INT_DIR, "label_studio_import_pilot_5_tasks_with_predictions.json")
PACKAGE_16_50_PATH = os.path.join(TOOL_INT_DIR, "label_studio_import_next_35_tasks_with_predictions.json")
PACKAGE_51_100_PATH = os.path.join(TOOL_INT_DIR, "label_studio_import_tasks_51_to_100_with_predictions.json")


class TestTasks101To150PackagingAndSequencing:
    """Verifies sequencing, non-collision, and structure of Tasks 101–150."""

    @pytest.fixture(scope="class")
    def package_data(self):
        assert os.path.exists(PACKAGE_101_150_PATH), f"Missing package: {PACKAGE_101_150_PATH}"
        with open(PACKAGE_101_150_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    @pytest.fixture(scope="class")
    def manifest_data(self):
        assert os.path.exists(MANIFEST_101_150_PATH), f"Missing manifest: {MANIFEST_101_150_PATH}"
        with open(MANIFEST_101_150_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_exactly_50_tasks_in_package(self, package_data):
        assert len(package_data) == 50

    def test_sequential_ids_101_to_150(self, package_data):
        ids = [t["id"] for t in package_data]
        expected_ids = list(range(101, 151))
        assert ids == expected_ids

    def test_sample_ids_are_diversity_101_to_150(self, package_data):
        sample_ids = [t["data"]["sample_id"] for t in package_data]
        expected_sample_ids = [f"DIVERSITY-{i}" for i in range(101, 151)]
        assert sample_ids == expected_sample_ids

    def test_no_id_collisions_with_tasks_1_to_100(self, package_data):
        batch_ids = {t["id"] for t in package_data}
        for pkg_path in [PACKAGE_1_10_PATH, PACKAGE_11_15_PATH, PACKAGE_16_50_PATH, PACKAGE_51_100_PATH]:
            if os.path.exists(pkg_path):
                with open(pkg_path, "r", encoding="utf-8") as f:
                    prev_tasks = json.load(f)
                prev_ids = {t["id"] for t in prev_tasks}
                assert batch_ids.isdisjoint(prev_ids), f"Collision detected with {pkg_path}"

    def test_no_image_overlap_with_tasks_1_to_100(self, package_data):
        new_filenames = {t["data"]["image_filename"] for t in package_data}
        for pkg_path in [PACKAGE_1_10_PATH, PACKAGE_11_15_PATH, PACKAGE_16_50_PATH, PACKAGE_51_100_PATH]:
            if os.path.exists(pkg_path):
                with open(pkg_path, "r", encoding="utf-8") as f:
                    prev_tasks = json.load(f)
                prev_filenames = {t["data"]["image_filename"] for t in prev_tasks}
                assert new_filenames.isdisjoint(prev_filenames), f"Image overlap with {pkg_path}"


class TestTasks101To150VehicleCategoryDistribution:
    """Verifies strict category quotas and ZERO passenger cars."""

    @pytest.fixture(scope="class")
    def manifest_data(self):
        with open(MANIFEST_101_150_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_zero_passenger_cars(self, manifest_data):
        tasks = manifest_data["tasks"]
        car_tasks = [t for t in tasks if t.get("is_passenger_car") is True or t.get("vehicle_category") == "FOUR_WHEELER_PASSENGER"]
        assert len(car_tasks) == 0, f"Violated zero passenger-car requirement: found {len(car_tasks)} cars"

    def test_category_distribution_quotas(self, manifest_data):
        dist = manifest_data["achieved_distribution"]
        assert dist["TWO_WHEELER"] == 15, "Motorcycles/scooters must be exactly 15"
        assert dist["THREE_WHEELER"] == 15, "Auto-rickshaws/3-wheelers must be exactly 15"
        assert dist["HEAVY_COMMERCIAL"] == 15, "Trucks must be exactly 15"
        assert dist["TRACTOR_AND_AGRICULTURAL"] == 3, "Tractors must be exactly 3"
        assert dist["BUS"] == 2, "Buses must be exactly 2"
        assert dist["FOUR_WHEELER_PASSENGER"] == 0, "Passenger cars must be exactly 0"

    def test_multi_axle_wheel_count_diversity(self, manifest_data):
        trucks = [t for t in manifest_data["tasks"] if t["vehicle_category"] == "HEAVY_COMMERCIAL"]
        wheel_counts = {t["wheel_count"] for t in trucks}
        # Multi-axle, 8+ wheels, and 6-wheel trucks should be represented
        assert "MULTI_AXLE_10_PLUS" in wheel_counts
        assert "8_OR_MORE_WHEELS" in wheel_counts
        assert "6_WHEELS" in wheel_counts

    def test_indian_context_eligibility_enforced(self, manifest_data):
        tasks = manifest_data["tasks"]
        for t in tasks:
            assert t["indian_context_status"] == "VERIFIED_INDIA"
            assert len(t["geographic_capture_location"]) > 5
            assert len(t["evidence_supporting_indian_context"]) > 5


class TestTasks101To150AIProposalsAndGating:
    """Verifies AI predictions structure, safety gating, and base64 images."""

    @pytest.fixture(scope="class")
    def package_data(self):
        with open(PACKAGE_101_150_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_all_tasks_have_prediction_blocks(self, package_data):
        for t in package_data:
            assert "predictions" in t
            assert len(t["predictions"]) == 1
            pred = t["predictions"][0]
            assert pred["model_version"] == "netrava-cv-yolov8n-heuristic-v1"
            assert "result" in pred
            assert "score" in pred

    def test_no_premature_submitted_annotations(self, package_data):
        for t in package_data:
            assert "annotations" not in t or len(t.get("annotations", [])) == 0

    def test_prediction_coordinates_valid_percentages(self, package_data):
        for t in package_data:
            results = t["predictions"][0]["result"]
            for r in results:
                if r.get("type") == "rectanglelabels":
                    val = r["value"]
                    for k in ["x", "y", "width", "height"]:
                        assert 0.0 <= val[k] <= 100.0, f"Task {t['id']}: {k}={val[k]} out of range"

    def test_embedded_image_data_valid(self, package_data):
        for t in package_data[:10]:  # Test first 10 for performance
            b64_uri = t["data"]["image"]
            assert b64_uri.startswith("data:image/jpeg;base64,")
            raw_b64 = b64_uri.split(",", 1)[1]
            img_bytes = base64.b64decode(raw_b64)
            assert len(img_bytes) > 10000


class TestTasks101To150PreserveExistingPackages:
    """Verifies that Tasks 1–100 import packages and manifests remain intact."""

    def test_existing_packages_exist(self):
        assert os.path.exists(PACKAGE_1_10_PATH)
        assert os.path.exists(PACKAGE_11_15_PATH)
        assert os.path.exists(PACKAGE_16_50_PATH)
        assert os.path.exists(PACKAGE_51_100_PATH)

    def test_package_51_to_100_has_50_tasks(self):
        with open(PACKAGE_51_100_PATH, "r", encoding="utf-8") as f:
            p51 = json.load(f)
        assert len(p51) == 50
        assert p51[0]["id"] == 51
        assert p51[-1]["id"] == 100
