"""
Evidence Contracts and Storage Results (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 11
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional


class EvidenceStorageErrorCode(str, Enum):
    """Structured failure categories for MinIO evidence storage"""
    MINIO_UNAVAILABLE = "MINIO_UNAVAILABLE"
    UPLOAD_FAILED = "UPLOAD_FAILED"
    BUCKET_NOT_FOUND = "BUCKET_NOT_FOUND"
    HASH_MISMATCH = "HASH_MISMATCH"
    INVALID_BYTES = "INVALID_BYTES"
    STORAGE_EXCEPTION = "STORAGE_EXCEPTION"


@dataclass(slots=True)
class EvidenceArtifact:
    """
    Forensic snapshot image artifact with cryptographic SHA-256 integrity fingerprint.
    Produced deterministically from the best accepted consensus frame.
    """
    artifact_id: str
    camera_id: str
    frame_sequence: int
    captured_at: float
    plate_normalized: str
    image_bytes: bytes
    sha256_hash: str
    width: int
    height: int
    mime_type: str = "image/jpeg"

    @property
    def size_bytes(self) -> int:
        return len(self.image_bytes)

    def to_metadata(self) -> Dict[str, Any]:
        """Diagnostic metadata without embedding heavy image bytes"""
        return {
            "artifact_id": self.artifact_id,
            "camera_id": self.camera_id,
            "frame_sequence": self.frame_sequence,
            "captured_at": self.captured_at,
            "plate_normalized": self.plate_normalized,
            "sha256_hash": self.sha256_hash,
            "size_bytes": self.size_bytes,
            "dimensions": f"{self.width}x{self.height}",
            "mime_type": self.mime_type,
        }


@dataclass(slots=True)
class EvidenceStorageResult:
    """
    Outcome of evidence artifact upload to MinIO S3 object storage.
    Provides structured error details if storage is unavailable, preventing AI worker crashes.
    """
    success: bool
    bucket: str
    object_key: str
    storage_ref: Optional[str] = None
    sha256_hash: str = ""
    upload_latency_ms: float = 0.0
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "bucket": self.bucket,
            "object_key": self.object_key,
            "storage_ref": self.storage_ref,
            "sha256_hash": self.sha256_hash,
            "upload_latency_ms": round(self.upload_latency_ms, 2),
            "error_code": self.error_code,
            "error_message": self.error_message,
        }
