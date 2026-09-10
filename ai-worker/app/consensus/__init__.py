"""
Consensus Engine Package (Phase 3E)
"""

from app.consensus.contract import (
    ConsensusResult,
    ConsensusStatus,
    PlateObservation,
    RejectionReason,
)
from app.consensus.aggregator import MultiFrameConsensusAggregator

__all__ = [
    "ConsensusResult",
    "ConsensusStatus",
    "PlateObservation",
    "RejectionReason",
    "MultiFrameConsensusAggregator",
]
