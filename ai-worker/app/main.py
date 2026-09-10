"""
AI Vision Worker Entrypoint (Phase 3B: Container Scaffold & RTSP Frame Consumer)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
"""

import logging
import signal
import sys
import time
from typing import List

from app.config import settings
from app.consensus import MultiFrameConsensusAggregator
from app.detector import InferencePipeline, PlateLocalizer, YoloVehicleDetector
from app.domain import InMemoryDomainRepository
from app.evidence import EvidenceSnapshotGenerator, MinioEvidenceVault
from app.health import worker_health
from app.logging_config import setup_logging
from app.ocr import TesseractOCREngine
from app.stream_consumer import StreamConsumer

logger = logging.getLogger("ai_worker.main")


class WorkerApp:
    """Orchestrates stream consumers, computer vision pipeline, and telemetry reporting"""

    def __init__(self):
        self.settings = settings
        self.consumers: List[StreamConsumer] = []
        self._is_running = False

        # Initialize Phase 3C Detection Pipeline
        vehicle_detector = YoloVehicleDetector(
            model_path=self.settings.VEHICLE_MODEL_PATH,
            confidence_threshold=self.settings.VEHICLE_CONFIDENCE_THRESHOLD,
            device=self.settings.INFERENCE_DEVICE,
        )
        plate_detector = PlateLocalizer(
            model_path=self.settings.PLATE_MODEL_PATH if self.settings.PLATE_MODEL_PATH else None,
            confidence_threshold=self.settings.PLATE_CONFIDENCE_THRESHOLD,
            device=self.settings.INFERENCE_DEVICE,
        )

        # Initialize Phase 3D OCR Engine
        ocr_engine = None
        if self.settings.OCR_ENABLED:
            ocr_engine = TesseractOCREngine(
                tesseract_cmd=self.settings.OCR_TESSERACT_CMD if self.settings.OCR_TESSERACT_CMD else None
            )

        # Initialize Phase 3E Consensus, Evidence Vault, and Domain Repository
        consensus_aggregator = None
        if self.settings.CONSENSUS_ENABLED:
            consensus_aggregator = MultiFrameConsensusAggregator(
                window_size=self.settings.CONSENSUS_WINDOW_SIZE,
                min_observations=self.settings.CONSENSUS_MIN_OBSERVATIONS,
                min_confidence=self.settings.CONSENSUS_MIN_CONFIDENCE,
                min_agreement_ratio=self.settings.CONSENSUS_MIN_AGREEMENT_RATIO,
                max_window_seconds=self.settings.CONSENSUS_MAX_WINDOW_SECONDS,
            )

        snapshot_generator = None
        if self.settings.EVIDENCE_CAPTURE_ENABLED:
            snapshot_generator = EvidenceSnapshotGenerator(
                jpeg_quality=self.settings.EVIDENCE_JPEG_QUALITY
            )

        evidence_vault = MinioEvidenceVault(
            endpoint=self.settings.MINIO_ENDPOINT,
            access_key=self.settings.MINIO_ROOT_USER,
            secret_key=self.settings.MINIO_ROOT_PASSWORD,
            bucket_name=self.settings.MINIO_BUCKET_NAME,
            secure=self.settings.MINIO_SECURE,
        )

        domain_repository = InMemoryDomainRepository()

        self.pipeline = InferencePipeline(
            vehicle_detector=vehicle_detector,
            plate_detector=plate_detector,
            ocr_engine=ocr_engine,
            ocr_min_confidence=self.settings.OCR_MIN_CONFIDENCE,
            ocr_accept_confidence=self.settings.OCR_ACCEPT_CONFIDENCE,
            consensus_aggregator=consensus_aggregator,
            snapshot_generator=snapshot_generator,
            evidence_vault=evidence_vault,
            domain_repository=domain_repository,
        )

    def setup_signals(self) -> None:
        """Register signal handlers for SIGINT and SIGTERM if running in main thread"""
        import threading
        if threading.current_thread() is not threading.main_thread():
            return

        def _signal_handler(signum, frame):
            sig_name = signal.Signals(signum).name
            logger.info("Received termination signal %s (%d). Initiating graceful shutdown...", sig_name, signum)
            self.stop()

        signal.signal(signal.SIGINT, _signal_handler)
        signal.signal(signal.SIGTERM, _signal_handler)

    def start(self) -> None:
        """Initialize and start all camera stream consumers"""
        self.setup_signals()
        self._is_running = True

        logger.info("==================================================")
        logger.info("  GUJARAT POLICE AI VISION WORKER (Phase 3C)      ")
        logger.info("==================================================")
        logger.info("Worker Name       : %s", self.settings.WORKER_NAME)
        logger.info("Vehicle Model Path: %s", self.settings.VEHICLE_MODEL_PATH)
        logger.info("Vehicle Conf Gate : %.2f", self.settings.VEHICLE_CONFIDENCE_THRESHOLD)
        logger.info("Plate Conf Gate   : %.2f", self.settings.PLATE_CONFIDENCE_THRESHOLD)
        logger.info("Inference Device  : %s", self.settings.INFERENCE_DEVICE)
        logger.info("Target Sampling   : %.1f FPS", self.settings.SAMPLE_FPS)
        logger.info("Metrics Interval  : %.1f s", self.settings.METRICS_INTERVAL)
        logger.info("Base Backoff Delay: %.1f s", self.settings.BASE_RECONNECT_DELAY)
        logger.info("Max Backoff Delay : %.1f s", self.settings.MAX_RECONNECT_DELAY)
        logger.info("==================================================")

        camera_configs = self.settings.get_camera_configs()
        logger.info("Discovered %d active camera stream configurations:", len(camera_configs))
        for cfg in camera_configs:
            logger.info("  - [%s] -> %s", cfg.id, cfg.sanitized_url())

        # Instantiate and start consumers with downstream inference pipeline callback
        for cfg in camera_configs:
            tracker = worker_health.get_or_create_camera(cfg.id)
            consumer = StreamConsumer(
                config=cfg,
                health_tracker=tracker,
                sample_fps=self.settings.SAMPLE_FPS,
                base_reconnect_delay=self.settings.BASE_RECONNECT_DELAY,
                max_reconnect_delay=self.settings.MAX_RECONNECT_DELAY,
                decode_failure_threshold=self.settings.DECODE_FAILURE_THRESHOLD,
                frame_callback=self.pipeline.process_frame,
            )
            self.consumers.append(consumer)
            consumer.start()

        # Run periodic health and telemetry reporting loop
        self._run_metrics_loop()

    def _run_metrics_loop(self) -> None:
        """Periodically output structured telemetry summaries"""
        last_metrics_time = time.time()

        while self._is_running:
            try:
                time.sleep(1.0)
                now = time.time()
                if now - last_metrics_time >= self.settings.METRICS_INTERVAL:
                    last_metrics_time = now
                    self._log_health_summary()
            except KeyboardInterrupt:
                logger.info("KeyboardInterrupt caught in main metrics loop")
                self.stop()
                break

    def _log_health_summary(self) -> None:
        """Print structured health report distinguishing worker vs stream status"""
        summary = worker_health.get_summary()
        w = summary["worker"]
        logger.info(
            "[HEARTBEAT] Worker: %s | Uptime: %.1fs | Streams: %d total (Connected: %d, Degraded: %d, Offline: %d)",
            w["status"],
            w["uptime_seconds"],
            w["total_managed_streams"],
            w["connected_streams"],
            w["degraded_streams"],
            w["offline_streams"],
        )

        for cam_id, metrics in summary["streams"].items():
            logger.info(
                "  -> [%s] Status: %-9s | Rx: %6d frames | Sampled: %5d frames | Failures: %3d | Reconnects: %2d | Rate: %4.1f FPS",
                cam_id,
                metrics["status"],
                metrics["frames_received"],
                metrics["frames_sampled"],
                metrics["decode_failures"],
                metrics["reconnect_count"],
                metrics["fps_actual"],
            )

        inf = self.pipeline.get_metrics()
        logger.info(
            "  -> [INFERENCE] Total: %d processed | Vehicles: %d | Plates: %d | Mode: %s | Latency: %.1fms avg (min: %.1f, max: %.1f)",
            inf["total_inferences"],
            inf["total_vehicles_detected"],
            inf["total_plates_localized"],
            inf["plate_localizer_mode"],
            inf["avg_latency_ms"],
            inf["min_latency_ms"],
            inf["max_latency_ms"],
        )
        logger.info(
            "  -> [OCR] Engine: %s | Processed: %d | Success: %d | Latency: %.1fms avg (min: %.1f, max: %.1f)",
            inf["ocr_engine"],
            inf["total_ocr_processed"],
            inf["total_ocr_success"],
            inf["avg_ocr_latency_ms"],
            inf["min_ocr_latency_ms"],
            inf["max_ocr_latency_ms"],
        )
        logger.info(
            "  -> [CONSENSUS] Evaluated: %d | Accepted: %d | Evidence Vault Stored: %d",
            inf.get("total_consensus_evaluated", 0),
            inf.get("total_consensus_accepted", 0),
            inf.get("total_evidence_stored", 0),
        )

    def stop(self) -> None:
        """Stop all stream consumers and terminate cleanly"""
        if not self._is_running:
            return

        self._is_running = False
        logger.info("Stopping %d stream consumers...", len(self.consumers))

        for consumer in self.consumers:
            consumer.stop(timeout=3.0)

        worker_health.worker_status = "STOPPED"
        logger.info("Final Health Summary before shutdown:")
        self._log_health_summary()
        logger.info("AI Vision Worker shutdown complete.")


def main():
    setup_logging(settings.LOG_LEVEL)
    app = WorkerApp()
    app.start()


if __name__ == "__main__":
    main()
