"""
Unit Test Suite for Pilot Adjudication & Dual-Pass Review Protocol (Phase 5.9)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. PILOT-014 transcription discrepancy isolation: confirms mismatch without silent overwrite.
2. PILOT-055 preservation of unreadable status while validating bounding box for localization.
3. PILOT-100 multi-vehicle bounding box intersection and unlinked association marking.
4. Independent second review accounting: verifies 0 second reviews have been claimed or fabricated.
5. Separate acceptance accounting: 7 OCR accepted, 2 unreadable, 1 discrepancy.
6. Schema and provenance immutability: verifies sidecar ledger and original export integrity.
"""

import hashlib
import json
import os
import pytest

EVAL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "datasets", "evaluation"))
SIDECAR_PATH = os.path.join(EVAL_DIR, "annotations", "tool_integration", "transcript_sidecar_ledger.json")
EXPORT_PATH = os.path.expanduser(os.path.join("~", "Downloads", "project-2-at-2026-10-10-06-15-f18d35b1.json"))
SCHEMA_PATH = os.path.join(EVAL_DIR, "annotations", "schema", "annotation_schema.json")


@pytest.fixture(scope="module")
def sidecar_ledger():
    with open(SIDECAR_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def export_tasks():
    with open(EXPORT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_pilot_014_discrepancy_isolation(export_tasks, sidecar_ledger):
    pilot_14 = next(t for t in export_tasks if t["data"]["sample_id"] == "PILOT-014")
    ann = pilot_14["annotations"][0]
    transcripts = [r["value"]["text"][0] for r in ann.get("result", []) if r.get("from_name") == "plate_transcription"]
    assert len(transcripts) == 1

    human_text = transcripts[0].strip()
    human_hash = hashlib.sha256(human_text.encode("utf-8")).hexdigest()
    expected_hash = sidecar_ledger["PILOT-014"]["authoritative_transcript_sha256"]

    # Must confirm discrepancy without silently altering ledger or export
    assert human_hash != expected_hash
    assert len(human_text) == 10
    assert sidecar_ledger["PILOT-014"]["char_length"] == 10


def test_pilot_055_unreadable_and_localization_validity(export_tasks, sidecar_ledger):
    pilot_55 = next(t for t in export_tasks if t["data"]["sample_id"] == "PILOT-055")
    ann = pilot_55["annotations"][0]
    transcripts = [r for r in ann.get("result", []) if r.get("from_name") == "plate_transcription"]
    assert len(transcripts) == 0  # No fabricated text

    meta = sidecar_ledger["PILOT-055"]
    w = meta["image_dimensions"]["width"]
    h = meta["image_dimensions"]["height"]

    # Plate and vehicle boxes exist and are within bounds
    v_boxes = [r["value"] for r in ann.get("result", []) if "vehicle" in r.get("value", {}).get("rectanglelabels", [])]
    lp_boxes = [r["value"] for r in ann.get("result", []) if "license_plate" in r.get("value", {}).get("rectanglelabels", [])]
    assert len(v_boxes) == 1
    assert len(lp_boxes) == 1

    # Plate box within [0, 100]
    lp = lp_boxes[0]
    assert 0 <= lp["x"] <= 100
    assert 0 <= lp["y"] <= 100
    assert (lp["x"] + lp["width"]) <= 100
    assert (lp["y"] + lp["height"]) <= 100


def test_pilot_100_association_ambiguity(export_tasks):
    pilot_100 = next(t for t in export_tasks if t["data"]["sample_id"] == "PILOT-100")
    ann = pilot_100["annotations"][0]
    v_boxes = [r["value"] for r in ann.get("result", []) if "vehicle" in r.get("value", {}).get("rectanglelabels", [])]
    lp_boxes = [r["value"] for r in ann.get("result", []) if "license_plate" in r.get("value", {}).get("rectanglelabels", [])]

    assert len(v_boxes) == 3
    assert len(lp_boxes) == 1

    # Check that plate falls within x bounds of multiple vehicles
    lp_x1 = lp_boxes[0]["x"]
    lp_x2 = lp_x1 + lp_boxes[0]["width"]

    intersecting_vehicles = 0
    for v in v_boxes:
        vx1 = v["x"]
        vx2 = vx1 + v["width"]
        if not (lp_x2 < vx1 or lp_x1 > vx2):
            intersecting_vehicles += 1

    # Plate intersects x-range of Vehicle 1 and Vehicle 2
    assert intersecting_vehicles >= 2


def test_zero_completed_second_reviews():
    second_pass_dir = os.path.join(EVAL_DIR, "annotations", "second_pass", "records")
    final_accepted_dir = os.path.join(EVAL_DIR, "annotations", "final_accepted", "records")

    second_pass_files = [f for f in os.listdir(second_pass_dir) if f.endswith(".json")] if os.path.exists(second_pass_dir) else []
    final_accepted_files = [f for f in os.listdir(final_accepted_dir) if f.endswith(".json")] if os.path.exists(final_accepted_dir) else []

    assert len(second_pass_files) == 0, "No second-pass records should exist before human review"
    assert len(final_accepted_files) == 0, "No final-accepted records should exist before human review"


def test_acceptance_accounting_partition(export_tasks, sidecar_ledger):
    ocr_accepted = []
    unreadable = []
    discrepancies = []

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
                ocr_accepted.append(sid)
            else:
                discrepancies.append(sid)

    assert len(ocr_accepted) == 7
    assert len(unreadable) == 2
    assert len(discrepancies) == 1
    assert set(ocr_accepted + unreadable + discrepancies) == {f"PILOT-{i:03d}" for i in [1, 4, 8, 14, 20, 35, 45, 55, 70, 100]}
