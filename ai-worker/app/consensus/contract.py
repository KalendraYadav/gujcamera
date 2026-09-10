"""
In-Memory Multi-Frame Consensus Contracts (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 9.1
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional
import numpy as np


class ConsensusStatus(str, Enum):
    """Lifecycle status of a multi-frame consensus evaluation"""
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    UNDECIDED = "UNDECIDED"


class RejectionReason(str, Enum):
    """Explainable diagnostic reason when consensus is not accepted"""
    INSUFFICIENT_OBSERVATIONS = "INSUFFICIENT_OBSERVATIONS"
    LOW_CONSENSUS_CONFIDENCE = "LOW_CONSENSUS_CONFIDENCE"
    SPLIT_VOTE_NO_MAJORITY = "SPLIT_VOTE_NO_MAJORITY"
    BELOW_AGREEMENT_THRESHOLD = "BELOW_AGREEMENT_THRESHOLD"
    EMPTY_WINDOW = "EMPTY_WINDOW"
    WINDOW_EXPIRED = "WINDOW_EXPIRED"
    FORMAT_INVALID = "FORMAT_INVALID"


@dataclass(slots=True)
class PlateObservation:
    """
    A single frame's license plate OCR observation inside a temporal observation window.
    Carries transient in-memory frame reference for evidence capture if consensus is reached.
    """
    camera_id: str
    frame_sequence: int
    timestamp: float
    raw_text: str
    normalized_text: str
    confidence: float
    format_valid: bool = False
    frame: Optional[np.ndarray] = None
    plate_bbox: Optional[List[int]] = None
    vehicle_id: Optional[str] = None

    def to_summary(self) -> Dict[str, Any]:
        """Diagnostic summary without raw frame bytes"""
        return {
            "camera_id": self.camera_id,
            "frame_sequence": self.frame_sequence,
            "timestamp": self.timestamp,
            "raw_text": self.raw_text,
            "normalized_text": self.normalized_text,
            "confidence": round(self.confidence, 4),
            "format_valid": self.format_valid,
            "plate_bbox": self.plate_bbox,
            "vehicle_id": self.vehicle_id,
        }


@dataclass(slots=True)
class ConsensusResult:
    """
    Structured outcome of multi-frame consensus evaluation.
    Explainable, deterministic, and preserves contributing observations.
    """
    status: ConsensusStatus
    camera_id: str
    consensus_plate: Optional[str] = None
    consensus_confidence: float = 0.0
    consensus_of: int = 0
    total_window_observations: int = 0
    agreement_ratio: float = 0.0
    first_observed_ts: float = 0.0
    last_observed_ts: float = 0.0
    rejection_reason: Optional[str] = None
    contributing_observations: List[Dict[str, Any]] = field(default_factory=list)
    best_frame: Optional[np.ndarray] = None
    best_frame_confidence: float = 0.0
    best_frame_sequence: int = 0

    @property
    def is_accepted(self) -> bool:
        return self.status == ConsensusStatus.ACCEPTED

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation excluding heavy frame matrices"""
        return {
            "status": self.status.value,
            "camera_id": self.camera_id,
            "consensus_plate": self.consensus_plate,
            "consensus_confidence": round(self.consensus_confidence, 4),
            "consensus_of": self.consensus_of,
            "total_window_observations": self.total_window_observations,
            "agreement_ratio": round(self.agreement_ratio, 4),
            "first_observed_ts": self.first_observed_ts,
            "last_observed_ts": self.last_observed_ts,
            "rejection_reason": self.rejection_reason,
            "best_frame_sequence": self.best_frame_sequence,
            "best_frame_confidence": round(self.best_frame_confidence, 4),
            "contributing_observations_count": len(self.contributing_observations),
            "contributing_observations": self.contributing_observations,
        }
