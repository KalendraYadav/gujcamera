"""
Canonical Domain Record Models (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 6.2 & backend/prisma/schema.prisma

In-memory Python representations mapping 1:1 to canonical Prisma models:
- Vehicle
- VehicleSighting
- Evidence
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


@dataclass(slots=True)
class VehicleRecord:
    """Canonical Vehicle entity (master_architecture.md Section 6.2)"""
    plate_normalized: str
    first_seen: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    attributes: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plate_normalized": self.plate_normalized,
            "first_seen": self.first_seen.isoformat(),
            "last_seen": self.last_seen.isoformat(),
            "attributes": self.attributes,
        }


@dataclass(slots=True)
class VehicleSightingRecord:
    """
    Canonical VehicleSighting event record (master_architecture.md Section 6.2).
    Represents one accepted multi-frame consensus sighting.
    """
    id: str
    plate_normalized: str
    camera_id: str
    ts: datetime
    confidence: float
    consensus_of: int
    frame_ref: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "plate_normalized": self.plate_normalized,
            "camera_id": self.camera_id,
            "ts": self.ts.isoformat(),
            "confidence": round(self.confidence, 4),
            "consensus_of": self.consensus_of,
            "frame_ref": self.frame_ref,
            "created_at": self.created_at.isoformat(),
        }


@dataclass(slots=True)
class EvidenceRecord:
    """
    Canonical Evidence record (master_architecture.md Section 6.2).
    Canonical forensic artifact linked to a VehicleSighting with SHA-256 fingerprint.
    """
    id: str
    source_type: str  # Strictly 'SIGHTING' or 'ALERT'
    source_id: str    # UUID of linked VehicleSighting
    storage_ref: str  # S3 URI: s3://police-evidence-vault/...
    hash: str         # 64-character SHA-256 hex string
    captured_at: datetime
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source_type": self.source_type,
            "source_id": self.source_id,
            "storage_ref": self.storage_ref,
            "hash": self.hash,
            "captured_at": self.captured_at.isoformat(),
            "created_at": self.created_at.isoformat(),
        }
