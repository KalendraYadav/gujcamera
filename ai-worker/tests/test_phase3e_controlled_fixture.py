"""
Controlled Fixture Test for Phase 3E Multi-Frame Consensus and Evidence Pipeline
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026

CONTROLLED TEST FIXTURE DISCLAIMER:
This test fixture uses synthetic in-memory frames and controlled OCR observation inputs
to validate multi-frame consensus, evidence snapshot encoding, SHA-256 integrity hashing,
and canonical domain linkage.
Current Phase 3A CCTV video feeds are synthetic countdown test patterns containing zero
genuine vehicles or license plates; therefore, this test DOES NOT represent or establish
real-world Gujarat Police CCTV ANPR accuracy or detection rates.
"""

from datetime import datetime, timezone
import hashlib
import time
from unittest.mock import MagicMock
import numpy as np
import pytest

from app.consensus.contract import ConsensusStatus
from app.consensus.aggregator import MultiFrameConsensusAggregator
from app.domain import InMemoryDomainRepository, convert_consensus_to_domain
from app.evidence import (
    EvidenceSnapshotGenerator,
    MinioEvidenceVault,
    compute_sha256,
    verify_sha256,
)


def create_synthetic_frame(color_val: int) -> np.ndarray:
    """Create controlled 640x360 synthetic frame matrix with known color pattern"""
    frame = np.full((360, 640, 3), color_val, dtype=np.uint8)
    # Add simple geometric gradient pattern to simulate video variation
    frame[50:100, 100:300, :] = 255
    return frame


