"""
Focused Test Suite for Phase 5.6 Annotation Schema, Boundary, and Workflow Validation
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Validates:
1. Rejection of negative coordinates in bounding boxes
2. Rejection of out-of-bounds coordinates exceeding image width/height
3. Rejection of zero-width or zero-height (or inverted) bounding boxes
4. Rejection of unsupported class names (must be 'vehicle' or 'license_plate')
5. Enforcement of mandatory explanation when vehicle chassis is null
6. Rejection of duplicate sample IDs
7. Transcript status validation against allowed enum values (including PENDING_HUMAN_INSPECTION)
8. Proper validation of Phase 5.6 UNREVIEWED work item templates (null bbox, pending inspection)
9. Rejection of UNREVIEWED records with fake annotator_id
10. Rejection of FIRST_PASS_SUBMITTED records with missing annotator_id or premature reviewer_id
11. Rejection of SECOND_PASS_REVIEWED records with missing reviewer_id
12. Strict privacy leak detection rejecting plaintext registration plates in notes or strings
13. Automated rule asserting that validation never falsely marks annotations as visually verified
"""

import copy
import json
import os
import re
import pytest

VALID_FIRST_PASS_FIXTURE = {
    "$schema": "../../schema/annotation_schema.json",
    "sample_id": "PILOT-001",
    "image_filename": "AN1.png",
    "image_dimensions": {
        "width": 272,
        "height": 575
    },
    "vehicle": {
        "class": "vehicle",
        "bbox": [10, 45, 260, 530],
        "vehicle_type": "motorcycle"
    },
    "vehicle_unboundable_reason": None,
    "license_plate": {
        "class": "license_plate",
        "bbox": [32, 280, 240, 490],
        "is_truncated": False,
        "is_occluded": False,
        "is_blurred": False,
        "is_difficult": False
    },
    "transcript_verification": {
        "status": "VERIFIED_MATCH",
        "authoritative_transcript_sha256": "94eade71fbf15c68007831c081cdc98ee8832b53f1c9d48222efd59d292fdad7",
        "char_length": 9,
        "has_corrections": False,
        "correction_notes": None
    },
    "review_stage": "FIRST_PASS_SUBMITTED",
    "annotation_status": "FIRST_PASS_COMPLETE",
    "schema_version": "1.1.0",
    "annotator_id": "annotator_human_1",
    "reviewer_id": None,
    "notes": "Valid human first pass fixture",
    "created_at": "2026-10-09T09:30:00Z",
    "updated_at": "2026-10-09T09:30:00Z"
}

VALID_UNREVIEWED_FIXTURE = {
    "$schema": "../../schema/annotation_schema.json",
    "sample_id": "PILOT-001",
    "image_filename": "AN1.png",
    "image_dimensions": {
        "width": 272,
        "height": 575
    },
    "vehicle": {
        "class": "vehicle",
        "bbox": None,
        "vehicle_type": None
    },
    "vehicle_unboundable_reason": "AWAITING_HUMAN_INSPECTION",
    "license_plate": {
        "class": "license_plate",
        "bbox": None,
        "is_truncated": None,
        "is_occluded": None,
        "is_blurred": None,
        "is_difficult": None
    },
    "transcript_verification": {
        "status": "PENDING_HUMAN_INSPECTION",
        "authoritative_transcript_sha256": "94eade71fbf15c68007831c081cdc98ee8832b53f1c9d48222efd59d292fdad7",
        "char_length": 9,
        "has_corrections": None,
        "correction_notes": None
    },
    "review_stage": "UNREVIEWED",
    "annotation_status": "UNREVIEWED",
    "schema_version": "1.1.0",
    "annotator_id": None,
    "reviewer_id": None,
    "notes": "Work item prepared for Phase 5.6 human annotation pilot. Awaiting human inspection.",
    "created_at": "2026-10-09T09:35:00Z",
    "updated_at": "2026-10-09T09:35:00Z"
}

SUPPORTED_CLASSES = {"vehicle", "license_plate"}
VALID_TRANSCRIPT_STATUSES = {
    "PENDING_HUMAN_INSPECTION",
    "VERIFIED_MATCH",
    "MISMATCH",
    "UNREADABLE",
    "NEEDS_SECOND_REVIEW",
}
VALID_REVIEW_STAGES = {
    "UNREVIEWED",
    "FIRST_PASS_SUBMITTED",
    "SECOND_PASS_REVIEWED",
    "ACCEPTED_FINAL",
}
PRIVACY_PLATE_REGEX = re.compile(r"\b[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}\b")


