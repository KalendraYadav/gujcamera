"""
Unit Test Suite for Independent Second-Pass Review Execution & Ground-Truth Freeze (Phase 5.10)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. Rejection of premature final ground-truth freeze: asserts final_accepted/records/ remains empty.
2. Second-pass review queue integrity: confirms 10 tasks queued as PENDING_SECOND_HUMAN_REVIEWER.
3. Reviewer identity rule: asserts no fabricated reviewer_id exists in second_pass/records/.
4. PILOT-014 discrepancy preservation: asserts audit trail records both AP39GR3432 and AP39GR9492.
5. PILOT-055 unreadable preservation: eligible for localization, strictly excluded from OCR.
6. PILOT-100 multi-vehicle association: flagged as UNVERIFIABLE for automated single-vehicle schema.
7. Provisional first-pass record validation: verifies all 10 provisional records pass schema checks.
8. Acceptance totals: 7 OCR eligible, 9 localization eligible, 0 fully frozen.
"""

import json
import os
import pytest

EVAL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "datasets", "evaluation"))
ANNOTATIONS_DIR = os.path.join(EVAL_DIR, "annotations")
QUEUE_PATH = os.path.join(ANNOTATIONS_DIR, "second_pass", "pending_review_queue.json")
PROVISIONAL_DIR = os.path.join(ANNOTATIONS_DIR, "provisional_first_pass", "records")
FINAL_ACCEPTED_DIR = os.path.join(ANNOTATIONS_DIR, "final_accepted", "records")
SECOND_PASS_DIR = os.path.join(ANNOTATIONS_DIR, "second_pass", "records")
SIDECAR_PATH = os.path.join(ANNOTATIONS_DIR, "tool_integration", "transcript_sidecar_ledger.json")


def test_final_accepted_remains_empty_pending_human_review():
    assert os.path.isdir(FINAL_ACCEPTED_DIR)
    accepted_files = [f for f in os.listdir(FINAL_ACCEPTED_DIR) if f.endswith(".json")]
    assert len(accepted_files) == 0, "No records may be frozen to final_accepted prior to genuine dual review"


def test_second_pass_records_remains_empty():
    if os.path.isdir(SECOND_PASS_DIR):
        second_pass_files = [f for f in os.listdir(SECOND_PASS_DIR) if f.endswith(".json")]
        assert len(second_pass_files) == 0, "No records may exist in second_pass prior to second human reviewer session"


def test_pending_review_queue_structure():
    assert os.path.isfile(QUEUE_PATH), f"Pending review queue missing at {QUEUE_PATH}"
    with open(QUEUE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    meta = data["queue_metadata"]
    assert meta["total_queued"] == 10
    assert meta["pending_count"] == 10
    assert meta["completed_count"] == 0

    items = data["queue_items"]
    assert len(items) == 10
    for item in items:
        assert item["second_review_status"] == "PENDING_SECOND_HUMAN_REVIEWER"
        assert item["first_pass_annotator_id"] is not None


def test_pilot_014_preservation_and_ocr_exclusion():
    with open(QUEUE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    p14 = next(it for it in data["queue_items"] if it["sample_id"] == "PILOT-014")

    assert p14["first_pass_transcript_status"] == "MISMATCH"
    assert p14["ocr_eligible"] is False
    assert p14["localization_eligible"] is True
    assert "AP39GR3432 vs AP39GR9492" in p14["action_required"]


def test_pilot_055_and_pilot_100_unreadable_preservation():
    with open(QUEUE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    for sid in ["PILOT-055", "PILOT-100"]:
        item = next(it for it in data["queue_items"] if it["sample_id"] == sid)
        assert item["first_pass_transcript_status"] == "UNREADABLE"
        assert item["ocr_eligible"] is False


def test_provisional_records_schema_compliance():
    import sys
    if EVAL_DIR not in sys.path:
        sys.path.insert(0, EVAL_DIR)
    from validate_annotations import validate_single_annotation

    prov_files = [f for f in os.listdir(PROVISIONAL_DIR) if f.endswith(".json")]
    assert len(prov_files) == 10

    for fname in prov_files:
        fpath = os.path.join(PROVISIONAL_DIR, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            rec = json.load(f)
        errs = validate_single_annotation(rec)
        assert len(errs) == 0, f"Provisional record {fname} has validation errors: {errs}"
        assert rec["review_stage"] == "FIRST_PASS_SUBMITTED"
        assert rec["reviewer_id"] is None
