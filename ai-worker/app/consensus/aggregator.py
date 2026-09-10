"""
Multi-Frame License Plate Consensus Aggregator (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 9.1 & Section 24

Temporal observation window aggregation with confidence-weighted voting.
Deterministic, conservative, explainable, and configurable.
"""

from collections import defaultdict
import logging
import threading
from typing import Dict, List, Optional, Tuple
import numpy as np

from app.consensus.contract import (
    ConsensusResult,
    ConsensusStatus,
    PlateObservation,
    RejectionReason,
)
from app.ocr.normalizer import is_valid_indian_plate_format, normalize_license_plate

logger = logging.getLogger("ai_worker.consensus")


class MultiFrameConsensusAggregator:
    """
    Maintains sliding temporal windows of plate observations per camera stream.
    Aggregates repeated observations using confidence-weighted voting and enforces
    strict conservative acceptance thresholds.
    """

    def __init__(
        self,
        window_size: int = 5,
        min_observations: int = 3,
        min_confidence: float = 0.60,
        min_agreement_ratio: float = 0.60,
        max_window_seconds: float = 3.0,
    ):
        """
        Args:
            window_size: Maximum observations retained in active window (default: 5 frames).
            min_observations: Minimum valid observations required to form consensus (default: 3).
            min_confidence: Minimum weighted confidence score required for acceptance (default: 0.60).
            min_agreement_ratio: Minimum ratio of window agreeing on winning plate (default: 0.60).
            max_window_seconds: Maximum span between oldest and newest observation before reset (default: 3.0s).
        """
        if window_size < 5 or window_size > 8:
            raise ValueError(
                f"CONSENSUS_WINDOW_SIZE must be between 5 and 8 frames (inclusive), got {window_size}"
            )
        self.window_size = int(window_size)
        self.min_observations = max(1, min_observations)
        self.min_confidence = float(min_confidence)
        self.min_agreement_ratio = float(min_agreement_ratio)
        self.max_window_seconds = float(max_window_seconds)

        # Thread-safe observation buffers keyed by camera_id
        self._lock = threading.Lock()
        self._windows: Dict[str, List[PlateObservation]] = defaultdict(list)

    def add_observation(self, obs: PlateObservation) -> Optional[ConsensusResult]:
        """
        Ingest a new plate observation into the camera's sliding window.
        If the window reaches capacity (window_size) or times out, evaluates consensus.

        Args:
            obs: Validated PlateObservation with normalized text and confidence.

        Returns:
            ConsensusResult if the window evaluated, or None if still accumulating.
        """
        if obs is None:
            return None

        # Clean plate text defensively
        normalized = normalize_license_plate(obs.normalized_text or obs.raw_text)
        if not normalized:
            logger.debug("[%s] Dropping empty plate observation in frame #%d", obs.camera_id, obs.frame_sequence)
            return None

        # Ensure observation has clean normalized text
        obs.normalized_text = normalized
        obs.format_valid = is_valid_indian_plate_format(normalized)

        with self._lock:
            buffer = self._windows[obs.camera_id]

            # Check temporal window expiration
            if buffer and (obs.timestamp - buffer[0].timestamp > self.max_window_seconds):
                logger.debug(
                    "[%s] Window expired (span %.2fs > %.2fs). Evaluating buffer before purge.",
                    obs.camera_id,
                    obs.timestamp - buffer[0].timestamp,
                    self.max_window_seconds,
                )
                # Evaluate existing buffer before resetting
                expired_res = self._evaluate_buffer_unlocked(obs.camera_id, buffer)
                self._windows[obs.camera_id] = [obs]
                if expired_res.is_accepted:
                    return expired_res

            # Append current observation
            buffer.append(obs)

            # Once window reaches the target window_size, evaluate consensus
            if len(buffer) >= self.window_size:
                result = self._evaluate_buffer_unlocked(obs.camera_id, buffer)
                # Clear buffer after complete window evaluation
                self._windows[obs.camera_id] = []
                return result

        return None

    def force_evaluate(self, camera_id: str) -> ConsensusResult:
        """
        Force evaluation of the current observation window for a camera (e.g. on stream close).
        """
        with self._lock:
            buffer = self._windows.get(camera_id, [])
            result = self._evaluate_buffer_unlocked(camera_id, buffer)
            self._windows[camera_id] = []
            return result

    def get_window_depth(self, camera_id: str) -> int:
        """Return count of current observations pending in the window"""
        with self._lock:
            return len(self._windows.get(camera_id, []))

    def reset(self, camera_id: Optional[str] = None) -> None:
        """Clear observation buffer for a specific camera or all cameras"""
        with self._lock:
            if camera_id:
                self._windows.pop(camera_id, None)
            else:
                self._windows.clear()

    def _evaluate_buffer_unlocked(
        self, camera_id: str, buffer: List[PlateObservation]
    ) -> ConsensusResult:
        """
        Internal deterministic evaluation of an observation buffer.
        Caller must hold self._lock.
        """
        if not buffer:
            return ConsensusResult(
                status=ConsensusStatus.UNDECIDED,
                camera_id=camera_id,
                rejection_reason=RejectionReason.EMPTY_WINDOW.value,
            )

        total_obs = len(buffer)
        first_ts = buffer[0].timestamp
        last_ts = buffer[-1].timestamp
        obs_summaries = [obs.to_summary() for obs in buffer]

        # Rule 1: Minimum Observations Threshold
        if total_obs < self.min_observations:
            return ConsensusResult(
                status=ConsensusStatus.REJECTED,
                camera_id=camera_id,
                total_window_observations=total_obs,
                first_observed_ts=first_ts,
                last_observed_ts=last_ts,
                rejection_reason=RejectionReason.INSUFFICIENT_OBSERVATIONS.value,
                contributing_observations=obs_summaries,
            )

        # Aggregate weighted votes and counts per normalized plate string
        plate_weighted_scores: Dict[str, float] = defaultdict(float)
        plate_counts: Dict[str, int] = defaultdict(int)
        plate_observations: Dict[str, List[PlateObservation]] = defaultdict(list)

        for obs in buffer:
            p = obs.normalized_text
            weight = max(0.01, float(obs.confidence))
            plate_weighted_scores[p] += weight
            plate_counts[p] += 1
            plate_observations[p].append(obs)

        # Determine winning candidate plate
        # Sort candidates primarily by weighted score descending, secondarily by count descending
        sorted_candidates = sorted(
            plate_weighted_scores.items(),
            key=lambda item: (item[1], plate_counts[item[0]]),
            reverse=True,
        )

        winning_plate, winning_weighted_score = sorted_candidates[0]
        winning_count = plate_counts[winning_plate]
        agreement_ratio = winning_count / total_obs
        consensus_confidence = winning_weighted_score / winning_count

        # Check for split vote / tie condition
        if len(sorted_candidates) > 1:
            second_plate, second_score = sorted_candidates[1]
            second_count = plate_counts[second_plate]
            if (
                winning_weighted_score == second_score
                and winning_count == second_count
            ):
                return ConsensusResult(
                    status=ConsensusStatus.REJECTED,
                    camera_id=camera_id,
                    total_window_observations=total_obs,
                    first_observed_ts=first_ts,
                    last_observed_ts=last_ts,
                    rejection_reason=RejectionReason.SPLIT_VOTE_NO_MAJORITY.value,
                    contributing_observations=obs_summaries,
                )

        # Rule 2: Minimum Winning Agreement Ratio
        if agreement_ratio < self.min_agreement_ratio:
            return ConsensusResult(
                status=ConsensusStatus.REJECTED,
                camera_id=camera_id,
                consensus_plate=winning_plate,
                consensus_confidence=consensus_confidence,
                consensus_of=winning_count,
                total_window_observations=total_obs,
                agreement_ratio=agreement_ratio,
                first_observed_ts=first_ts,
                last_observed_ts=last_ts,
                rejection_reason=RejectionReason.BELOW_AGREEMENT_THRESHOLD.value,
                contributing_observations=obs_summaries,
            )

        # Rule 3: Minimum Consensus Confidence
        if consensus_confidence < self.min_confidence:
            return ConsensusResult(
                status=ConsensusStatus.REJECTED,
                camera_id=camera_id,
                consensus_plate=winning_plate,
                consensus_confidence=consensus_confidence,
                consensus_of=winning_count,
                total_window_observations=total_obs,
                agreement_ratio=agreement_ratio,
                first_observed_ts=first_ts,
                last_observed_ts=last_ts,
                rejection_reason=RejectionReason.LOW_CONSENSUS_CONFIDENCE.value,
                contributing_observations=obs_summaries,
            )

        # Rule 4: Conservative format sanity check
        # Must be either standard Indian format or valid alphanumeric length >= 4
        if len(winning_plate) < 4:
            return ConsensusResult(
                status=ConsensusStatus.REJECTED,
                camera_id=camera_id,
                consensus_plate=winning_plate,
                consensus_confidence=consensus_confidence,
                consensus_of=winning_count,
                total_window_observations=total_obs,
                agreement_ratio=agreement_ratio,
                first_observed_ts=first_ts,
                last_observed_ts=last_ts,
                rejection_reason=RejectionReason.FORMAT_INVALID.value,
                contributing_observations=obs_summaries,
            )

        # Evidence Frame Selection:
        # Select the observation among winning plate reads with the HIGHEST OCR confidence
        supporting_obs = plate_observations[winning_plate]
        best_obs = max(supporting_obs, key=lambda o: o.confidence)

        return ConsensusResult(
            status=ConsensusStatus.ACCEPTED,
            camera_id=camera_id,
            consensus_plate=winning_plate,
            consensus_confidence=consensus_confidence,
            consensus_of=winning_count,
            total_window_observations=total_obs,
            agreement_ratio=agreement_ratio,
            first_observed_ts=first_ts,
            last_observed_ts=last_ts,
            rejection_reason=None,
            contributing_observations=obs_summaries,
            best_frame=best_obs.frame,
            best_frame_confidence=best_obs.confidence,
            best_frame_sequence=best_obs.frame_sequence,
        )
