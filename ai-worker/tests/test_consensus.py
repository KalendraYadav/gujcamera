"""
Unit Tests for Multi-Frame License Plate Consensus Aggregator (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
"""

import time
import numpy as np
import pytest

from app.consensus.contract import (
    ConsensusResult,
    ConsensusStatus,
    PlateObservation,
    RejectionReason,
)
from app.consensus.aggregator import MultiFrameConsensusAggregator


@pytest.fixture
def aggregator():
    """Default aggregator with window_size=5, min_observations=3, min_confidence=0.60, min_agreement_ratio=0.60"""
    return MultiFrameConsensusAggregator(
        window_size=5,
        min_observations=3,
        min_confidence=0.60,
        min_agreement_ratio=0.60,
        max_window_seconds=3.0,
    )


def test_repeated_identical_plate_observations(aggregator):
    """5 consecutive identical reads should be accepted with 100% agreement"""
    t0 = time.time()
    frames = [np.full((100, 200, 3), i * 40, dtype=np.uint8) for i in range(5)]

    results = []
    for i in range(5):
        obs = PlateObservation(
            camera_id="CAM-AHM-01",
            frame_sequence=100 + i,
            timestamp=t0 + (i * 0.33),
            raw_text="GJ01AB1234",
            normalized_text="GJ01AB1234",
            confidence=0.85 + (i * 0.02),
            frame=frames[i],
        )
        res = aggregator.add_observation(obs)
        if res:
            results.append(res)

    assert len(results) == 1
    consensus = results[0]
    assert consensus.status == ConsensusStatus.ACCEPTED
    assert consensus.consensus_plate == "GJ01AB1234"
    assert consensus.consensus_of == 5
    assert consensus.total_window_observations == 5
    assert consensus.agreement_ratio == 1.0
    assert consensus.consensus_confidence >= 0.85
    assert consensus.rejection_reason is None
    # Highest confidence frame was frame 4 (0.93)
    assert consensus.best_frame_sequence == 104
    assert np.array_equal(consensus.best_frame, frames[4])


def test_noisy_read_with_majority_accepted(aggregator):
    """4 correct reads and 1 noisy read (80% agreement) should accept majority plate"""
    t0 = time.time()
    reads = [
        ("GJ01AB1234", 0.88),
        ("GJ01AB1234", 0.90),
        ("GJ01AB1284", 0.65),  # Misread 3 -> 8
        ("GJ01AB1234", 0.92),
        ("GJ01AB1234", 0.85),
    ]

    result = None
    for i, (text, conf) in enumerate(reads):
        obs = PlateObservation(
            camera_id="CAM-AHM-01",
            frame_sequence=200 + i,
            timestamp=t0 + (i * 0.3),
            raw_text=text,
            normalized_text=text,
            confidence=conf,
            frame=np.zeros((50, 100, 3), dtype=np.uint8),
        )
        res = aggregator.add_observation(obs)
        if res:
            result = res

    assert result is not None
    assert result.status == ConsensusStatus.ACCEPTED
    assert result.consensus_plate == "GJ01AB1234"
    assert result.consensus_of == 4
    assert result.total_window_observations == 5
    assert result.agreement_ratio == 0.80
    assert result.best_frame_sequence == 203  # Highest confidence 0.92


def test_conflicting_split_votes_rejected(aggregator):
    """Equal votes for competing plates with no majority must be rejected"""
    t0 = time.time()
    # 2x Plate A, 2x Plate B (with identical scores)
    reads = [
        ("GJ01AB1234", 0.80),
        ("GJ01AB1234", 0.80),
        ("MH12CD5678", 0.80),
        ("MH12CD5678", 0.80),
    ]

    for i, (text, conf) in enumerate(reads):
        obs = PlateObservation(
            camera_id="CAM-AHM-01",
            frame_sequence=300 + i,
            timestamp=t0 + (i * 0.3),
            raw_text=text,
            normalized_text=text,
            confidence=conf,
        )
        aggregator.add_observation(obs)

    # Force evaluation of 4-frame buffer
    result = aggregator.force_evaluate("CAM-AHM-01")
    assert result.status == ConsensusStatus.REJECTED
    assert result.rejection_reason == RejectionReason.SPLIT_VOTE_NO_MAJORITY.value
    assert result.is_accepted is False


def test_insufficient_observation_count_rejected(aggregator):
    """Only 1 or 2 observations in a window must be rejected (min_observations=3)"""
    t0 = time.time()
    obs1 = PlateObservation(
        camera_id="CAM-AHM-01",
        frame_sequence=401,
        timestamp=t0,
        raw_text="GJ01AB1234",
        normalized_text="GJ01AB1234",
        confidence=0.95,
    )
    obs2 = PlateObservation(
        camera_id="CAM-AHM-01",
        frame_sequence=402,
        timestamp=t0 + 0.3,
        raw_text="GJ01AB1234",
        normalized_text="GJ01AB1234",
        confidence=0.92,
    )

    aggregator.add_observation(obs1)
    aggregator.add_observation(obs2)

    result = aggregator.force_evaluate("CAM-AHM-01")
    assert result.status == ConsensusStatus.REJECTED
    assert result.rejection_reason == RejectionReason.INSUFFICIENT_OBSERVATIONS.value
    assert result.total_window_observations == 2
    assert result.is_accepted is False


