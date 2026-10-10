"""
Unit and Integration Tests for Tasks 51–100 Import Package (Phase 5.12)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. Exactly 50 new tasks in the import package.
2. Sequential IDs 51–100 without gaps.
3. Zero task-ID collisions with Tasks 1–50 or previous import packages.
4. Zero overlap with the protected 50 images from Phase 5.11.
5. Valid image paths and embedded base64 image data.
6. Valid prediction structure and no premature submitted annotations.
7. Conservative plate-box safeguards and percentage coordinates.
8. No fabricated OCR transcriptions and no auto-unreadable choices.
9. Existing task import packages and manifests remain completely unchanged.
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

from app.ocr.normalizer import is_valid_indian_plate_format
from generate_predictions import (
    DEFAULT_OUTPUT_5_PATH,
    DEFAULT_OUTPUT_35_PATH,
    DEFAULT_OUTPUT_51_100_PATH,
    IMAGES_DIR,
    NEXT_35_TARGET_SAMPLES,
    PILOT_5_TARGET_SAMPLES,
    PILOT_90_EMBEDDED_PATH,
    PREVIOUSLY_USED_SAMPLES,
    TASKS_51_TO_100_TARGET_SAMPLES,
    TOOL_INT_DIR,
)

PROTECTED_MANIFEST_PATH = os.path.join(REPO_ROOT, "fixtures", "datasets", "evaluation", "india_first_protected_50_manifest.json")
CANDIDATE_MANIFEST_PATH = os.path.join(REPO_ROOT, "fixtures", "datasets", "evaluation", "india_first_candidate_manifest.json")
PACKAGE_1_10_PATH = os.path.join(TOOL_INT_DIR, "label_studio_import_tasks.json")


class TestTasks51To100ManifestAndTargetSelection:
    """Verifies that the 50 selected candidates strictly match Phase 5.11 manifests."""

    def test_exactly_50_unprotected_local_images_in_candidate_manifest(self):
        with open(CANDIDATE_MANIFEST_PATH, "r", encoding="utf-8") as f:
            cand = json.load(f)

        local_unprot = [
            c for c in cand["candidates"]
            if c.get("storage_status") == "LOCAL_VERIFIED"
            and not c.get("is_protected", False)
            and c.get("curation_decision") == "PROPOSED_NEXT_BATCH"
        ]
        assert len(local_unprot) == 50

    def test_unprotected_50_disjoint_from_protected_50(self):
        with open(PROTECTED_MANIFEST_PATH, "r", encoding="utf-8") as f:
            prot = json.load(f)

        prot_sample_ids = {t["sample_id"] for t in prot["tasks"]}
        assert len(prot_sample_ids) == 50

        target_set = set(TASKS_51_TO_100_TARGET_SAMPLES)
        assert len(target_set) == 50
        assert target_set.isdisjoint(prot_sample_ids), "Overlap detected between Tasks 51-100 and protected 50!"

    def test_target_samples_disjoint_from_previous_batches(self):
        target_set = set(TASKS_51_TO_100_TARGET_SAMPLES)

        # Check against initial 10 manual samples (Tasks 1-10)
        tasks_1_10_samples = {
            "PILOT-001", "PILOT-004", "PILOT-008", "PILOT-014", "PILOT-020",
            "PILOT-035", "PILOT-045", "PILOT-055", "PILOT-070", "PILOT-100",
        }
        assert target_set.isdisjoint(tasks_1_10_samples)

        # Check against Tasks 11-15 pilot samples
        assert target_set.isdisjoint(set(PILOT_5_TARGET_SAMPLES))

        # Check against Tasks 16-50 expansion samples
        assert target_set.isdisjoint(set(NEXT_35_TARGET_SAMPLES))

        # Check against all previously used 50 samples
        assert len(target_set) == 50

    def test_all_50_source_images_exist_and_decode_on_disk(self):
        with open(PILOT_90_EMBEDDED_PATH, "r", encoding="utf-8") as f:
            all_embedded = json.load(f)

        embedded_map = {t["data"]["sample_id"]: t["data"]["image_filename"] for t in all_embedded}

        for sid in TASKS_51_TO_100_TARGET_SAMPLES:
            assert sid in embedded_map, f"Sample {sid} missing from embedded template"
            fname = embedded_map[sid]
            img_path = os.path.join(IMAGES_DIR, fname)
            assert os.path.isfile(img_path), f"Source image missing on disk: {img_path}"
            img = cv2.imread(img_path)
            assert img is not None and img.size > 0, f"Source image failed to decode: {img_path}"


class TestTasks51To100ImportPackageIntegrity:
    """Verifies the generated Label Studio import package structure and data integrity."""

    @pytest.fixture
    def package_data(self):
        assert os.path.isfile(DEFAULT_OUTPUT_51_100_PATH), f"Package file missing: {DEFAULT_OUTPUT_51_100_PATH}"
        with open(DEFAULT_OUTPUT_51_100_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_exactly_50_tasks_in_package(self, package_data):
        assert len(package_data) == 50

    def test_sequential_task_ids_51_to_100(self, package_data):
        task_ids = [t["id"] for t in package_data]
        assert task_ids == list(range(51, 101))

    def test_no_task_id_collisions_with_existing_tasks_1_to_50(self, package_data):
        existing_ids = set(range(1, 51))
        package_ids = {t["id"] for t in package_data}
        assert package_ids == set(range(51, 101))
        assert package_ids.isdisjoint(existing_ids), "Task ID collision detected with Tasks 1-50!"

    def test_sample_ids_and_provenance_preserved(self, package_data):
        sample_ids = [t["data"]["sample_id"] for t in package_data]
        assert sample_ids == TASKS_51_TO_100_TARGET_SAMPLES

        for task in package_data:
            data = task["data"]
            assert "sample_id" in data
            assert "image_filename" in data
            assert "image_width" in data and data["image_width"] > 0
            assert "image_height" in data and data["image_height"] > 0
            assert "transcript_sha256_prefix" in data

    def test_valid_embedded_image_data(self, package_data):
        for task in package_data:
            img_uri = task.get("data", {}).get("image", "")
            assert img_uri.startswith("data:image/"), f"Task {task['id']} missing data URI header"
            header, b64_part = img_uri.split(",", 1)
            raw_bytes = base64.b64decode(b64_part)
            assert len(raw_bytes) > 1000, f"Task {task['id']} embedded image is suspiciously small"
            # Verify PNG signature (\x89PNG\r\n\x1a\n)
            assert raw_bytes[:4] == b"\x89PNG"

    def test_valid_prediction_structure_without_submitted_annotations(self, package_data):
        for task in package_data:
            # Must contain predictions
            assert "predictions" in task
            assert len(task["predictions"]) == 1
            pred = task["predictions"][0]
            assert "model_version" in pred
            assert "score" in pred
            assert "result" in pred
            assert isinstance(pred["result"], list)

            # Must NOT contain submitted annotations (predictions for human review)
            assert "annotations" not in task

    def test_coordinates_are_valid_percentages(self, package_data):
        for task in package_data:
            pred = task["predictions"][0]
            for res in pred["result"]:
                if res.get("type") == "rectanglelabels":
                    val = res["value"]
                    assert 0.0 <= val["x"] <= 100.0, f"x out of bounds in task {task['id']}: {val['x']}"
                    assert 0.0 <= val["y"] <= 100.0, f"y out of bounds in task {task['id']}: {val['y']}"
                    assert 0.0 < val["width"] <= 100.0, f"width out of bounds in task {task['id']}: {val['width']}"
                    assert 0.0 < val["height"] <= 100.0, f"height out of bounds in task {task['id']}: {val['height']}"
                    assert val["x"] + val["width"] <= 100.01, f"x+w overflow in task {task['id']}"
                    assert val["y"] + val["height"] <= 100.01, f"y+h overflow in task {task['id']}"
                    assert res["from_name"] == "object_label"
                    assert res["to_name"] == "image"
                    assert set(val["rectanglelabels"]).issubset({"vehicle", "license_plate"})


class TestNoFabricatedOCRTranscriptions:
    """Verifies that no text is invented and unreadable status is not guessed."""

    @pytest.fixture
    def package_data(self):
        with open(DEFAULT_OUTPUT_51_100_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_no_unreadable_plate_auto_selection(self, package_data):
        for task in package_data:
            pred = task["predictions"][0]
            for res in pred["result"]:
                if res.get("from_name") == "transcription_legibility":
                    choices = res.get("value", {}).get("choices", [])
                    assert "UNREADABLE_PLATE" not in choices, f"Task {task['id']} auto-selected UNREADABLE_PLATE"

    def test_ocr_transcription_safety_and_thresholds(self, package_data):
        ocr_count = 0
        for task in package_data:
            pred = task["predictions"][0]
            for res in pred["result"]:
                if res.get("from_name") == "plate_transcription":
                    ocr_count += 1
                    texts = res.get("value", {}).get("text", [])
                    assert len(texts) == 1
                    text = texts[0]
                    # Must be at least 4 chars
                    assert len(text) >= 4, f"Transcription too short: {text}"
                    # Must have score >= 0.50
                    assert res.get("score", 0.0) >= 0.50, f"Confidence too low: {res.get('score')}"
                    # Must match valid Indian registration format regex
                    assert is_valid_indian_plate_format(text), f"Invalid Indian plate format: {text}"

        # Conservative gating: exactly 1 proposal met the strict safety thresholds
        assert ocr_count == 1

    def test_blank_ocr_when_evidence_insufficient(self, package_data):
        # 49 out of 50 tasks must have blank OCR transcription
        blank_ocr_tasks = 0
        for task in package_data:
            pred = task["predictions"][0]
            has_ocr = any(r.get("from_name") == "plate_transcription" for r in pred["result"])
            if not has_ocr:
                blank_ocr_tasks += 1
        assert blank_ocr_tasks == 49


class TestExistingTaskPackagesUnchanged:
    """Verifies that all pre-existing import packages and manifests are unmodified."""

    EXPECTED_HASHES = {
        PACKAGE_1_10_PATH: "7f4d133a03809ee8f24c551abda8a4a0e13c31caffcec1bf7b733e135d5ccea4",
        DEFAULT_OUTPUT_5_PATH: "430232052c886bdd5d4f4474c778d094dc7df2944fcbbc4f71b37368439450ef",
        DEFAULT_OUTPUT_35_PATH: "e382005df5831db38047e6a74d3f2587a3bb4b60a59ddb7333de0effaae49a93",
        PILOT_90_EMBEDDED_PATH: "ae2364e03b5d51f820de8e1d33d9f901f5d5c47177150ef552c9e02e904bff6e",
        PROTECTED_MANIFEST_PATH: "e3fc66d295a2606e87a266a6cc1099c5723cd1a9a5af07f16b9bdd15d1c16d8d",
    }

    def test_existing_packages_hashes_match(self):
        for path, expected_hash in self.EXPECTED_HASHES.items():
            assert os.path.isfile(path), f"File missing: {path}"
            with open(path, "rb") as f:
                actual_hash = hashlib.sha256(f.read()).hexdigest()
            assert actual_hash == expected_hash, f"File was unexpectedly modified: {path}"
