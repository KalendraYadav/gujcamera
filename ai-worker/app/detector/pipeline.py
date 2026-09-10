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

from app.consensus import (
    ConsensusResult,
    MultiFrameConsensusAggregator,
    PlateObservation,
)
from app.detection_contract import DetectionResult
from app.detector.base import BasePlateDetector, BaseVehicleDetector
from app.domain import (
    BaseDomainRepository,
    EvidenceRecord,
    VehicleSightingRecord,
    convert_consensus_to_domain,
)
from app.evidence import (
    EvidenceArtifact,
    EvidenceSnapshotGenerator,
    EvidenceStorageResult,
    MinioEvidenceVault,
)
from app.events import RedisEventPublisher, VehicleSightingCreatedEvent
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
    Coordinates vehicle detection, plate localization, OCR, multi-frame consensus,
    and evidence capture for sampled video frames.
    Tracks execution latency and telemetry in a thread-safe manner.
    """

    def __init__(
        self,
        vehicle_detector: BaseVehicleDetector,
        plate_detector: BasePlateDetector,
        ocr_engine: Optional[BaseOCREngine] = None,
        ocr_min_confidence: float = 0.30,
        ocr_accept_confidence: float = 0.60,
        consensus_aggregator: Optional[MultiFrameConsensusAggregator] = None,
        snapshot_generator: Optional[EvidenceSnapshotGenerator] = None,
        evidence_vault: Optional[MinioEvidenceVault] = None,
        domain_repository: Optional[BaseDomainRepository] = None,
        event_publisher: Optional[RedisEventPublisher] = None,
        on_detection: Optional[Callable[[DetectionResult], None]] = None,
        on_consensus: Optional[Callable[[ConsensusResult, Optional[EvidenceArtifact], Optional[EvidenceStorageResult]], None]] = None,
    ):
        self.vehicle_detector = vehicle_detector
        self.plate_detector = plate_detector
        self.ocr_engine = ocr_engine
        self.ocr_min_confidence = ocr_min_confidence
        self.ocr_accept_confidence = ocr_accept_confidence
        self.consensus_aggregator = consensus_aggregator
        self.snapshot_generator = snapshot_generator
        self.evidence_vault = evidence_vault
        self.domain_repository = domain_repository
        self.event_publisher = event_publisher
        self.on_detection = on_detection
        self.on_consensus = on_consensus

        # Thread-safe rolling telemetry
        self._lock = threading.Lock()
        self.total_inferences: int = 0
        self.total_vehicles_detected: int = 0
        self.total_plates_localized: int = 0
        self.total_ocr_processed: int = 0
        self.total_ocr_success: int = 0
        self.total_consensus_evaluated: int = 0
        self.total_consensus_accepted: int = 0
        self.total_evidence_stored: int = 0
        self.total_events_published: int = 0
        self.total_event_publish_errors: int = 0
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

            # 4. Multi-Frame Consensus & Evidence Stage (Phase 3E)
            consensus_results: List[ConsensusResult] = []
            if self.consensus_aggregator is not None and plates and ocr_results:
                for plate, ocr_res in zip(plates, ocr_results):
                    if ocr_res.success and ocr_res.normalized_text:
                        obs = PlateObservation(
                            camera_id=payload.camera_id,
                            frame_sequence=payload.frame_index,
                            timestamp=payload.captured_at,
                            raw_text=ocr_res.raw_text,
                            normalized_text=ocr_res.normalized_text,
                            confidence=ocr_res.confidence or 0.0,
                            format_valid=ocr_res.format_valid,
                            frame=payload.frame,
                            plate_bbox=plate.bbox.to_list(),
                            vehicle_id=plate.vehicle_id,
                        )
                        c_res = self.consensus_aggregator.add_observation(obs)
                        if c_res is not None:
                            consensus_results.append(c_res)
                            evidence_artifact = None
                            storage_result = None

                            if c_res.is_accepted:
                                # Create Evidence Snapshot
                                if self.snapshot_generator is not None and c_res.best_frame is not None:
                                    evidence_artifact = self.snapshot_generator.create_snapshot(
                                        frame=c_res.best_frame,
                                        camera_id=c_res.camera_id,
                                        frame_sequence=c_res.best_frame_sequence,
                                        captured_at=c_res.last_observed_ts,
                                        plate_normalized=c_res.consensus_plate or "",
                                    )

                                # Store in MinIO Evidence Vault
                                if self.evidence_vault is not None and evidence_artifact is not None:
                                    storage_result = self.evidence_vault.store_artifact(evidence_artifact)

                                # Convert to canonical domain records
                                sighting, evidence_rec = convert_consensus_to_domain(
                                    consensus=c_res,
                                    evidence_artifact=evidence_artifact,
                                    storage_result=storage_result,
                                )

                                # Persist to domain repository if configured
                                if self.domain_repository is not None and sighting is not None:
                                    self.domain_repository.save_sighting(sighting, evidence_rec)

                                # Phase 3F: Publish vehicle.sighting_created domain event
                                # Invariant: Sighting AND Evidence must exist, MinIO storage MUST have succeeded
                                if (
                                    self.event_publisher is not None
                                    and sighting is not None
                                    and evidence_rec is not None
                                    and storage_result is not None
                                    and storage_result.success
                                    and evidence_artifact is not None
                                ):
                                    event = VehicleSightingCreatedEvent.create(
                                        sighting_id=sighting.id,
                                        evidence_id=evidence_rec.id,
                                        camera_id=sighting.camera_id,
                                        plate_normalized=sighting.plate_normalized,
                                        confidence=sighting.confidence,
                                        consensus_of=sighting.consensus_of,
                                        total_observations=c_res.total_window_observations,
                                        storage_ref=evidence_rec.storage_ref,
                                        evidence_hash=evidence_rec.hash,
                                        captured_at_ts=evidence_artifact.captured_at,
                                    )
                                    msg_id = self.event_publisher.publish_sighting(event)
                                    with self._lock:
                                        if msg_id:
                                            self.total_events_published += 1
                                        else:
                                            self.total_event_publish_errors += 1

                                with self._lock:
                                    self.total_consensus_evaluated += 1
                                    self.total_consensus_accepted += 1
                                    if storage_result and storage_result.success:
                                        self.total_evidence_stored += 1

                                logger.info(
                                    "[%s] Consensus ACCEPTED: %s (conf: %.2f, frames: %d/%d). Sighting ID: %s",
                                    c_res.camera_id,
                                    c_res.consensus_plate,
                                    c_res.consensus_confidence,
                                    c_res.consensus_of,
                                    c_res.total_window_observations,
                                    sighting.id if sighting else "NONE",
                                )
                            else:
                                with self._lock:
                                    self.total_consensus_evaluated += 1

                                logger.debug(
                                    "[%s] Consensus %s: %s",
                                    c_res.camera_id,
                                    c_res.status.value,
                                    c_res.rejection_reason,
                                )

                            if self.on_consensus is not None:
                                try:
                                    self.on_consensus(c_res, evidence_artifact, storage_result)
                                except Exception as cb_err:
                                    logger.error("[%s] Error in on_consensus callback: %s", payload.camera_id, str(cb_err))

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
                consensus_results=consensus_results,
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
                    "[%s] Frame #%d: Detected %d vehicles, %d plates [%s], %d OCR reads, %d consensus in %.1fms",
                    payload.camera_id,
                    payload.frame_index,
                    len(vehicles),
                    len(plates),
                    self.plate_detector.mode_name,
                    len(ocr_results),
                    len(consensus_results),
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
                "total_consensus_evaluated": self.total_consensus_evaluated,
                "total_consensus_accepted": self.total_consensus_accepted,
                "total_evidence_stored": self.total_evidence_stored,
                "total_events_published": self.total_events_published,
                "total_event_publish_errors": self.total_event_publish_errors,
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
