"""
Internal Frame Contract for AI Vision Pipeline (Phase 3B)
Represents a single sampled video frame passed from the stream consumer
to downstream detection stages.
"""

from dataclasses import dataclass
from typing import Any
import numpy as np


@dataclass(slots=True)
class FramePayload:
    """
    Decoupled in-memory frame entity.
    Not persisted to PostgreSQL or MinIO in Phase 3B.
    """
    camera_id: str
    frame_index: int
    captured_at: float        # Epoch timestamp of frame capture
    sampled_at: float         # Epoch timestamp when frame was selected by sampler
    width: int
    height: int
    frame: np.ndarray         # Decoded OpenCV BGR image matrix
    channels: int = 3

    def validate(self) -> bool:
        """Validate that the frame payload contains non-empty image data"""
        if self.frame is None:
            return False
        if not isinstance(self.frame, np.ndarray):
            return False
        if self.width <= 0 or self.height <= 0:
            return False
        if self.frame.shape[0] != self.height or self.frame.shape[1] != self.width:
            return False
        return True

    def summary(self) -> dict[str, Any]:
        """Return frame metadata summary without the raw pixel matrix"""
        return {
            "camera_id": self.camera_id,
            "frame_index": self.frame_index,
            "captured_at": self.captured_at,
            "sampled_at": self.sampled_at,
            "dimensions": f"{self.width}x{self.height}",
            "channels": self.channels,
            "byte_size": self.frame.nbytes if self.frame is not None else 0
        }
