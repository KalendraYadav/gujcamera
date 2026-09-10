"""
Unit Tests for MinIO Evidence Storage Vault (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 11.2 & Section 19.1

Covers Critical Check 4 (Privacy / No Plaintext Plate in Metadata),
Critical Check 8 (Evidence Selection & SHA-256 Round-trip Integrity Verification),
and Critical Check 9 (MinIO Failure Modes & Zero False-Success Guarantees).
"""

import hashlib
import io
import time
from unittest.mock import MagicMock, patch
import pytest

from app.evidence.contract import (
    EvidenceArtifact,
    EvidenceStorageErrorCode,
    EvidenceStorageResult,
)
from app.evidence.hasher import compute_sha256, verify_sha256
from app.evidence.storage import MinioEvidenceVault


@pytest.fixture
def sample_artifact():
    raw_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF_SAMPLE_EVIDENCE_BYTES_FOR_UNIT_TEST"
    computed_hash = hashlib.sha256(raw_bytes).hexdigest()
    return EvidenceArtifact(
        artifact_id="11111111-2222-3333-4444-555555555555",
        camera_id="CAM-AHM-01",
        frame_sequence=105,
        captured_at=1725883200.0,  # 2024-09-09 12:00:00 UTC
        plate_normalized="GJ01AB1234",
        image_bytes=raw_bytes,
        sha256_hash=computed_hash,
        width=1920,
        height=1080,
    )


def test_object_key_generation():
    """Object keys must follow deterministic, privacy-safe hierarchy: evidence/YYYY/MM/DD/{cam}/sighting_{id}.jpg"""
    vault = MinioEvidenceVault(endpoint="localhost:9000")
    key = vault.generate_object_key(
        camera_id="CAM-AHM-01",
        artifact_id="test-uuid-1234",
        timestamp=1725883200.0,
    )
    assert key == "evidence/2024/09/09/CAM-AHM-01/sighting_test-uuid-1234.jpg"
    assert "GJ01AB1234" not in key, "License plate must NEVER be embedded in S3 object key"


def test_endpoint_sanitization():
    """HTTP/HTTPS prefixes should be stripped for MinIO SDK compatibility"""
    vault1 = MinioEvidenceVault(endpoint="http://minio:9000")
    assert vault1.clean_endpoint == "minio:9000"

    vault2 = MinioEvidenceVault(endpoint="https://s3.example.com:9000")
    assert vault2.clean_endpoint == "s3.example.com:9000"

    vault3 = MinioEvidenceVault(endpoint="localhost:9000")
    assert vault3.clean_endpoint == "localhost:9000"


# ==============================================================================
# CRITICAL CHECK 4 & 9: SUCCESSFUL UPLOAD & METADATA PRIVACY AUDIT
# ==============================================================================

def test_successful_minio_upload(sample_artifact):
    """
    Critical Check 4: Successful upload attaches SHA-256 and camera context headers,
    but DELIBERATELY EXCLUDES plaintext license plate metadata for privacy.
    """
    vault = MinioEvidenceVault(endpoint="localhost:9000", bucket_name="police-evidence-vault")

    mock_client = MagicMock()
    mock_client.bucket_exists.return_value = True
    vault._client = mock_client
    vault._bucket_verified = True

    result = vault.store_artifact(sample_artifact)

    assert result.success is True
    assert result.bucket == "police-evidence-vault"
    assert result.storage_ref == f"s3://police-evidence-vault/{result.object_key}"
    assert result.sha256_hash == sample_artifact.sha256_hash
    assert result.error_code is None
    assert result.upload_latency_ms >= 0.0

    # Verify put_object was called with correct metadata
    mock_client.put_object.assert_called_once()
    call_args = mock_client.put_object.call_args[1]
    assert call_args["bucket_name"] == "police-evidence-vault"
    assert call_args["content_type"] == "image/jpeg"
    assert call_args["metadata"]["x-amz-meta-sha256"] == sample_artifact.sha256_hash
    assert call_args["metadata"]["x-amz-meta-camera-id"] == "CAM-AHM-01"
    assert call_args["metadata"]["x-amz-meta-frame-seq"] == "105"
    assert call_args["metadata"]["x-amz-meta-captured-at"] == "1725883200.0"

    # CRITICAL PRIVACY CHECK: Plaintext plate must NOT be in metadata
    assert "x-amz-meta-plate-normalized" not in call_args["metadata"]


# ==============================================================================
# CRITICAL CHECK 8: ROUND-TRIP RETRIEVAL & SHA-256 RECALCULATION
# ==============================================================================