def test_low_confidence_observations_rejected(aggregator):
    """Average confidence below min_confidence (0.60) must be rejected"""
    t0 = time.time()
    # 5 observations agreeing on plate, but all with low confidence (~0.45)
    for i in range(5):
        obs = PlateObservation(
            camera_id="CAM-AHM-01",
            frame_sequence=500 + i,
            timestamp=t0 + (i * 0.3),
            raw_text="GJ01AB1234",
            normalized_text="GJ01AB1234",
            confidence=0.45,
        )
        res = aggregator.add_observation(obs)
        if res:
            result = res

    assert result is not None
    assert result.status == ConsensusStatus.REJECTED
    assert result.rejection_reason == RejectionReason.LOW_CONSENSUS_CONFIDENCE.value
    assert result.consensus_confidence == pytest.approx(0.45, 0.01)
    assert result.is_accepted is False


def test_normalization_integration_during_consensus(aggregator):
    """Spaces, hyphens, lowercase, and HSRP 'IND' prefix are standardized prior to voting"""
    t0 = time.time()
    reads = [
        ("gj 01 ab 1234", 0.85),
        ("GJ-01-AB-1234", 0.88),
        ("ind GJ01AB1234", 0.90),
        ("GJ01AB1234", 0.92),
        ("GJ 01-AB 1234", 0.86),
    ]

    result = None
    for i, (text, conf) in enumerate(reads):
        obs = PlateObservation(
            camera_id="CAM-AHM-01",
            frame_sequence=600 + i,
            timestamp=t0 + (i * 0.3),
            raw_text=text,
            normalized_text=text,
            confidence=conf,
        )
        res = aggregator.add_observation(obs)
        if res:
            result = res

    assert result is not None
    assert result.status == ConsensusStatus.ACCEPTED
    assert result.consensus_plate == "GJ01AB1234"
    assert result.consensus_of == 5
    assert result.agreement_ratio == 1.0


def test_no_silent_character_morphing(aggregator):
    """Conservative policy: ambiguous glyphs (O, I, Z, B) must not be silently morphed"""
    t0 = time.time()
    # If OCR literally read 'GJ0IAB1234' (with letter I instead of 1)
    obs = PlateObservation(
        camera_id="CAM-AHM-01",
        frame_sequence=701,
        timestamp=t0,
        raw_text="GJ0IAB1234",
        normalized_text="GJ0IAB1234",
        confidence=0.85,
    )
    aggregator.add_observation(obs)
    # The normalized text must preserve 'I' exactly without silent morphing
    assert obs.normalized_text == "GJ0IAB1234"


def test_window_temporal_expiration(aggregator):
    """Observations separated by more than max_window_seconds (3.0s) trigger buffer reset"""
    t0 = 1000.0

    # Observation at t = 1000.0s
    obs1 = PlateObservation(
        camera_id="CAM-AHM-01",
        frame_sequence=801,
        timestamp=t0,
        raw_text="GJ01AB1234",
        normalized_text="GJ01AB1234",
        confidence=0.90,
    )
    aggregator.add_observation(obs1)
    assert aggregator.get_window_depth("CAM-AHM-01") == 1

    # Observation at t = 1004.0s (4.0s later -> exceeds 3.0s window)
    obs2 = PlateObservation(
        camera_id="CAM-AHM-01",
        frame_sequence=802,
        timestamp=t0 + 4.0,
        raw_text="GJ01AB1234",
        normalized_text="GJ01AB1234",
        confidence=0.90,
    )
    res = aggregator.add_observation(obs2)

    # Window was purged because 1 observation is insufficient to accept
    # Now only obs2 should be in the new window
    assert aggregator.get_window_depth("CAM-AHM-01") == 1


def test_minimum_accepted_boundary_case(aggregator):
    """Case C: 3 correct + 2 incorrect in 5-frame window (exact 60% agreement boundary)"""
    t0 = time.time()
    reads = [
        ("GJ01AB1234", 0.85),
        ("GJ01AB1234", 0.90),
        ("DL01XY9999", 0.70),
        ("GJ01AB1234", 0.88),
        ("MH12CD5678", 0.65),
    ]

    result = None
    for i, (text, conf) in enumerate(reads):
        obs = PlateObservation(
            camera_id="CAM-AHM-01",
            frame_sequence=900 + i,
            timestamp=t0 + (i * 0.3),
            raw_text=text,
            normalized_text=text,
            confidence=conf,
        )
        res = aggregator.add_observation(obs)
        if res:
            result = res

    assert result is not None
    assert result.status == ConsensusStatus.ACCEPTED
    assert result.consensus_plate == "GJ01AB1234"
    assert result.consensus_of == 3
    assert result.total_window_observations == 5
    assert result.agreement_ratio == pytest.approx(0.60, 0.01)


