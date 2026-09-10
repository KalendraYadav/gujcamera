"""
Domain Record Converter (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 6.2 & Section 11

Converts in-memory consensus outcomes and evidence storage results into canonical domain entities.
Enforces that rejected or undecided consensus NEVER produces a false-positive database record.
"""

from datetime import datetime, timezone
import logging
from typing import Optional, Tuple
import uuid

from app.consensus.contract import ConsensusResult, ConsensusStatus
from app.domain.models import EvidenceRecord, VehicleRecord, VehicleSightingRecord
from app.evidence.contract import EvidenceArtifact, EvidenceStorageResult

logger = logging.getLogger("ai_worker.domain")


def convert_consensus_to_domain(
    consensus: ConsensusResult,
    evidence_artifact: Optional[EvidenceArtifact] = None,
    storage_result: Optional[EvidenceStorageResult] = None,
    sighting_id: Optional[str] = None,
    evidence_id: Optional[str] = None,
) -> Tuple[Optional[VehicleSightingRecord], Optional[EvidenceRecord]]:
    """
    Convert an accepted multi-frame consensus result and evidence artifact
    into canonical VehicleSighting and Evidence domain records.

    Args:
        consensus: ConsensusResult from multi-frame consensus evaluation.
        evidence_artifact: Optional generated EvidenceArtifact.
        storage_result: Optional EvidenceStorageResult from MinIO upload.
        sighting_id: Optional pre-allocated UUID for the sighting.
        evidence_id: Optional pre-allocated UUID for the evidence record.

    Returns:
        Tuple of (VehicleSightingRecord, EvidenceRecord) if consensus is ACCEPTED,
        or (None, None) if consensus was REJECTED, UNDECIDED, or invalid.
    """
    if consensus is None or not consensus.is_accepted or not consensus.consensus_plate:
        logger.debug(
            "[%s] Cannot convert to domain records: consensus is not accepted (status: %s, reason: %s)",
            getattr(consensus, "camera_id", "UNKNOWN"),
            getattr(consensus, "status", None),
            getattr(consensus, "rejection_reason", None),
        )
        return None, None

    # Generate or reuse sighting UUID
    actual_sighting_id = sighting_id if sighting_id else str(uuid.uuid4())
    sighting_ts = datetime.fromtimestamp(
        consensus.last_observed_ts if consensus.last_observed_ts > 0 else consensus.first_observed_ts,
        tz=timezone.utc,
    )

    # Determine frame_ref and EvidenceRecord creation based on storage outcome
    frame_ref = ""
    evidence_record = None

    if storage_result is not None:
        if not storage_result.success or not storage_result.storage_ref:
            # Storage failed explicitly: do NOT create a canonical VehicleSighting or Evidence record
            # with fake/fallback URIs. Both must be None to prevent false evidence success.
            logger.warning(
                "[%s] Evidence upload failed (%s: %s). Sighting record NOT emitted because evidence artifact is missing.",
                consensus.camera_id,
                storage_result.error_code,
                storage_result.error_message,
            )
            return None, None

        frame_ref = storage_result.storage_ref
        if evidence_artifact:
            actual_evidence_id = evidence_id if evidence_id else str(uuid.uuid4())
            captured_dt = datetime.fromtimestamp(evidence_artifact.captured_at, tz=timezone.utc)
            evidence_record = EvidenceRecord(
                id=actual_evidence_id,
                source_type="SIGHTING",
                source_id=actual_sighting_id,
                storage_ref=frame_ref,
                hash=evidence_artifact.sha256_hash,
                captured_at=captured_dt,
            )
    elif evidence_artifact is not None:
        # In-memory artifact available without storage upload (e.g., local tests)
        frame_ref = f"urn:evidence:artifact:{evidence_artifact.artifact_id}"
        actual_evidence_id = evidence_id if evidence_id else str(uuid.uuid4())
        captured_dt = datetime.fromtimestamp(evidence_artifact.captured_at, tz=timezone.utc)
        evidence_record = EvidenceRecord(
            id=actual_evidence_id,
            source_type="SIGHTING",
            source_id=actual_sighting_id,
            storage_ref=frame_ref,
            hash=evidence_artifact.sha256_hash,
            captured_at=captured_dt,
        )

    # Build canonical VehicleSightingRecord
    sighting_record = VehicleSightingRecord(
        id=actual_sighting_id,
        plate_normalized=consensus.consensus_plate,
        camera_id=consensus.camera_id,
        ts=sighting_ts,
        confidence=float(consensus.consensus_confidence),
        consensus_of=int(consensus.consensus_of),
        frame_ref=frame_ref,
    )

    return sighting_record, evidence_record