def test_evidence_round_trip_retrieval_and_hash_recalculation():
    """
    Critical Check 8:
    1. Generate JPEG bytes
    2. Hash them with SHA-256
    3. Upload to MinIO vault
    4. Retrieve exact bytes from vault
    5. Recompute SHA-256 over retrieved bytes
    6. Verify exact byte-level and cryptographic equality
    """
    # 1. Generate JPEG bytes
    jpeg_payload = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\x08TEST_JPEG_DATA"
    
    # 2. Hash them
    expected_sha256 = compute_sha256(jpeg_payload)
    assert len(expected_sha256) == 64

    artifact = EvidenceArtifact(
        artifact_id="roundtrip-test-artifact-001",
        camera_id="CAM-AHM-02",
        frame_sequence=200,
        captured_at=1725883500.0,
        plate_normalized="GJ01CD5678",
        image_bytes=jpeg_payload,
        sha256_hash=expected_sha256,
        width=1280,
        height=720,
    )

    vault = MinioEvidenceVault(endpoint="localhost:9000", bucket_name="police-evidence-vault")

    # In-memory backing store simulating MinIO S3 object store
    s3_storage_mock: dict = {}

    def mock_put_object(bucket_name, object_name, data, length, content_type, metadata):
        s3_storage_mock[object_name] = {
            "bytes": data.read(),
            "metadata": metadata,
            "content_type": content_type,
        }

    def mock_get_object(bucket_name, object_name):
        if object_name not in s3_storage_mock:
            raise Exception("NoSuchKey: The specified key does not exist.")
        mock_resp = MagicMock()
        mock_resp.read.return_value = s3_storage_mock[object_name]["bytes"]
        mock_resp.close = MagicMock()
        mock_resp.release_conn = MagicMock()
        return mock_resp

    mock_client = MagicMock()
    mock_client.bucket_exists.return_value = True
    mock_client.put_object.side_effect = mock_put_object
    mock_client.get_object.side_effect = mock_get_object
    vault._client = mock_client
    vault._bucket_verified = True

    # 3. Upload them
    store_result = vault.store_artifact(artifact)
    assert store_result.success is True
    assert store_result.sha256_hash == expected_sha256
    assert store_result.storage_ref is not None

    # 4. Retrieve exact bytes from vault
    retrieved_bytes = vault.retrieve_artifact_bytes(store_result.object_key)
    assert retrieved_bytes is not None
    assert retrieved_bytes == jpeg_payload

    # 5. Recompute SHA-256 over retrieved bytes
    recomputed_hash = compute_sha256(retrieved_bytes)

    # 6. Verify equality
    assert recomputed_hash == expected_sha256
    assert verify_sha256(retrieved_bytes, expected_sha256) is True


# ==============================================================================
# CRITICAL CHECK 9: MINIO FAILURE MODES AUDIT (NO FAKE SUCCESS)
# ==============================================================================

def test_failure_mode_minio_unavailable(sample_artifact):
    """
    Mode 1: MinIO client is uninitialized or offline.
    Must return explicit failure with storage_ref=None (NEVER fake success).
    """
    vault = MinioEvidenceVault(endpoint="localhost:9000")
    vault._client = None  # Simulate offline / unreachable MinIO

    result = vault.store_artifact(sample_artifact)

    assert result.success is False
    assert result.storage_ref is None, "Dangling or fake storage reference must NEVER be created"
    assert result.error_code == EvidenceStorageErrorCode.MINIO_UNAVAILABLE.value
    assert "offline" in result.error_message.lower() or "unavailable" in result.error_message.lower()


def test_failure_mode_invalid_credentials(sample_artifact):
    """
    Mode 2: MinIO rejects credentials with AccessDenied / InvalidAccessKeyId.
    Must capture error gracefully and return structured failure without crash.
    """
    vault = MinioEvidenceVault(endpoint="localhost:9000")
    mock_client = MagicMock()
    mock_client.bucket_exists.return_value = True
    mock_client.put_object.side_effect = Exception("AccessDenied: Access Denied. Invalid credentials or insufficient permissions.")
    vault._client = mock_client
    vault._bucket_verified = True

    result = vault.store_artifact(sample_artifact)

    assert result.success is False
    assert result.storage_ref is None
    assert result.error_code == EvidenceStorageErrorCode.STORAGE_EXCEPTION.value
    assert "AccessDenied" in result.error_message


def test_failure_mode_invalid_bucket(sample_artifact):
    """
    Mode 3: MinIO bucket does not exist and cannot be created (NoSuchBucket / InvalidBucketName).
    Must categorize error as BUCKET_NOT_FOUND and return storage_ref=None.
    """
    vault = MinioEvidenceVault(endpoint="localhost:9000", bucket_name="non-existent-bucket")
    mock_client = MagicMock()
    # bucket_exists returns False, make_bucket fails
    mock_client.bucket_exists.return_value = False
    mock_client.make_bucket.side_effect = Exception("NoSuchBucket: The specified bucket does not exist and creation is forbidden.")
    vault._client = mock_client
    vault._bucket_verified = False

    result = vault.store_artifact(sample_artifact)

    assert result.success is False
    assert result.storage_ref is None
    assert result.error_code == EvidenceStorageErrorCode.BUCKET_NOT_FOUND.value


def test_failure_mode_timeout_and_network_failure(sample_artifact):
    """
    Mode 4: Network partition, timeout, or TCP reset during upload.
    Must handle gracefully without crashing AI worker thread.
    """
    vault = MinioEvidenceVault(endpoint="localhost:9000")
    mock_client = MagicMock()
    mock_client.bucket_exists.return_value = True
    mock_client.put_object.side_effect = TimeoutError("Connection to minio:9000 timed out after 5000ms")
    vault._client = mock_client
    vault._bucket_verified = True

    result = vault.store_artifact(sample_artifact)

    assert result.success is False
    assert result.storage_ref is None
    assert result.error_code == EvidenceStorageErrorCode.STORAGE_EXCEPTION.value
    assert "timed out" in result.error_message.lower()


def test_failure_mode_empty_or_null_bytes():
    """
    Mode 5: Null or empty byte payload is rejected upfront before network call.
    """
    vault = MinioEvidenceVault(endpoint="localhost:9000")
    empty_artifact = EvidenceArtifact(
        artifact_id="empty-1",
        camera_id="CAM-1",
        frame_sequence=1,
        captured_at=1725883200.0,
        plate_normalized="GJ01AB1234",
        image_bytes=b"",
        sha256_hash="",
        width=0,
        height=0,
    )

    result = vault.store_artifact(empty_artifact)
    assert result.success is False
    assert result.storage_ref is None
    assert result.error_code == EvidenceStorageErrorCode.INVALID_BYTES.value
