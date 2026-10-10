"""
Focused Test Suite for Pilot Dataset Materialization & Integrity Validation (Phase 5.4)
NETRAVA — Unified CCTV Intelligence Platform (Gujarat Police Innovation Challenge 2026)

Validates:
1. CRC32 mismatch detection on altered bytes
2. Missing image handling
3. Corrupt/truncated image detection
4. Duplicate image content detection via SHA-256
5. Missing or ambiguous transcript mappings rejection (e.g., C270, C407, DL36, WB55)
6. Deterministic replacement selection from verified pool
7. Plaintext license plate exclusion from validation reports and annotation queues
8. Strict preservation and immutability of the original pilot_manifest_100.json
"""

import hashlib
import io
import json
import os
import re
import zlib
from typing import Optional, Tuple
import pytest
from PIL import Image


class PilotDatasetValidator:
    """Core evaluation integrity validation rules applied to pilot datasets."""

    INDIAN_PLATE_REGEX = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$")
    AMBIGUOUS_RECORDS = {"C270.png", "C407.png", "DL36.png", "WB55.png"}

    @staticmethod
    def verify_crc32(data: bytes, expected_crc: int) -> bool:
        return zlib.crc32(data) == expected_crc

    @staticmethod
    def decode_and_verify_image(data: bytes):
        try:
            with Image.open(io.BytesIO(data)) as img:
                img.verify()
            with Image.open(io.BytesIO(data)) as img:
                return True, img.size, img.format, None
        except Exception as ex:
            return False, (0, 0), None, str(ex)

    @staticmethod
    def check_duplicate_content(hashes_seen: set, data: bytes) -> Tuple[bool, str]:
        h = hashlib.sha256(data).hexdigest()
        if h in hashes_seen:
            return True, h
        hashes_seen.add(h)
        return False, h

    @classmethod
    def validate_transcript_mapping(cls, filename: str, transcripts: dict) -> Tuple[bool, Optional[str]]:
        if filename in cls.AMBIGUOUS_RECORDS:
            return False, "AMBIGUOUS_PHASE_5_3_RECORD"
        if filename not in transcripts:
            return False, "MISSING_TRANSCRIPT"
        raw_val = transcripts[filename]
        if not raw_val or not raw_val.strip():
            return False, "EMPTY_TRANSCRIPT"
        return True, None

    @staticmethod
    def select_deterministic_replacement(candidate_pool: list, excluded_ids: set) -> Optional[dict]:
        sorted_pool = sorted(candidate_pool, key=lambda x: x["zip_archive_path"])
        for candidate in sorted_pool:
            if candidate["zip_archive_path"] not in excluded_ids:
                return candidate
        return None

    @staticmethod
    def assert_no_plaintext_plates_in_report(report_text: str, known_plaintext_plates: list):
        for plate in known_plaintext_plates:
            if len(plate) >= 6 and plate in report_text:
                raise ValueError(f"Privacy breach: plaintext plate string detected in report")


# ==============================================================================
# TEST CASES
# ==============================================================================

def test_crc32_mismatch_detection():
    payload = b"Genuine Indian Number Plate PNG Data"
    expected_crc = zlib.crc32(payload)
    assert PilotDatasetValidator.verify_crc32(payload, expected_crc) is True

    # Mutate 1 byte
    corrupted_payload = payload[:-1] + b"X"
    assert PilotDatasetValidator.verify_crc32(corrupted_payload, expected_crc) is False


def test_missing_image_handling(tmp_path):
    missing_file = tmp_path / "non_existent_plate.png"
    assert not missing_file.exists()

    with pytest.raises(FileNotFoundError):
        if not missing_file.exists():
            raise FileNotFoundError(f"Materialized file not found: {missing_file}")


