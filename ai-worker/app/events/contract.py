"""
Canonical Domain Event Contracts (Phase 3F)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 7.1 & Section 7.3

Defines the strongly-typed, schema-versioned event payload for vehicle.sighting_created.
Carries forensic metadata (SHA-256, MinIO storage_ref) without transmitting heavy video binaries.
"""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from typing import Any, Dict
import uuid


SCHEMA_VERSION = "1.0"
EVENT_TYPE_SIGHTING_CREATED = "vehicle.sighting_created"


@dataclass(slots=True)
class VehicleSightingCreatedEvent:
    """
    Canonical domain event emitted by AI Worker upon accepted multi-frame consensus
    and successful MinIO evidence artifact upload.
    """
    event_id: str
    event_type: str
    schema_version: str
    occurred_at: str
    producer: str
    sighting_id: str
    evidence_id: str
    camera_id: str
    plate_normalized: str
    confidence: float
    consensus_of: int
    total_observations: int
    storage_ref: str
    evidence_hash: str
    captured_at: str
    correlation_id: str

    def __post_init__(self):
        self.validate()

    def validate(self) -> None:
        """Validate invariant constraints on the event payload"""
        if self.schema_version != SCHEMA_VERSION:
            raise ValueError(
                f"Unsupported schema version '{self.schema_version}'. Expected '{SCHEMA_VERSION}'"
            )
        if self.event_type != EVENT_TYPE_SIGHTING_CREATED:
            raise ValueError(
                f"Invalid event type '{self.event_type}'. Expected '{EVENT_TYPE_SIGHTING_CREATED}'"
            )
        if not self.sighting_id:
            raise ValueError("sighting_id is required")
        if not self.evidence_id:
            raise ValueError("evidence_id is required")
        if not self.camera_id:
            raise ValueError("camera_id is required")
        if not self.plate_normalized:
            raise ValueError("plate_normalized cannot be empty")
        if not (0.0 <= self.confidence <= 1.0):
            raise ValueError(f"confidence must be between 0.0 and 1.0, got {self.confidence}")
        if self.consensus_of < 1 or self.total_observations < 1:
            raise ValueError("consensus counts must be at least 1")
        if not self.storage_ref or not (self.storage_ref.startswith("s3://") or self.storage_ref.startswith("urn:")):
            raise ValueError(f"Invalid evidence storage reference: '{self.storage_ref}'")
        if not self.evidence_hash or len(self.evidence_hash) != 64:
            raise ValueError(
                f"evidence_hash must be a 64-character SHA-256 hexadecimal string, got '{self.evidence_hash}'"
            )

    def to_dict(self) -> Dict[str, Any]:
        """Convert event to serializable dictionary"""
        return asdict(self)

    def to_json(self) -> str:
        """Serialize event to compact JSON string"""
        return json.dumps(self.to_dict(), separators=(",", ":"))

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VehicleSightingCreatedEvent":
        """Deserialize and validate event from dictionary"""
        return cls(
            event_id=str(data.get("event_id", "")),
            event_type=str(data.get("event_type", "")),
            schema_version=str(data.get("schema_version", "")),
            occurred_at=str(data.get("occurred_at", "")),
            producer=str(data.get("producer", "ai-worker")),
            sighting_id=str(data.get("sighting_id", "")),
            evidence_id=str(data.get("evidence_id", "")),
            camera_id=str(data.get("camera_id", "")),
            plate_normalized=str(data.get("plate_normalized", "")),
            confidence=float(data.get("confidence", 0.0)),
            consensus_of=int(data.get("consensus_of", 1)),
            total_observations=int(data.get("total_observations", 1)),
            storage_ref=str(data.get("storage_ref", "")),
            evidence_hash=str(data.get("evidence_hash", "")),
            captured_at=str(data.get("captured_at", "")),
            correlation_id=str(data.get("correlation_id", "")),
        )

    @classmethod
    def from_json(cls, json_str: str) -> "VehicleSightingCreatedEvent":
        """Deserialize and validate event from JSON string"""
        data = json.loads(json_str)
        return cls.from_dict(data)

    @classmethod
    def create(
        cls,
        sighting_id: str,
        evidence_id: str,
        camera_id: str,
        plate_normalized: str,
        confidence: float,
        consensus_of: int,
        total_observations: int,
        storage_ref: str,
        evidence_hash: str,
        captured_at_ts: float,
        correlation_id: str = "",
        event_id: str = "",
    ) -> "VehicleSightingCreatedEvent":
        """Convenience constructor with automatic UTC ISO timestamps and UUIDs"""
        now_iso = datetime.now(timezone.utc).isoformat()
        captured_iso = datetime.fromtimestamp(captured_at_ts, tz=timezone.utc).isoformat()

        return cls(
            event_id=event_id if event_id else str(uuid.uuid4()),
            event_type=EVENT_TYPE_SIGHTING_CREATED,
            schema_version=SCHEMA_VERSION,
            occurred_at=now_iso,
            producer="ai-worker",
            sighting_id=sighting_id,
            evidence_id=evidence_id,
            camera_id=camera_id,
            plate_normalized=plate_normalized,
            confidence=round(confidence, 4),
            consensus_of=consensus_of,
            total_observations=total_observations,
            storage_ref=storage_ref,
            evidence_hash=evidence_hash.lower(),
            captured_at=captured_iso,
            correlation_id=correlation_id if correlation_id else str(uuid.uuid4()),
        )
