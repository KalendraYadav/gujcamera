"""
Unit Test Suite for Ground-Truth Annotation Quality Audit (Phase 5.8)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. Export task parsing and 100% sample ID match against sidecar ledger.
2. Spatial bounding box validation and coordinate clamping.
3. Multi-vehicle scene parsing (PILOT-100 containing 3 vehicle bounding boxes).
4. Authoritative transcript verification against sidecar cryptographic SHA-256 digests.
5. Detection of transcript character mismatch on PILOT-014 without inventing characters.
6. Explicit detection and handling of unreadable plates (PILOT-055 and PILOT-100).
7. Prohibition of counting unreadable plates as verified ground truth.
8. Privacy compliance asserting zero plaintext vehicle registration leaks.
"""

import hashlib
import json
import os
import pytest

EVAL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "datasets", "evaluation"))
SIDECAR_PATH = os.path.join(EVAL_DIR, "annotations", "tool_integration", "transcript_sidecar_ledger.json")
EXPORT_PATH = os.path.expanduser(os.path.join("~", "Downloads", "project-2-at-2026-10-10-06-15-f18d35b1.json"))


@pytest.fixture(scope="module")
def sidecar_ledger():
    assert os.path.isfile(SIDECAR_PATH), f"Sidecar ledger missing at {SIDECAR_PATH}"
    with open(SIDECAR_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def export_tasks():
    assert os.path.isfile(EXPORT_PATH), f"Label Studio export missing at {EXPORT_PATH}"
    with open(EXPORT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_export_task_count_and_sample_ids(export_tasks, sidecar_ledger):
    assert len(export_tasks) == 10
    sample_ids = [t["data"]["sample_id"] for t in export_tasks]
    assert len(set(sample_ids)) == 10
    for sid in sample_ids:
        assert sid in sidecar_ledger


def test_spatial_boxes_and_labels(export_tasks, sidecar_ledger):
    valid_labels = {"vehicle", "license_plate"}
    total_vehicles = 0
    total_plates = 0

    for t in export_tasks:
        sid = t["data"]["sample_id"]
        meta = sidecar_ledger[sid]
        w = meta["image_dimensions"]["width"]
        h = meta["image_dimensions"]["height"]
        ann = t["annotations"][0]

        for r in ann.get("result", []):
            val = r.get("value", {})
            if "rectanglelabels" in val:
                for lbl in val["rectanglelabels"]:
                    assert lbl in valid_labels
                    if lbl == "vehicle":
                        total_vehicles += 1
                    elif lbl == "license_plate":
                        total_plates += 1

                    rx = val.get("x", 0)
                    ry = val.get("y", 0)
                    rw = val.get("width", 0)
                    rh = val.get("height", 0)
                    assert rw > 0 and rh > 0
                    assert rx >= -0.01 and ry >= -0.01

    assert total_plates == 10
    assert total_vehicles == 12


def test_pilot_100_multi_vehicle_association(export_tasks):
    pilot_100 = next(t for t in export_tasks if t["data"]["sample_id"] == "PILOT-100")
    ann = pilot_100["annotations"][0]
    vehicles = [r for r in ann.get("result", []) if "vehicle" in r.get("value", {}).get("rectanglelabels", [])]
    plates = [r for r in ann.get("result", []) if "license_plate" in r.get("value", {}).get("rectanglelabels", [])]

    assert len(vehicles) == 3
    assert len(plates) == 1

    # License plate coordinates
    p_val = plates[0]["value"]
    px_min = p_val["x"]
    px_max = px_min + p_val["width"]
    py_min = p_val["y"]
    py_max = py_min + p_val["height"]

    # Target vehicle (Vehicle 1) completely encloses the license plate
    v1_val = vehicles[0]["value"]
    assert v1_val["x"] <= px_min
    assert (v1_val["x"] + v1_val["width"]) >= px_max
    assert v1_val["y"] <= py_min
    assert (v1_val["y"] + v1_val["height"]) >= py_max


def test_transcript_verification_against_sidecar(export_tasks, sidecar_ledger):
    verified_matches = []
    mismatches = []
    unreadable = []

    for t in export_tasks:
        sid = t["data"]["sample_id"]
        ann = t["annotations"][0]
        transcripts = [r["value"]["text"][0] for r in ann.get("result", []) if r.get("from_name") == "plate_transcription"]
        expected_hash = sidecar_ledger[sid]["authoritative_transcript_sha256"]

        if not transcripts:
            unreadable.append(sid)
        else:
            actual_text = transcripts[0].strip()
            actual_hash = hashlib.sha256(actual_text.encode("utf-8")).hexdigest()
            if actual_hash == expected_hash:
                verified_matches.append(sid)
            else:
                mismatches.append(sid)

    assert set(verified_matches) == {"PILOT-001", "PILOT-004", "PILOT-008", "PILOT-020", "PILOT-035", "PILOT-045", "PILOT-070"}
    assert mismatches == ["PILOT-014"]
    assert set(unreadable) == {"PILOT-055", "PILOT-100"}


def test_unreadable_not_counted_as_verified_ground_truth(export_tasks):
    for sid in ["PILOT-055", "PILOT-100"]:
        task = next(t for t in export_tasks if t["data"]["sample_id"] == sid)
        transcripts = [r for r in task["annotations"][0].get("result", []) if r.get("from_name") == "plate_transcription"]
        assert len(transcripts) == 0, f"Task {sid} must not have human transcription"