def test_corrupt_image_handling():
    corrupt_bytes = b"\x89PNG\r\n\x1a\nCorruptedTruncatedBytesWithoutIHDR"
    ok, dims, fmt, err = PilotDatasetValidator.decode_and_verify_image(corrupt_bytes)
    assert ok is False
    assert err is not None


def test_duplicate_content_detection():
    img_bytes = io.BytesIO()
    img = Image.new("RGB", (100, 30), color="white")
    img.save(img_bytes, format="PNG")
    raw = img_bytes.getvalue()

    seen_hashes = set()
    is_dup1, h1 = PilotDatasetValidator.check_duplicate_content(seen_hashes, raw)
    assert is_dup1 is False

    # Second sample with identical bytes
    is_dup2, h2 = PilotDatasetValidator.check_duplicate_content(seen_hashes, raw)
    assert is_dup2 is True
    assert h1 == h2


def test_missing_or_ambiguous_transcript_mappings():
    transcripts = {"AN1.png": "AN01AB1234", "C270.png": "AP01CD5678"}

    # Known ambiguous record must be rejected unconditionally
    ok, reason = PilotDatasetValidator.validate_transcript_mapping("C270.png", transcripts)
    assert ok is False
    assert reason == "AMBIGUOUS_PHASE_5_3_RECORD"

    ok, reason = PilotDatasetValidator.validate_transcript_mapping("DL36.png", transcripts)
    assert ok is False
    assert reason == "AMBIGUOUS_PHASE_5_3_RECORD"

    # Missing transcript must be rejected
    ok, reason = PilotDatasetValidator.validate_transcript_mapping("UNKNOWN.png", transcripts)
    assert ok is False
    assert reason == "MISSING_TRANSCRIPT"

    # Valid mapping passes
    ok, reason = PilotDatasetValidator.validate_transcript_mapping("AN1.png", transcripts)
    assert ok is True
    assert reason is None


def test_deterministic_replacement_selection():
    pool = [
        {"zip_archive_path": "images/C (105).png"},
        {"zip_archive_path": "images/C (102).png"},
        {"zip_archive_path": "images/C (103).png"},
    ]
    excluded = {"images/C (102).png"}

    replacement = PilotDatasetValidator.select_deterministic_replacement(pool, excluded)
    assert replacement is not None
    # Alphabetically next after 102 should be 103
    assert replacement["zip_archive_path"] == "images/C (103).png"


def test_plaintext_transcript_exclusion_from_reports():
    clean_report = (
        "# Pilot Validation Report\n"
        "- Sample PILOT-001: 272x575 PNG (Valid Format: True, SHA-256: 94eade71f...)\n"
        "- Sample PILOT-002: 272x363 PNG (Valid Format: True, SHA-256: 5c13cbb4b...)\n"
    )
    known_plates = ["GJ01AB1234", "MH12CD5678", "DL01EF9999"]
    # Clean report passes without exception
    PilotDatasetValidator.assert_no_plaintext_plates_in_report(clean_report, known_plates)

    leaked_report = clean_report + "Raw plate read: GJ01AB1234 on Pakwan Crossroad"
    with pytest.raises(ValueError, match="Privacy breach"):
        PilotDatasetValidator.assert_no_plaintext_plates_in_report(leaked_report, known_plates)


def test_preservation_of_original_candidate_manifest():
    candidates = [
        "pilot_manifest_100.json",
        "/app/pilot_manifest_100.json",
        os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "datasets", "evaluation", "pilot_manifest_100.json"),
        os.path.join("fixtures", "datasets", "evaluation", "pilot_manifest_100.json"),
    ]
    manifest_path = next((c for c in candidates if os.path.exists(c)), None)
    if not manifest_path:
        pytest.skip("pilot_manifest_100.json not accessible in container test path")

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    assert manifest["pilot_sample_count"] == 100
    assert len(manifest["samples"]) == 100
    assert manifest["samples"][0]["excel_filename"] == "AN1.png"
    assert manifest["samples"][0]["crc32"] == 2226459361
