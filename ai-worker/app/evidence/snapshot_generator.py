"""
Evidence Snapshot Generator (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 11.1

Encodes real CCTV video frames into standardized JPEG evidence artifacts
and computes cryptographic SHA-256 integrity fingerprints over the exact bytes.
Never injects synthetic plate numbers or artificial overlays into images.
"""

import logging
import uuid
from typing import Optional, Tuple
import cv2
import numpy as np

from app.evidence.contract import EvidenceArtifact
from app.evidence.hasher import compute_sha256

logger = logging.getLogger("ai_worker.evidence")


class EvidenceSnapshotGenerator:
    """
    Produces tamper-evident JPEG evidence artifacts from selected camera video frames.
    """

    def __init__(self, jpeg_quality: int = 90):
        """
        Args:
            jpeg_quality: JPEG compression quality factor (1-100, default: 90).
        """
        self.jpeg_quality = max(10, min(100, jpeg_quality))

    def create_snapshot(
        self,
        frame: np.ndarray,
        camera_id: str,
        frame_sequence: int,
        captured_at: float,
        plate_normalized: str,
        artifact_id: Optional[str] = None,
    ) -> Optional[EvidenceArtifact]:
        """
        Encode raw OpenCV BGR frame into a standardized JPEG evidence artifact
        and calculate its SHA-256 integrity fingerprint.

        Args:
            frame: OpenCV BGR image matrix (non-empty).
            camera_id: Identifier of the capturing CCTV camera.
            frame_sequence: Integer index of the sampled video frame.
            captured_at: POSIX timestamp when the frame was captured.
            plate_normalized: Normalized license plate string identified by consensus.
            artifact_id: Optional UUID string; generated if omitted.

        Returns:
            EvidenceArtifact containing encoded bytes and SHA-256 digest, or None on failure.
        """
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            logger.error("[%s] Cannot generate evidence snapshot: frame matrix is empty or invalid.", camera_id)
            return None

        height, width = frame.shape[:2]
        if height <= 0 or width <= 0:
            logger.error("[%s] Cannot generate evidence snapshot: invalid frame dimensions (%dx%d).", camera_id, width, height)
            return None

        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), self.jpeg_quality]
        success, encoded_buf = cv2.imencode(".jpg", frame, encode_params)

        if not success or encoded_buf is None:
            logger.error("[%s] OpenCV JPEG encoding failed for frame #%d.", camera_id, frame_sequence)
            return None

        image_bytes = encoded_buf.tobytes()
        sha256_hash = compute_sha256(image_bytes)
        unique_id = artifact_id if artifact_id else str(uuid.uuid4())

        artifact = EvidenceArtifact(
            artifact_id=unique_id,
            camera_id=camera_id,
            frame_sequence=frame_sequence,
            captured_at=captured_at,
            plate_normalized=plate_normalized,
            image_bytes=image_bytes,
            sha256_hash=sha256_hash,
            width=width,
            height=height,
            mime_type="image/jpeg",
        )

        logger.info(
            "[%s] Created evidence snapshot #%s: %d bytes, SHA-256: %s...%s (Plate: %s)",
            camera_id,
            unique_id[:8],
            artifact.size_bytes,
            sha256_hash[:8],
            sha256_hash[-8:],
            plate_normalized,
        )

        return artifact
