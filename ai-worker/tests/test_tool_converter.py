"""
Unit Test Suite for Visual Annotation Tool Converter (Phase 5.7)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Tests:
1. Coordinate transformation from relative percentage (0-100%) to integer pixels [x1, y1, x2, y2].
2. Bounding box clamping against image width and height boundaries.
3. Successful conversion of synthetic Label Studio task with vehicle & plate bboxes.
4. Successful conversion of synthetic crop-only task (vehicle=null, reason=CROP_ONLY_NO_CHASSIS).
5. Extraction and mapping of license plate boolean quality flags.
6. Rejection of tasks missing human annotator identifier.
7. Rejection of tasks with missing license plate bounding box.
8. Rejection of tasks with missing vehicle box AND missing unboundable reason.
9. Rejection of tasks with privacy violations (plaintext plate in notes).
10. Rejection of tasks with invalid/unregistered sample IDs.
11. End-to-end compatibility of converted record with NETRAVA annotation validator.
"""

import copy
import json
import pytest
import sys
import os

# Add evaluation dir to path for imports
EVAL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "datasets", "evaluation"))
if EVAL_DIR not in sys.path:
    sys.path.insert(0, EVAL_DIR)

from convert_tool_annotations import (
    convert_relative_bbox_to_pixels,
    convert_label_studio_task
)
from validate_annotations import validate_single_annotation

# Synthetic sidecar fixture
SYNTHETIC_SIDECAR = {
    "PILOT-001": {
        "sample_id": "PILOT-001",
        "image_filename": "AN1.png",
        "image_dimensions": {"width": 272, "height": 575},
        "authoritative_transcript_sha256": "94eade71fbf15c68007831c081cdc98ee8832b53f1c9d48222efd59d292fdad7",
        "char_length": 9
    },
    "PILOT-014": {
        "sample_id": "PILOT-014",
        "image_filename": "AP16.png",
        "image_dimensions": {"width": 272, "height": 153},
        "authoritative_transcript_sha256": "80a7708c53eed44ad3c7847c2b3aa9430db721867e914ef1f0c2a8bb7d5d2c67",
        "char_length": 10
    }
}

# Synthetic Label Studio Task Fixture
SYNTHETIC_LS_TASK = {
    "id": 1,
    "data": {
        "sample_id": "PILOT-001",
        "image_filename": "AN1.png",
        "image_width": 272,
        "image_height": 575
    },
    "annotations": [
        {
            "id": 101,
            "completed_by": {
                "id": 1,
                "email": "human_reviewer_1@netrava.internal"
            },
            "result": [
                {
                    "type": "rectanglelabels",
                    "value": {
                        "x": 3.68,
                        "y": 7.83,
                        "width": 91.91,
                        "height": 84.35,
                        "rectanglelabels": ["vehicle"]
                    },
                    "to_name": "image",
                    "from_name": "bbox_labels"
                },
                {
                    "type": "rectanglelabels",
                    "value": {
                        "x": 11.76,
                        "y": 48.70,
                        "width": 76.47,
                        "height": 36.52,
                        "rectanglelabels": ["license_plate"]
                    },
                    "to_name": "image",
                    "from_name": "bbox_labels"
                },
                {
                    "type": "choices",
                    "value": {
                        "choices": ["is_blurred"]
                    },
                    "to_name": "image",
                    "from_name": "plate_flags"
                },
                {
                    "type": "choices",
                    "value": {
                        "choices": ["VERIFIED_MATCH"]
                    },
                    "to_name": "image",
                    "from_name": "transcript_verification"
                },
                {
                    "type": "textarea",
                    "value": {
                        "text": ["Human observation notes on visual inspection"]
                    },
                    "to_name": "image",
                    "from_name": "notes"
                }
            ],
            "created_at": "2026-10-09T10:00:00Z",
            "updated_at": "2026-10-09T10:05:00Z"
        }
    ]
}


def test_convert_relative_bbox_to_pixels():
    # 50% across on 200px width -> 100
    # 25% height on 400px height -> 100
    bbox = convert_relative_bbox_to_pixels(10.0, 20.0, 50.0, 30.0, 200, 400)
    assert bbox == [20, 80, 120, 200]


def test_coordinate_clamping():
    # Bbox extending beyond 100% boundary
    bbox = convert_relative_bbox_to_pixels(90.0, 90.0, 20.0, 20.0, 100, 100)
    assert bbox[0] == 90
    assert bbox[1] == 90
    assert bbox[2] == 100
    assert bbox[3] == 100


