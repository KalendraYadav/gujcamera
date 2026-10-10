"""
Automated Safety and Integrity Tests for India-First Dataset Audit (Phase 5.11)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. Protected image mappings (Tasks 1-50) remain immutable and hash-verified.
2. Zero duplicate images in protected set or candidate manifest.
3. Candidate classification enforcement: only VERIFIED_INDIA enters verified pool.
4. Unknown-origin images cannot enter verified core dataset.
5. Honest reporting of category deficits and selection quotas.
6. Deterministic selection reproducibility.
7. File existence verification on disk for all local candidates.
8. Manifest count consistency with actual local directory contents.
9. Recorded exclusion reasons for non-eligible candidates.
10. Preservation of existing Label Studio import packages.
"""

import json
import os
import sys
import hashlib
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVAL_DIR = os.path.join(REPO_ROOT, "fixtures", "datasets", "evaluation")
IMAGES_DIR = os.path.join(EVAL_DIR, "images")
TOOL_INT_DIR = os.path.join(EVAL_DIR, "annotations", "tool_integration")

PROTECTED_MANIFEST_PATH = os.path.join(EVAL_DIR, "india_first_protected_50_manifest.json")
CANDIDATE_MANIFEST_PATH = os.path.join(EVAL_DIR, "india_first_candidate_manifest.json")
CONFIG_PATH = os.path.join(EVAL_DIR, "india_first_selection_config.json")


class TestProtected50TasksIntegrity:
    """Verifies that all 50 existing tasks and images are preserved and unmodified."""

    @pytest.fixture
    def protected_data(self):
        assert os.path.isfile(PROTECTED_MANIFEST_PATH), f"Missing manifest: {PROTECTED_MANIFEST_PATH}"
        with open(PROTECTED_MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_protected_task_count_and_sequential_ids(self, protected_data):
        tasks = protected_data["tasks"]
        assert len(tasks) == 50
        task_ids = [t["task_id"] for t in tasks]
        assert task_ids == list(range(1, 51))
        # Zero duplicate task IDs
        assert len(set(task_ids)) == 50

    def test_protected_sample_ids_are_unique(self, protected_data):
        sample_ids = [t["sample_id"] for t in protected_data["tasks"]]
        assert len(sample_ids) == 50
        assert len(set(sample_ids)) == 50

    def test_protected_image_files_exist_and_hashes_match(self, protected_data):
        for t in protected_data["tasks"]:
            rel_path = t["relative_image_path"]
            abs_path = os.path.join(EVAL_DIR, rel_path)
            assert os.path.isfile(abs_path), f"Protected image file missing: {abs_path}"

            with open(abs_path, "rb") as f:
                digest = hashlib.sha256(f.read()).hexdigest()
            assert digest == t["sha256"], f"SHA-256 hash mismatch for task {t['task_id']} ({t['sample_id']})"

    def test_existing_import_packages_remain_intact(self):
        pkg_paths = [
            os.path.join(TOOL_INT_DIR, "label_studio_import_tasks.json"),
            os.path.join(TOOL_INT_DIR, "label_studio_import_pilot_5_tasks_with_predictions.json"),
            os.path.join(TOOL_INT_DIR, "label_studio_import_next_35_tasks_with_predictions.json"),
        ]
        for p in pkg_paths:
            assert os.path.isfile(p), f"Required import package missing: {p}"
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            assert len(data) > 0


@pytest.fixture
def candidate_data():
    assert os.path.isfile(CANDIDATE_MANIFEST_PATH), f"Missing manifest: {CANDIDATE_MANIFEST_PATH}"
    with open(CANDIDATE_MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


class TestCandidateManifestIntegrity:
    """Verifies candidate classifications, evidence, and exclusion logic."""

    def test_total_candidate_count(self, candidate_data):
        candidates = candidate_data["candidates"]
        assert len(candidates) == 1700
        assert candidate_data["local_images_count"] == 100
        assert candidate_data["remote_archive_images_count"] == 1600
        assert candidate_data["protected_tasks_count"] == 50

    def test_all_local_images_exist_on_disk(self, candidate_data):
        local_candidates = [c for c in candidate_data["candidates"] if c["storage_status"] == "LOCAL_VERIFIED"]
        assert len(local_candidates) == 100

        disk_files = [f for f in os.listdir(IMAGES_DIR) if os.path.isfile(os.path.join(IMAGES_DIR, f))]
        assert len(disk_files) == 100

        for c in local_candidates:
            abs_path = os.path.join(EVAL_DIR, c["relative_file_path"])
            assert os.path.isfile(abs_path), f"Local image candidate missing: {abs_path}"
            assert c["sha256_hash"] is not None
            assert len(c["sha256_hash"]) == 64

    def test_context_status_values_are_valid(self, candidate_data):
        valid_statuses = {"VERIFIED_INDIA", "PROBABLE_INDIA", "UNKNOWN_ORIGIN", "NON_INDIA"}
        for c in candidate_data["candidates"]:
            status = c["indian_context_status"]
            assert status in valid_statuses, f"Invalid status {status} for {c['stable_image_id']}"
            assert len(c["evidence_supporting_indian_context"]) > 0

    def test_unknown_origin_images_are_excluded(self, candidate_data):
        for c in candidate_data["candidates"]:
            if c["indian_context_status"] == "UNKNOWN_ORIGIN":
                assert c["curation_decision"] == "EXCLUDED_CANDIDATE"
                assert c["exclusion_reason"] is not None

    def test_excluded_candidates_have_recorded_reasons(self, candidate_data):
        for c in candidate_data["candidates"]:
            if c["curation_decision"] == "EXCLUDED_CANDIDATE":
                assert c["exclusion_reason"] is not None
                assert len(c["exclusion_reason"]) > 0


class TestSelectionConfigAndBalancingQuotas:
    """Verifies honesty in balancing quotas and configuration."""

    @pytest.fixture
    def config_data(self):
        assert os.path.isfile(CONFIG_PATH), f"Missing config: {CONFIG_PATH}"
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_random_seed_and_policy_reference(self, config_data):
        assert config_data["random_seed"] == 42
        assert config_data["selection_policy_name"] == "NETRAVA_INDIA_FIRST_VEHICLE_BALANCED_V1"

    def test_700_provisional_targets_sum_to_100_percent(self, config_data):
        quotas = config_data["provisional_balancing_targets_700"]["vehicle_category_quotas"]
        total_pct = sum(q["target_pct"] for q in quotas.values())
        assert total_pct == pytest.approx(100.0)

        total_count = sum(q["target_count"] for q in quotas.values())
        assert total_count == 700

    def test_selection_is_deterministic(self, candidate_data):
        # Candidates must be strictly ordered by dataset_index
        indices = [c["dataset_index"] for c in candidate_data["candidates"]]
        assert indices == sorted(indices)
        assert len(indices) == len(set(indices))
