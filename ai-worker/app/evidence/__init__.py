"""
Evidence Management and Storage Package (Phase 3E)
"""

from app.evidence.contract import (
    EvidenceArtifact,
    EvidenceStorageErrorCode,
    EvidenceStorageResult,
)
from app.evidence.hasher import compute_sha256, verify_sha256
from app.evidence.snapshot_generator import EvidenceSnapshotGenerator
from app.evidence.storage import MinioEvidenceVault

__all__ = [
    "EvidenceArtifact",
    "EvidenceStorageErrorCode",
    "EvidenceStorageResult",
    "compute_sha256",
    "verify_sha256",
    "EvidenceSnapshotGenerator",
    "MinioEvidenceVault",
]