def test_five_unique_plates_rejected(aggregator):
    """Case E: 5 completely different plates (each 1 vote = 20% agreement) must be rejected"""
    t0 = time.time()
    reads = [
        ("GJ01AB1111", 0.85),
        ("GJ01AB2222", 0.85),
        ("GJ01AB3333", 0.85),
        ("GJ01AB4444", 0.85),
        ("GJ01AB5555", 0.85),
    ]

    result = None
    for i, (text, conf) in enumerate(reads):
        obs = PlateObservation(
            camera_id="CAM-AHM-01",
            frame_sequence=1000 + i,
            timestamp=t0 + (i * 0.3),
            raw_text=text,
            normalized_text=text,
            confidence=conf,
        )
        res = aggregator.add_observation(obs)
        if res:
            result = res

    assert result is not None
    assert result.status == ConsensusStatus.REJECTED
    assert result.rejection_reason in (
        RejectionReason.BELOW_AGREEMENT_THRESHOLD.value,
        RejectionReason.SPLIT_VOTE_NO_MAJORITY.value,
    )
    assert result.is_accepted is False


def test_high_confidence_minority_vs_low_confidence_majority(aggregator):
    """
    Case G: 2 x correct @ 0.99 vs 3 x wrong @ 0.40.
    Weighted score of correct plate is higher (1.98 > 1.20), but agreement ratio is 2/5 = 40% (<60%).
    The algorithm must reject with BELOW_AGREEMENT_THRESHOLD rather than falsely accepting.
    """
    t0 = time.time()
    reads = [
        ("GJ01CORRECT", 0.99),
        ("GJ01WRONG01", 0.40),
        ("GJ01CORRECT", 0.99),
        ("GJ01WRONG01", 0.40),
        ("GJ01WRONG01", 0.40),
    ]

    result = None
    for i, (text, conf) in enumerate(reads):
        obs = PlateObservation(
            camera_id="CAM-AHM-01",
            frame_sequence=1100 + i,
            timestamp=t0 + (i * 0.3),
            raw_text=text,
            normalized_text=text,
            confidence=conf,
        )
        res = aggregator.add_observation(obs)
        if res:
            result = res

    assert result is not None
    # Winning candidate by weighted score is GJ01CORRECT (score 1.98 vs 1.20)
    assert result.consensus_plate == "GJ01CORRECT"
    # But count is only 2 out of 5 (40% < 60% min_agreement_ratio) -> REJECTED!
    assert result.status == ConsensusStatus.REJECTED
    assert result.rejection_reason == RejectionReason.BELOW_AGREEMENT_THRESHOLD.value
    assert result.is_accepted is False


def test_consensus_determinism():
    """Case J: Same ordered observations must always produce the identical ConsensusResult"""
    t0 = 1725900000.0
    reads = [
        ("GJ01AB1234", 0.75),
        ("GJ01AB1234", 0.85),
        ("GJ01AB9999", 0.60),
        ("GJ01AB1234", 0.92),
        ("GJ01AB1234", 0.88),
    ]

    def run_sequence():
        agg = MultiFrameConsensusAggregator(window_size=5, min_observations=3)
        res = None
        for i, (text, conf) in enumerate(reads):
            obs = PlateObservation(
                camera_id="CAM-AHM-01",
                frame_sequence=1200 + i,
                timestamp=t0 + (i * 0.3),
                raw_text=text,
                normalized_text=text,
                confidence=conf,
            )
            r = agg.add_observation(obs)
            if r:
                res = r
        return res

    run1 = run_sequence()
    run2 = run_sequence()

    assert run1 is not None and run2 is not None
    assert run1.status == run2.status
    assert run1.consensus_plate == run2.consensus_plate
    assert run1.consensus_confidence == run2.consensus_confidence
    assert run1.consensus_of == run2.consensus_of
    assert run1.agreement_ratio == run2.agreement_ratio
    assert run1.rejection_reason == run2.rejection_reason
    assert run1.to_dict() == run2.to_dict()


def test_aggregator_window_size_bounds_enforcement():
    """
    Critical Check 1 & 11:
    Aggregator rejects window_size < 5 or > 8 with ValueError.
    Allows window_size 5 and 8. Default is 5.
    """
    agg_def = MultiFrameConsensusAggregator()
    assert agg_def.window_size == 5

    agg5 = MultiFrameConsensusAggregator(window_size=5)
    assert agg5.window_size == 5

    agg8 = MultiFrameConsensusAggregator(window_size=8)
    assert agg8.window_size == 8

    with pytest.raises(ValueError) as exc4:
        MultiFrameConsensusAggregator(window_size=4)
    assert "between 5 and 8" in str(exc4.value)

    with pytest.raises(ValueError) as exc9:
        MultiFrameConsensusAggregator(window_size=9)
    assert "between 5 and 8" in str(exc9.value)

