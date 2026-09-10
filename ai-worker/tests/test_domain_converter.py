"""
Unit Tests for Domain Converter and Repository Linkage (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 6.2 & backend/prisma/schema.prisma
"""

from datetime import datetime, timezone
import pytest

from app.consensus.contract import ConsensusResult, ConsensusStatus
from app.domain.converter import convert_consensus_to_domain
from app.domain.models import EvidenceRecord, VehicleRecord, VehicleSightingRecord
from app.domain.repository import InMemoryDomainRepository
from app.evidence.contract import EvidenceArtifact, EvidenceStorageResult


@pytest.fixture
def sample_accepted_consensus():
    return ConsensusResult(
        status=ConsensusStatus.ACCEPTED,
        camera_id="CAM-AHM-01",
        consensus_plate="GJ01AB1234",
        consensus_confidence=0.9125,
        consensus_of=4,
        total_window_observations=5,
        agreement_ratio=0.80,
        first_observed_ts=1725900000.0,
        last_observed_ts=1725900001.2,
        best_frame_sequence=103,
        best_frame_confidence=0.94,
    )


@pytest.fixture
def sample_artifact():
    return EvidenceArtifact(
        artifact_id="art-uuid-1111",
        camera_id="CAM-AHM-01",
        frame_sequence=103,
        captured_at=1725900001.2,
        plate_normalized="GJ01AB1234",
        image_bytes=b"JPEG_BYTES_123",
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        width=1280,
        height=720,
    )


@pytest.fixture
def sample_storage_result():
    return EvidenceStorageResult(
        success=True,
        bucket="police-evidence-vault",
        object_key="evidence/2026/09/10/CAM-AHM-01/sighting_art-uuid-1111.jpg",
        storage_ref="s3://police-evidence-vault/evidence/2026/09/10/CAM-AHM-01/sighting_art-uuid-1111.jpg",
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        upload_latency_ms=15.2,
    )


def test_accepted_consensus_converts_to_canonical_domain(
    sample_accepted_consensus, sample_artifact, sample_storage_result
):
    """Accepted consensus converts cleanly to VehicleSighting and Evidence domain records"""
    sighting, evidence = convert_consensus_to_domain(
        consensus=sample_accepted_consensus,
        evidence_artifact=sample_artifact,
        storage_result=sample_storage_result,
    )

    assert sighting is not None
    assert sighting.plate_normalized == "GJ01AB1234"
    assert sighting.camera_id == "CAM-AHM-01"
    assert sighting.confidence == pytest.approx(0.9125, 0.0001)
    assert sighting.consensus_of == 4
    assert sighting.frame_ref == sample_storage_result.storage_ref
    assert isinstance(sighting.ts, datetime)

    assert evidence is not None
    assert evidence.source_type == "SIGHTING"
    assert evidence.source_id == sighting.id
    assert evidence.storage_ref == sample_storage_result.storage_ref
    assert evidence.hash == sample_artifact.sha256_hash
    assert isinstance(evidence.captured_at, datetime)


def test_rejected_consensus_never_creates_domain_records():
    """Rejected or undecided consensus must yield (None, None) to prevent false-positive sightings"""
    rejected = ConsensusResult(
        status=ConsensusStatus.REJECTED,
        camera_id="CAM-AHM-01",
        rejection_reason="LOW_CONSENSUS_CONFIDENCE",
    )

    sighting, evidence = convert_consensus_to_domain(consensus=rejected)
    assert sighting is None
    assert evidence is None


def test_in_memory_repository_lifecycle(
    sample_accepted_consensus, sample_artifact, sample_storage_result
):
    """Test saving and retrieving canonical records in InMemoryDomainRepository"""
    repo = InMemoryDomainRepository()
    assert repo.total_sightings == 0

    sighting, evidence = convert_consensus_to_domain(
        consensus=sample_accepted_consensus,
        evidence_artifact=sample_artifact,
        storage_result=sample_storage_result,
    )

    saved = repo.save_sighting(sighting, evidence)
    assert saved is True
    assert repo.total_sightings == 1
    assert repo.total_evidence_records == 1

    # Fetch by sighting ID
    fetched_sighting = repo.get_sighting(sighting.id)
    assert fetched_sighting is not None
    assert fetched_sighting.plate_normalized == "GJ01AB1234"

    # Fetch evidence linked to sighting
    fetched_evidence = repo.get_evidence_by_sighting(sighting.id)
    assert fetched_evidence is not None
    assert fetched_evidence.id == evidence.id
    assert fetched_evidence.hash == sample_artifact.sha256_hash

    # Fetch sightings by plate
    plate_sightings = repo.get_sightings_by_plate("GJ01AB1234")
    assert len(plate_sightings) == 1
    assert plate_sightings[0].id == sighting.id

    # Clear repository
    repo.clear()
    assert repo.total_sightings == 0
    assert repo.total_evidence_records == 0


def test_storage_failure_emits_no_domain_records(
    sample_accepted_consensus, sample_artifact
):
    """
    Critical Check 2: Storage Failure Semantics
    When MinIO storage fails, do NOT emit a canonical VehicleSighting or Evidence record
    with fake/fallback URIs. Must return (None, None) to prevent false evidence claims.
    """
    failed_storage = EvidenceStorageResult(
        success=False,
        bucket="police-evidence-vault",
        object_key="evidence/2026/09/10/CAM-AHM-01/failed.jpg",
        storage_ref=None,
        sha256_hash=sample_artifact.sha256_hash,
        upload_latency_ms=5.0,
        error_code="MINIO_UNAVAILABLE",
        error_message="MinIO daemon offline",
    )

    sighting, evidence = convert_consensus_to_domain(
        consensus=sample_accepted_consensus,
        evidence_artifact=sample_artifact,
        storage_result=failed_storage,
    )

    assert sighting is None, "VehicleSighting must NOT be emitted when evidence storage failed"
    assert evidence is None, "EvidenceRecord must NOT be emitted when evidence storage failed"

