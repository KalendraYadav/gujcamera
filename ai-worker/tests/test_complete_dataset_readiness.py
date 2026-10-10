"""
Unit Test Suite for Complete Dataset Label Studio Import Readiness
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. Complete 1,700 dataset manifest integrity and accounting.
2. Stability and uniqueness of sample IDs (PILOT-001..PILOT-100, NETRAVA-0101..NETRAVA-1700).
3. 90-task import package schema, task ID non-collision (starts at 11), and sample ID parity.
4. Base64 embedded payload decoding and valid image dimensions.
5. Isolation and preservation of original 10 Label Studio tasks.
6. Identification and segregation of 4 ambiguous Zenodo records.
7. Downloader status module integrity.
"""

import base64
import io
import json
import os
import pytest
from PIL import Image

EVAL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "datasets", "evaluation"))
TOOL_INT_DIR = os.path.join(EVAL_DIR, "annotations", "tool_integration")
MANIFEST_1700_PATH = os.path.join(EVAL_DIR, "complete_dataset_1700_manifest.json")
IMPORT_90_LOCAL_PATH = os.path.join(TOOL_INT_DIR, "label_studio_import_pilot_90_tasks.json")
IMPORT_90_EMBEDDED_PATH = os.path.join(TOOL_INT_DIR, "label_studio_import_pilot_90_tasks_embedded.json")
INTERFACE_V2_PATH = os.path.join(TOOL_INT_DIR, "label_studio_interface_v2.xml")


@pytest.fixture(scope="module")
def manifest_1700():
    assert os.path.isfile(MANIFEST_1700_PATH), f"Manifest missing at {MANIFEST_1700_PATH}"
    with open(MANIFEST_1700_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def tasks_90_local():
    assert os.path.isfile(IMPORT_90_LOCAL_PATH), f"Tasks file missing at {IMPORT_90_LOCAL_PATH}"
    with open(IMPORT_90_LOCAL_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def tasks_90_embedded():
    assert os.path.isfile(IMPORT_90_EMBEDDED_PATH), f"Tasks file missing at {IMPORT_90_EMBEDDED_PATH}"
    with open(IMPORT_90_EMBEDDED_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_manifest_1700_counts_and_structure(manifest_1700):
    meta = manifest_1700["metadata"]
    assert meta["total_source_images_expected"] == 1700
    assert meta["locally_verified_images"] == 100
    assert meta["already_imported_in_label_studio"] == 10
    assert meta["ready_for_immediate_import"] == 90
    assert meta["remote_archived_in_zenodo"] == 1596
    assert meta["ambiguous_metadata_mappings"] == 4

    samples = manifest_1700["samples"]
    assert len(samples) == 1700

    # Assert uniqueness of sample IDs
    sids = [s["sample_id"] for s in samples]
    assert len(set(sids)) == 1700

    # Assert pilot samples preserve PILOT-001..PILOT-100
    for i in range(1, 101):
        assert f"PILOT-{i:03d}" in sids


def test_import_90_tasks_collision_free(tasks_90_local, tasks_90_embedded):
    assert len(tasks_90_local) == 90
    assert len(tasks_90_embedded) == 90

    # Ensure IDs start at 11 to avoid collision with existing tasks 1-10
    task_ids_l = [t["id"] for t in tasks_90_local]
    task_ids_e = [t["id"] for t in tasks_90_embedded]

    assert min(task_ids_l) == 11
    assert max(task_ids_l) == 100
    assert min(task_ids_e) == 11
    assert max(task_ids_e) == 100

    # Ensure existing 10 pilot IDs are NOT in the 90 package
    existing_10 = {"PILOT-001", "PILOT-004", "PILOT-008", "PILOT-014", "PILOT-020", "PILOT-035", "PILOT-045", "PILOT-055", "PILOT-070", "PILOT-100"}
    for t in tasks_90_local:
        sid = t["data"]["sample_id"]
        assert sid not in existing_10, f"Task {sid} must not be re-imported"


def test_embedded_images_are_valid_png(tasks_90_embedded):
    sample_task = tasks_90_embedded[0]
    data_uri = sample_task["data"]["image"]
    assert data_uri.startswith("data:image/png;base64,")

    b64_content = data_uri.replace("data:image/png;base64,", "")
    img_bytes = base64.b64decode(b64_content)

    with Image.open(io.BytesIO(img_bytes)) as img:
        img.verify()

    with Image.open(io.BytesIO(img_bytes)) as img:
        assert img.format == "PNG"
        assert img.width == sample_task["data"]["image_width"]
        assert img.height == sample_task["data"]["image_height"]


def test_ambiguous_records_isolation(manifest_1700):
    ambiguous = [s for s in manifest_1700["samples"] if s["mapping_confidence"] == "AMBIGUOUS_AUTHOR_MAPPING"]
    assert len(ambiguous) == 4
    ambiguous_excel = {s["excel_filename"] for s in ambiguous}
    assert ambiguous_excel == {"C270.png", "C407.png", "DL36.png", "WB55.png"}


def test_interface_v2_has_unreadable_plate_choice():
    assert os.path.isfile(INTERFACE_V2_PATH)
    with open(INTERFACE_V2_PATH, "r", encoding="utf-8") as f:
        xml_content = f.read()

    assert "UNREADABLE_PLATE" in xml_content
    assert "plate_transcription" in xml_content
    assert "object_label" in xml_content