def test_controlled_phase3e_multi_frame_consensus_and_evidence():
    """
    Controlled Pipeline Verification exercising:
    1. Multi-frame OCR observation feeding across 5 synthetic frames
    2. Deterministic normalization and confidence-weighted majority consensus
    3. Selection of best observation frame based on highest confidence
    4. Deterministic JPEG snapshot encoding
    5. SHA-256 byte-level integrity fingerprint calculation
    6. Simulated MinIO vault upload with metadata preservation
    7. Canonical VehicleSighting and Evidence domain record creation
    """
    camera_id = "CAM-AHM-CONTROLLED-01"
    start_time = 1725900000.0

    # Initialize Phase 3E components
    aggregator = MultiFrameConsensusAggregator(
        window_size=5,
        min_observations=3,
        min_confidence=0.60,
        min_agreement_ratio=0.60,
        max_window_seconds=3.0,
    )
    snapshot_gen = EvidenceSnapshotGenerator(jpeg_quality=90)
    repository = InMemoryDomainRepository()

    # Mock MinIO Vault for controlled environment
    vault = MinioEvidenceVault(endpoint="localhost:9000", bucket_name="police-evidence-vault")
    mock_s3 = MagicMock()
    mock_s3.bucket_exists.return_value = True
    vault._client = mock_s3
    vault._bucket_verified = True

    # 5 controlled test frame observations from prompt specification
    test_sequence = [
        {"raw": "GJ 01 AB 1234", "conf": 0.71, "seq": 1, "color": 50},
        {"raw": "GJ01AB1234",    "conf": 0.84, "seq": 2, "color": 80},
        {"raw": "GJ01AB1284",    "conf": 0.63, "seq": 3, "color": 110},  # Noisy read (3 -> 8)
        {"raw": "GJ01AB1234",    "conf": 0.91, "seq": 4, "color": 140},  # Highest confidence
        {"raw": "GJ-01-AB-1234", "conf": 0.88, "seq": 5, "color": 170},
    ]

    consensus_outcome = None

    for item in test_sequence:
        frame_matrix = create_synthetic_frame(item["color"])
        from app.consensus.contract import PlateObservation
        obs = PlateObservation(
            camera_id=camera_id,
            frame_sequence=item["seq"],
            timestamp=start_time + (item["seq"] * 0.33),
            raw_text=item["raw"],
            normalized_text="",  # Will be cleaned deterministically
            confidence=item["conf"],
            frame=frame_matrix,
        )

        res = aggregator.add_observation(obs)
        if res is not None:
            consensus_outcome = res

    # 1. Verify Consensus
    assert consensus_outcome is not None, "Consensus evaluation did not trigger on 5th frame"
    assert consensus_outcome.status == ConsensusStatus.ACCEPTED
    assert consensus_outcome.consensus_plate == "GJ01AB1234"
    assert consensus_outcome.consensus_of == 4  # 4 out of 5 frames supported GJ01AB1234
    assert consensus_outcome.total_window_observations == 5
    assert consensus_outcome.agreement_ratio == 0.80  # 4/5 = 80%

    # Weighted confidence calculation check:
    # Supporting confidences: 0.71 + 0.84 + 0.91 + 0.88 = 3.34 / 4 = 0.835
    assert consensus_outcome.consensus_confidence == pytest.approx(0.835, 0.001)

    # 2. Verify Evidence Frame Selection
    # Highest confidence read for winning plate was Frame 4 (conf 0.91)
    assert consensus_outcome.best_frame_sequence == 4
    assert consensus_outcome.best_frame_confidence == pytest.approx(0.91, 0.001)
    assert consensus_outcome.best_frame is not None

    # 3. Verify Evidence Snapshot Generation & SHA-256 Hashing
    artifact = snapshot_gen.create_snapshot(
        frame=consensus_outcome.best_frame,
        camera_id=camera_id,
        frame_sequence=consensus_outcome.best_frame_sequence,
        captured_at=consensus_outcome.last_observed_ts,
        plate_normalized=consensus_outcome.consensus_plate,
    )
    assert artifact is not None
    assert artifact.size_bytes > 0
    assert len(artifact.sha256_hash) == 64

    # Verify SHA-256 integrity fingerprint is exact
    expected_hash = hashlib.sha256(artifact.image_bytes).hexdigest()
    assert artifact.sha256_hash == expected_hash
    assert verify_sha256(artifact.image_bytes, artifact.sha256_hash) is True

    # 4. Verify MinIO Vault Upload
    storage_res = vault.store_artifact(artifact)
    assert storage_res.success is True
    assert storage_res.storage_ref.startswith("s3://police-evidence-vault/evidence/")
    assert storage_res.sha256_hash == artifact.sha256_hash

    # Verify S3 call was made with forensic metadata
    mock_s3.put_object.assert_called_once()
    meta = mock_s3.put_object.call_args[1]["metadata"]
    assert meta["x-amz-meta-sha256"] == artifact.sha256_hash
    assert "x-amz-meta-plate-normalized" not in meta
    assert meta["x-amz-meta-camera-id"] == camera_id

    # 5. Verify Canonical Domain Record Linkage
    sighting_rec, evidence_rec = convert_consensus_to_domain(
        consensus=consensus_outcome,
        evidence_artifact=artifact,
        storage_result=storage_res,
    )
    assert sighting_rec is not None
    assert sighting_rec.plate_normalized == "GJ01AB1234"
    assert sighting_rec.camera_id == camera_id
    assert sighting_rec.consensus_of == 4
    assert sighting_rec.confidence == pytest.approx(0.835, 0.001)
    assert sighting_rec.frame_ref == storage_res.storage_ref

    assert evidence_rec is not None
    assert evidence_rec.source_type == "SIGHTING"
    assert evidence_rec.source_id == sighting_rec.id
    assert evidence_rec.storage_ref == storage_res.storage_ref
    assert evidence_rec.hash == artifact.sha256_hash

    # 6. Verify Persistence in Domain Repository
    saved = repository.save_sighting(sighting_rec, evidence_rec)
    assert saved is True
    assert repository.total_sightings == 1
    assert repository.total_evidence_records == 1

    stored_sighting = repository.get_sighting(sighting_rec.id)
    assert stored_sighting.plate_normalized == "GJ01AB1234"

    stored_evidence = repository.get_evidence_by_sighting(sighting_rec.id)
    assert stored_evidence.hash == artifact.sha256_hash