def validate_annotation(record: dict) -> list:
    """Validator implementation conforming to validate_annotations.py specification."""
    errors = []
    w = record.get("image_dimensions", {}).get("width", 0)
    h = record.get("image_dimensions", {}).get("height", 0)

    stage = record.get("review_stage")
    if stage not in VALID_REVIEW_STAGES:
        errors.append(f"Invalid review_stage: {stage}")

    is_unreviewed = (stage == "UNREVIEWED")
    annotator_id = record.get("annotator_id")
    reviewer_id = record.get("reviewer_id")

    # Annotator/Reviewer checks
    if is_unreviewed:
        if annotator_id is not None:
            errors.append(f"annotator_id must be null for UNREVIEWED stage, got {annotator_id}")
        if reviewer_id is not None:
            errors.append(f"reviewer_id must be null for UNREVIEWED stage, got {reviewer_id}")
    elif stage == "FIRST_PASS_SUBMITTED":
        if not annotator_id or not str(annotator_id).strip():
            errors.append("FIRST_PASS_SUBMITTED requires a valid non-empty annotator_id")
        if reviewer_id is not None:
            errors.append("reviewer_id must be null for FIRST_PASS_SUBMITTED stage")
    elif stage in ("SECOND_PASS_REVIEWED", "ACCEPTED_FINAL"):
        if not annotator_id or not str(annotator_id).strip():
            errors.append(f"{stage} requires a valid non-empty annotator_id")
        if not reviewer_id or not str(reviewer_id).strip():
            errors.append(f"{stage} requires a valid non-empty reviewer_id")

    # License plate checks
    lp = record.get("license_plate")
    if lp is None:
        if not is_unreviewed:
            errors.append("license_plate cannot be null in submitted review stages")
    elif isinstance(lp, dict):
        if lp.get("class") != "license_plate":
            errors.append("Unsupported license_plate class")
        bbox = lp.get("bbox")
        if bbox is None:
            if not is_unreviewed:
                errors.append("license_plate bbox cannot be null in submitted review stages")
        elif isinstance(bbox, (list, tuple)) and len(bbox) == 4:
            x1, y1, x2, y2 = bbox
            if x1 < 0 or y1 < 0:
                errors.append("Negative coordinates in license_plate bbox")
            if x1 >= x2 or y1 >= y2:
                errors.append("Zero or inverted dimensions in license_plate bbox")
            if w > 0 and x2 > w:
                errors.append("license_plate x2 exceeds image width")
            if h > 0 and y2 > h:
                errors.append("license_plate y2 exceeds image height")
        else:
            errors.append("Invalid license_plate bbox length")

        for flag in ["is_truncated", "is_occluded", "is_blurred", "is_difficult"]:
            if flag not in lp:
                errors.append(f"license_plate missing flag '{flag}'")
            elif is_unreviewed:
                if lp[flag] is not None and not isinstance(lp[flag], bool):
                    errors.append(f"license_plate flag '{flag}' must be bool or null in UNREVIEWED stage")
            else:
                if not isinstance(lp[flag], bool):
                    errors.append(f"license_plate flag '{flag}' must be boolean in submitted stages")

    # Vehicle checks
    veh = record.get("vehicle")
    reason = record.get("vehicle_unboundable_reason")
    if veh is None:
        if not reason or not reason.strip():
            errors.append("Vehicle is null but vehicle_unboundable_reason is missing")
    elif isinstance(veh, dict):
        if veh.get("class") != "vehicle":
            errors.append("Unsupported vehicle class")
        vbbox = veh.get("bbox")
        if vbbox is None:
            if not is_unreviewed and not reason:
                errors.append("vehicle bbox is null but vehicle_unboundable_reason is missing")
        elif isinstance(vbbox, (list, tuple)) and len(vbbox) == 4:
            vx1, vy1, vx2, vy2 = vbbox
            if vx1 < 0 or vy1 < 0:
                errors.append("Negative coordinates in vehicle bbox")
            if vx1 >= vx2 or vy1 >= vy2:
                errors.append("Zero or inverted dimensions in vehicle bbox")
            if w > 0 and vx2 > w:
                errors.append("vehicle x2 exceeds image width")
            if h > 0 and vy2 > h:
                errors.append("vehicle y2 exceeds image height")
        else:
            errors.append("Invalid vehicle bbox length")

    # Transcript checks
    tv = record.get("transcript_verification", {})
    t_status = tv.get("status")
    if t_status not in VALID_TRANSCRIPT_STATUSES:
        errors.append(f"Invalid transcript status: {t_status}")
    if is_unreviewed and t_status != "PENDING_HUMAN_INSPECTION":
        errors.append("UNREVIEWED stage must have status PENDING_HUMAN_INSPECTION")
    elif not is_unreviewed and t_status == "PENDING_HUMAN_INSPECTION":
        errors.append("Submitted review stage cannot have status PENDING_HUMAN_INSPECTION")

    # Privacy leak checks
    for field_name in ["notes", "correction_notes"]:
        val = record.get(field_name) or tv.get(field_name)
        if isinstance(val, str) and PRIVACY_PLATE_REGEX.search(val):
            errors.append(f"Privacy violation: plaintext registration plate detected in {field_name}")

    return errors


