"""
Inference Pipeline Coordinator (Phase 3C)
Combines Vehicle Detection, License Plate Localization, and Latency Telemetry.
Isolates frame failures to ensure uninterrupted per-camera processing.
"""

import logging
import threading
import time
from typing import Any, Callable, Dict, Optional
import numpy as np

from app.detection_contract import DetectionResult
from app.detector.base import BasePlateDetector, BaseVehicleDetector
from app.frame_contract import FramePayload

logger = logging.getLogger("ai_worker.pipeline")


class InferencePipeline:
    """
    Coordinates vehicle detection and plate localization for sampled video frames.
    Tracks execution latency and inference metrics in a thread-safe manner.
    """

    def __init__(
        self,
        vehicle_detector: BaseVehicleDetector,
        plate_detector: BasePlateDetector,
        on_detection: Optional[Callable[[DetectionResult], None]] = None,
    ):
        self.vehicle_detector = vehicle_detector
        self.plate_detector = plate_detector
        self.on_detection = on_detection

        # Thread-safe rolling telemetry
        self._lock = threading.Lock()
        self.total_inferences: int = 0
        self.total_vehicles_detected: int = 0
        self.total_plates_localized: int = 0
        self.total_latency_ms: float = 0.0
        self.min_latency_ms: float = float("inf")
        self.max_latency_ms: float = 0.0
        self.last_inference_ts: Optional[float] = None

    def process_frame(self, payload: FramePayload) -> DetectionResult:
        """
        Execute vehicle detection and plate localization on a single sampled frame.

        Args:
            payload: Validated in-memory FramePayload

        Returns:
            DetectionResult containing detected vehicles and localized plates.
        """
        start_time = time.perf_counter()
        now_ts = time.time()

        if payload is None or not payload.validate():
            logger.warning("[%s] Received invalid FramePayload for inference. Skipping.", getattr(payload, "camera_id", "UNKNOWN"))
            return DetectionResult(
                camera_id=getattr(payload, "camera_id", "UNKNOWN"),
                captured_at=getattr(payload, "captured_at", now_ts),
                frame_sequence=getattr(payload, "frame_index", 0),
                frame_width=getattr(payload, "width", 0),
                frame_height=getattr(payload, "height", 0),
                inference_timestamp=now_ts,
                inference_latency_ms=0.0,
            )

        try:
            # 1. Vehicle Detection Stage
            vehicles = self.vehicle_detector.detect(payload.frame)

            # 2. License Plate Localization Stage (operates on vehicle crops)
            plates = []
            if vehicles:
                plates = self.plate_detector.localize(payload.frame, vehicles)

            elapsed_ms = (time.perf_counter() - start_time) * 1000.0

            result = DetectionResult(
                camera_id=payload.camera_id,
                captured_at=payload.captured_at,
                frame_sequence=payload.frame_index,
                frame_width=payload.width,
                frame_height=payload.height,
                inference_timestamp=now_ts,
                inference_latency_ms=elapsed_ms,
                plate_localizer_mode=self.plate_detector.mode_name,
                detected_objects=vehicles,
                plates=plates,
            )

            # Update rolling telemetry
            with self._lock:
                self.total_inferences += 1
                self.total_vehicles_detected += len(vehicles)
                self.total_plates_localized += len(plates)
                self.total_latency_ms += elapsed_ms
                if elapsed_ms < self.min_latency_ms:
                    self.min_latency_ms = elapsed_ms
                if elapsed_ms > self.max_latency_ms:
                    self.max_latency_ms = elapsed_ms
                self.last_inference_ts = now_ts

            if vehicles:
                logger.info(
                    "[%s] Frame #%d: Detected %d vehicles, %d plates [%s] in %.1fms",
                    payload.camera_id,
                    payload.frame_index,
                    len(vehicles),
                    len(plates),
                    self.plate_detector.mode_name,
                    elapsed_ms,
                )

            if self.on_detection is not None:
                try:
                    self.on_detection(result)
                except Exception as cb_err:
                    logger.error("[%s] Error in on_detection callback: %s", payload.camera_id, str(cb_err))

            return result

        except Exception as ex:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            logger.error("[%s] Inference pipeline failure: %s", payload.camera_id, str(ex), exc_info=True)
            return DetectionResult(
                camera_id=payload.camera_id,
                captured_at=payload.captured_at,
                frame_sequence=payload.frame_index,
                frame_width=payload.width,
                frame_height=payload.height,
                inference_timestamp=now_ts,
                inference_latency_ms=elapsed_ms,
            )

    def get_metrics(self) -> Dict[str, Any]:
        """Return aggregated inference metrics for monitoring and heartbeat reporting"""
        with self._lock:
            avg_latency = (
                self.total_latency_ms / self.total_inferences
                if self.total_inferences > 0
                else 0.0
            )
            min_lat = self.min_latency_ms if self.min_latency_ms != float("inf") else 0.0

            return {
                "total_inferences": self.total_inferences,
                "total_vehicles_detected": self.total_vehicles_detected,
                "total_plates_localized": self.total_plates_localized,
                "plate_localizer_mode": self.plate_detector.mode_name,
                "avg_latency_ms": round(avg_latency, 2),
                "min_latency_ms": round(min_lat, 2),
                "max_latency_ms": round(self.max_latency_ms, 2),
                "last_inference_ts": self.last_inference_ts,
            }
