"""
Inference Pipeline Coordinator (Phase 3C)
Combines Vehicle Detection, License Plate Localization, and Latency Telemetry.
Isolates frame failures to ensure uninterrupted per-camera processing.
"""

import logging
import threading
import time
from typing import Any, Callable, Dict, List, Optional
import numpy as np

from app.detection_contract import DetectionResult
from app.detector.base import BasePlateDetector, BaseVehicleDetector
from app.frame_contract import FramePayload
from app.ocr import (
    BaseOCREngine,
    OCRErrorCode,
    OCRResult,
    prepare_plate_crop,
    process_plate_text,
)

logger = logging.getLogger("ai_worker.pipeline")


class InferencePipeline:
    """
    Coordinates vehicle detection, plate localization, and OCR for sampled video frames.
    Tracks execution latency and inference metrics in a thread-safe manner.
    """

    def __init__(
        self,
        vehicle_detector: BaseVehicleDetector,
        plate_detector: BasePlateDetector,
        ocr_engine: Optional[BaseOCREngine] = None,
        ocr_min_confidence: float = 0.30,
        ocr_accept_confidence: float = 0.60,
        on_detection: Optional[Callable[[DetectionResult], None]] = None,
    ):
        self.vehicle_detector = vehicle_detector
        self.plate_detector = plate_detector
        self.ocr_engine = ocr_engine
        self.ocr_min_confidence = ocr_min_confidence
        self.ocr_accept_confidence = ocr_accept_confidence
        self.on_detection = on_detection

        # Thread-safe rolling telemetry
        self._lock = threading.Lock()
        self.total_inferences: int = 0
        self.total_vehicles_detected: int = 0
        self.total_plates_localized: int = 0
        self.total_ocr_processed: int = 0
        self.total_ocr_success: int = 0
        self.total_latency_ms: float = 0.0
        self.min_latency_ms: float = float("inf")
        self.max_latency_ms: float = 0.0
        self.total_ocr_latency_ms: float = 0.0
        self.min_ocr_latency_ms: float = float("inf")
        self.max_ocr_latency_ms: float = 0.0
        self.last_inference_ts: Optional[float] = None

    def process_frame(self, payload: FramePayload) -> DetectionResult:
        """
        Execute vehicle detection, plate localization, and OCR on a single sampled frame.

        Args:
            payload: Validated in-memory FramePayload

        Returns:
            DetectionResult containing detected vehicles, localized plates, and OCR results.
        """
        start_time = time.perf_counter()
        now_ts = time.time()

        if payload is None or not payload.validate():
            logger.warning(
                "[%s] Received invalid FramePayload for inference. Skipping.",
                getattr(payload, "camera_id", "UNKNOWN"),
            )
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

            # 3. License Plate OCR Stage (operates on in-memory plate crops from full frame)
            ocr_results: List[OCRResult] = []
            frame_ocr_ms = 0.0

            if plates and self.ocr_engine is not None and self.ocr_engine.is_ready():
                for plate in plates:
                    ocr_t0 = time.perf_counter()
                    crop = prepare_plate_crop(payload.frame, plate.bbox)

                    if crop is None or crop.size == 0:
                        ocr_dt = (time.perf_counter() - ocr_t0) * 1000.0
                        ocr_results.append(
                            OCRResult(
                                plate_id=plate.plate_id,
                                raw_text="",
                                normalized_text="",
                                confidence=None,
                                confidence_available=False,
                                format_valid=False,
                                engine=self.ocr_engine.engine_name,
                                processing_latency_ms=ocr_dt,
                                preprocessing_variant="none",
                                success=False,
                                error_code=OCRErrorCode.EMPTY_CROP.value,
                                error_message="Plate crop could not be extracted from frame bounds",
                            )
                        )
                        continue

                    try:
                        raw_text, conf, variant = self.ocr_engine.recognize(crop)
                        ocr_dt = (time.perf_counter() - ocr_t0) * 1000.0
                        frame_ocr_ms += ocr_dt

                        normalized, format_valid = process_plate_text(raw_text)

                        # Evaluate success based on text presence and confidence gate
                        if not raw_text.strip():
                            success = False
                            err_code = OCRErrorCode.NO_TEXT_DETECTED.value
                            err_msg = "No alphanumeric characters recognized by OCR engine"
                        elif conf is not None and conf < self.ocr_min_confidence:
                            success = False
                            err_code = OCRErrorCode.LOW_CONFIDENCE.value
                            err_msg = f"OCR confidence {conf:.2f} below threshold {self.ocr_min_confidence:.2f}"
                        else:
                            success = True
                            err_code = None
                            err_msg = None

                        ocr_res = OCRResult(
                            plate_id=plate.plate_id,
                            raw_text=raw_text,
                            normalized_text=normalized,
                            confidence=conf,
                            confidence_available=conf is not None,
                            format_valid=format_valid,
                            engine=self.ocr_engine.engine_name,
                            processing_latency_ms=ocr_dt,
                            preprocessing_variant=variant,
                            success=success,
                            error_code=err_code,
                            error_message=err_msg,
                        )
                        ocr_results.append(ocr_res)

                    except Exception as ocr_ex:
                        ocr_dt = (time.perf_counter() - ocr_t0) * 1000.0
                        ocr_results.append(
                            OCRResult(
                                plate_id=plate.plate_id,
                                raw_text="",
                                normalized_text="",
                                confidence=None,
                                confidence_available=False,
                                format_valid=False,
                                engine=self.ocr_engine.engine_name,
                                processing_latency_ms=ocr_dt,
                                preprocessing_variant="exception",
                                success=False,
                                error_code=OCRErrorCode.OCR_EXCEPTION.value,
                                error_message=str(ocr_ex),
                            )
                        )

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
                ocr_results=ocr_results,
            )

            # Update rolling telemetry
            successful_ocrs = sum(1 for r in ocr_results if r.success)
            with self._lock:
                self.total_inferences += 1
                self.total_vehicles_detected += len(vehicles)
                self.total_plates_localized += len(plates)
                self.total_ocr_processed += len(ocr_results)
                self.total_ocr_success += successful_ocrs
                self.total_latency_ms += elapsed_ms
                if elapsed_ms < self.min_latency_ms:
                    self.min_latency_ms = elapsed_ms
                if elapsed_ms > self.max_latency_ms:
                    self.max_latency_ms = elapsed_ms

                if frame_ocr_ms > 0:
                    self.total_ocr_latency_ms += frame_ocr_ms
                    if frame_ocr_ms < self.min_ocr_latency_ms:
                        self.min_ocr_latency_ms = frame_ocr_ms
                    if frame_ocr_ms > self.max_ocr_latency_ms:
                        self.max_ocr_latency_ms = frame_ocr_ms

                self.last_inference_ts = now_ts

            if vehicles:
                logger.info(
                    "[%s] Frame #%d: Detected %d vehicles, %d plates [%s], %d OCR reads in %.1fms",
                    payload.camera_id,
                    payload.frame_index,
                    len(vehicles),
                    len(plates),
                    self.plate_detector.mode_name,
                    len(ocr_results),
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

            avg_ocr_lat = (
                self.total_ocr_latency_ms / self.total_ocr_processed
                if self.total_ocr_processed > 0
                else 0.0
            )
            min_ocr_lat = self.min_ocr_latency_ms if self.min_ocr_latency_ms != float("inf") else 0.0

            return {
                "total_inferences": self.total_inferences,
                "total_vehicles_detected": self.total_vehicles_detected,
                "total_plates_localized": self.total_plates_localized,
                "total_ocr_processed": self.total_ocr_processed,
                "total_ocr_success": self.total_ocr_success,
                "plate_localizer_mode": self.plate_detector.mode_name,
                "ocr_engine": self.ocr_engine.engine_name if self.ocr_engine else "NONE",
                "avg_latency_ms": round(avg_latency, 2),
                "min_latency_ms": round(min_lat, 2),
                "max_latency_ms": round(self.max_latency_ms, 2),
                "avg_ocr_latency_ms": round(avg_ocr_lat, 2),
                "min_ocr_latency_ms": round(min_ocr_lat, 2),
                "max_ocr_latency_ms": round(self.max_ocr_latency_ms, 2),
                "last_inference_ts": self.last_inference_ts,
            }