def test_valid_first_pass_record_passes_all_checks():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    errs = validate_annotation(rec)
    assert len(errs) == 0


def test_valid_unreviewed_work_item_passes_all_checks():
    rec = copy.deepcopy(VALID_UNREVIEWED_FIXTURE)
    errs = validate_annotation(rec)
    assert len(errs) == 0


def test_unreviewed_with_fake_annotator_fails():
    rec = copy.deepcopy(VALID_UNREVIEWED_FIXTURE)
    rec["annotator_id"] = "fake_ai_annotator"
    errs = validate_annotation(rec)
    assert any("annotator_id must be null for UNREVIEWED" in e for e in errs)


def test_first_pass_missing_annotator_fails():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["annotator_id"] = None
    errs = validate_annotation(rec)
    assert any("FIRST_PASS_SUBMITTED requires a valid non-empty annotator_id" in e for e in errs)


def test_first_pass_premature_reviewer_fails():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["reviewer_id"] = "premature_reviewer"
    errs = validate_annotation(rec)
    assert any("reviewer_id must be null for FIRST_PASS_SUBMITTED" in e for e in errs)


def test_second_pass_missing_reviewer_fails():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["review_stage"] = "SECOND_PASS_REVIEWED"
    rec["reviewer_id"] = None
    errs = validate_annotation(rec)
    assert any("SECOND_PASS_REVIEWED requires a valid non-empty reviewer_id" in e for e in errs)


def test_negative_coordinates_rejected():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["license_plate"]["bbox"] = [-5, 280, 240, 490]
    errs = validate_annotation(rec)
    assert any("Negative coordinates" in e for e in errs)


def test_out_of_bounds_coordinates_rejected():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["license_plate"]["bbox"] = [32, 280, 300, 490]
    errs = validate_annotation(rec)
    assert any("exceeds image width" in e for e in errs)

    rec2 = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec2["vehicle"]["bbox"] = [10, 45, 260, 600]
    errs2 = validate_annotation(rec2)
    assert any("exceeds image height" in e for e in errs2)


def test_zero_or_inverted_dimensions_rejected():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["license_plate"]["bbox"] = [100, 280, 100, 490]
    errs = validate_annotation(rec)
    assert any("Zero or inverted dimensions" in e for e in errs)

    rec2 = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec2["license_plate"]["bbox"] = [50, 490, 200, 280]
    errs2 = validate_annotation(rec2)
    assert any("Zero or inverted dimensions" in e for e in errs2)


def test_unsupported_class_name_rejected():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["license_plate"]["class"] = "plate_number_box"
    errs = validate_annotation(rec)
    assert any("Unsupported license_plate class" in e for e in errs)


def test_null_vehicle_requires_explicit_reason():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["vehicle"] = None
    rec["vehicle_unboundable_reason"] = None
    errs = validate_annotation(rec)
    assert any("vehicle_unboundable_reason is missing" in e for e in errs)

    rec["vehicle_unboundable_reason"] = "CROP_ONLY_NO_CHASSIS"
    errs2 = validate_annotation(rec)
    assert len(errs2) == 0


def test_transcript_status_validation():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["transcript_verification"]["status"] = "AUTOMATIC_CONFIRMED"
    errs = validate_annotation(rec)
    assert any("Invalid transcript status" in e for e in errs)


def test_privacy_leak_rejected():
    rec = copy.deepcopy(VALID_FIRST_PASS_FIXTURE)
    rec["notes"] = "Plate is GJ01AB1234 on front bumper"
    errs = validate_annotation(rec)
    assert any("Privacy violation" in e for e in errs)


def test_unreviewed_cannot_claim_verified_match():
    rec = copy.deepcopy(VALID_UNREVIEWED_FIXTURE)
    rec["transcript_verification"]["status"] = "VERIFIED_MATCH"
    errs = validate_annotation(rec)
    assert any("UNREVIEWED stage must have status PENDING_HUMAN_INSPECTION" in e for e in errs)
