"""
Cryptographic Evidence Hasher (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 11.2 & Section 11.4

Computes and verifies SHA-256 integrity fingerprints over exact encoded image bytes.
NOTE: In forensic science, SHA-256 serves as an integrity fingerprint, not proof of immutability.
"""

import hashlib
from typing import Union


def compute_sha256(data: Union[bytes, bytearray, memoryview]) -> str:
    """
    Compute a deterministic 64-character hexadecimal SHA-256 digest
    strictly over the raw binary bytes of an encoded evidence artifact.

    Args:
        data: Raw encoded bytes (e.g., JPEG or PNG byte buffer).

    Returns:
        64-character lowercase hex string.
    """
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise TypeError(f"Expected binary bytes-like object for hashing, got {type(data).__name__}")

    hasher = hashlib.sha256()
    hasher.update(data)
    return hasher.hexdigest()


def verify_sha256(data: Union[bytes, bytearray, memoryview], expected_hash: str) -> bool:
    """
    Verify whether the SHA-256 digest of binary data matches an expected integrity hash.
    Case-insensitive comparison.

    Args:
        data: Raw bytes to verify.
        expected_hash: Previously recorded 64-character SHA-256 hex string.

    Returns:
        True if the data's SHA-256 digest matches expected_hash exactly, False otherwise.
    """
    if not expected_hash or not isinstance(expected_hash, str):
        return False

    actual_hash = compute_sha256(data)
    return actual_hash.lower() == expected_hash.strip().lower()
