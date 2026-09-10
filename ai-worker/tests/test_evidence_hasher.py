"""
Unit Tests for Cryptographic Evidence Hasher (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 11.2 & Section 11.4
"""

import hashlib
import numpy as np
import pytest

from app.evidence.hasher import compute_sha256, verify_sha256
from app.evidence.snapshot_generator import EvidenceSnapshotGenerator


def test_sha256_matches_standard_hashlib():
    """Verify that compute_sha256 produces exact output matching Python hashlib"""
    test_bytes = b"Gujarat Police Innovation Challenge 2026 - CCTV Evidence Vault"
    expected = hashlib.sha256(test_bytes).hexdigest()
    actual = compute_sha256(test_bytes)

    assert actual == expected
    assert len(actual) == 64
    assert isinstance(actual, str)


def test_sha256_reproducibility():
    """Same binary bytes must deterministically produce the exact same hash"""
    data = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    hash1 = compute_sha256(data)
    hash2 = compute_sha256(data)
    assert hash1 == hash2


def test_sha256_tampering_detection():
    """Altering even a single bit in the byte stream must produce a completely different hash"""
    original = bytearray(b"ORIGINAL_POLICE_EVIDENCE_FRAME_BYTES_123456789")
    original_hash = compute_sha256(bytes(original))

    # Flip one byte
    tampered = bytearray(original)
    tampered[10] = (tampered[10] + 1) % 256
    tampered_hash = compute_sha256(bytes(tampered))

    assert original_hash != tampered_hash
    assert verify_sha256(bytes(original), original_hash) is True
    assert verify_sha256(bytes(tampered), original_hash) is False


def test_verify_sha256_case_insensitivity():
    """Hash verification should be robust to uppercase hex representation"""
    data = b"Sample Evidence Payload"
    expected = hashlib.sha256(data).hexdigest()

    assert verify_sha256(data, expected.lower()) is True
    assert verify_sha256(data, expected.upper()) is True
    assert verify_sha256(data, "0000000000000000000000000000000000000000000000000000000000000000") is False
    assert verify_sha256(data, "") is False


def test_sha256_rejects_non_bytes():
    """TypeError should be raised when non-binary data is supplied for hashing"""
    with pytest.raises(TypeError):
        compute_sha256("string_is_not_allowed")  # type: ignore

    with pytest.raises(TypeError):
        compute_sha256(12345)  # type: ignore


def test_snapshot_generator_produces_valid_sha256():
    """EvidenceSnapshotGenerator produces valid EvidenceArtifact with verified SHA-256"""
    gen = EvidenceSnapshotGenerator(jpeg_quality=90)
    test_frame = np.full((120, 240, 3), 128, dtype=np.uint8)

    artifact = gen.create_snapshot(
        frame=test_frame,
        camera_id="CAM-AHM-01",
        frame_sequence=42,
        captured_at=1725900000.0,
        plate_normalized="GJ01AB1234",
    )

    assert artifact is not None
    assert artifact.camera_id == "CAM-AHM-01"
    assert artifact.frame_sequence == 42
    assert artifact.plate_normalized == "GJ01AB1234"
    assert len(artifact.image_bytes) > 0
    assert len(artifact.sha256_hash) == 64

    # Recalculate hash from exact image bytes
    expected_hash = hashlib.sha256(artifact.image_bytes).hexdigest()
    assert artifact.sha256_hash == expected_hash
    assert verify_sha256(artifact.image_bytes, artifact.sha256_hash) is True