def test_synthetic_task_conversion_passes_schema():
    rec, errs = convert_label_studio_task(SYNTHETIC_LS_TASK, SYNTHETIC_SIDECAR)
    assert len(errs) == 0
    assert rec is not None
    assert rec["sample_id"] == "PILOT-001"
    assert rec["review_stage"] == "FIRST_PASS_SUBMITTED"
    assert rec["annotator_id"] == "human_reviewer_1@netrava.internal"
    assert rec["license_plate"]["bbox"] is not None
    assert rec["license_plate"]["is_blurred"] is True
    assert rec["license_plate"]["is_truncated"] is False
    assert rec["vehicle"]["bbox"] is not None
    assert rec["transcript_verification"]["status"] == "VERIFIED_MATCH"

    # Must pass NETRAVA schema validator
    val_errs = validate_single_annotation(rec)
    assert len(val_errs) == 0


def test_synthetic_crop_only_task_conversion():
    crop_task = copy.deepcopy(SYNTHETIC_LS_TASK)
    # Remove vehicle box, add vehicle_unboundable_reason choice
    crop_task["annotations"][0]["result"] = [
        item for item in crop_task["annotations"][0]["result"]
        if not (item.get("type") == "rectanglelabels" and "vehicle" in item.get("value", {}).get("rectanglelabels", []))
    ]
    crop_task["annotations"][0]["result"].append({
        "type": "choices",
        "value": {"choices": ["CROP_ONLY_NO_CHASSIS"]},
        "to_name": "image",
        "from_name": "vehicle_unboundable_reason"
    })

    rec, errs = convert_label_studio_task(crop_task, SYNTHETIC_SIDECAR)
    assert len(errs) == 0
    assert rec["vehicle"] is None
    assert rec["vehicle_unboundable_reason"] == "CROP_ONLY_NO_CHASSIS"

    # Must pass NETRAVA validator
    val_errs = validate_single_annotation(rec)
    assert len(val_errs) == 0


def test_missing_annotator_fails_conversion():
    bad_task = copy.deepcopy(SYNTHETIC_LS_TASK)
    bad_task["annotations"][0]["completed_by"] = None
    rec, errs = convert_label_studio_task(bad_task, SYNTHETIC_SIDECAR)
    assert rec is None
    assert any("missing required human annotator_id" in e for e in errs)


def test_missing_license_plate_box_fails_conversion():
    bad_task = copy.deepcopy(SYNTHETIC_LS_TASK)
    bad_task["annotations"][0]["result"] = [
        item for item in bad_task["annotations"][0]["result"]
        if not (item.get("type") == "rectanglelabels" and "license_plate" in item.get("value", {}).get("rectanglelabels", []))
    ]
    rec, errs = convert_label_studio_task(bad_task, SYNTHETIC_SIDECAR)
    assert rec is None
    assert any("No license_plate bounding box" in e for e in errs)


def test_missing_vehicle_box_and_reason_fails_conversion():
    bad_task = copy.deepcopy(SYNTHETIC_LS_TASK)
    bad_task["annotations"][0]["result"] = [
        item for item in bad_task["annotations"][0]["result"]
        if not (item.get("type") == "rectanglelabels" and "vehicle" in item.get("value", {}).get("rectanglelabels", []))
    ]
    rec, errs = convert_label_studio_task(bad_task, SYNTHETIC_SIDECAR)
    assert rec is None
    assert any("Vehicle box is absent and no vehicle_unboundable_reason" in e for e in errs)


def test_privacy_leak_in_notes_rejected():
    bad_task = copy.deepcopy(SYNTHETIC_LS_TASK)
    for item in bad_task["annotations"][0]["result"]:
        if item.get("from_name") == "notes":
            item["value"]["text"] = ["Observed car with plate GJ01AB1234"]

    rec, errs = convert_label_studio_task(bad_task, SYNTHETIC_SIDECAR)
    assert rec is None
    assert any("Privacy violation" in e for e in errs)


def test_unregistered_sample_id_rejected():
    bad_task = copy.deepcopy(SYNTHETIC_LS_TASK)
    bad_task["data"]["sample_id"] = "PILOT-999"
    rec, errs = convert_label_studio_task(bad_task, SYNTHETIC_SIDECAR)
    assert rec is None
    assert any("not in authoritative sidecar ledger" in e for e in errs)
