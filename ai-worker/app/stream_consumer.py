"""
RTSP Stream Consumer for AI Vision Worker (Phase 3B)
Uses OpenCV VideoCapture with TCP transport to ingest and sample video frames.
Includes exponential backoff reconnection and per-stream health isolation.
"""

import logging
import os
import threading
import time
from typing import Callable, Optional
import cv2
import numpy as np

from app.config import CameraConfig, sanitize_url
from app.frame_contract import FramePayload
from app.health import CameraHealthTracker, StreamStatus

logger = logging.getLogger("ai_worker.stream_consumer")


class StreamConsumer:
    """
    Consumes RTSP frames from a single camera using OpenCV VideoCapture.
    Samples frames at a target rate (e.g. 3-5 FPS) and updates health metrics.
    Runs asynchronously in its own dedicated thread.
    """

    def __init__(
        self,
        config: CameraConfig,
        health_tracker: CameraHealthTracker,
        sample_fps: float = 3.0,
        base_reconnect_delay: float = 2.0,
        max_reconnect_delay: float = 30.0,
        decode_failure_threshold: int = 5,
        frame_callback: Optional[Callable[[FramePayload], None]] = None,
    ):
        self.config = config
        self.health_tracker = health_tracker
        self.sample_fps = max(0.5, float(sample_fps))
        self.sample_interval = 1.0 / self.sample_fps
        self.base_reconnect_delay = base_reconnect_delay
        self.max_reconnect_delay = max_reconnect_delay
        self.decode_failure_threshold = decode_failure_threshold
        self.frame_callback = frame_callback

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._frame_seq: int = 0
        self._last_sample_ts: float = 0.0

    def start(self) -> None:
        """Start consumer thread"""
        if self._thread is not None and self._thread.is_alive():
            logger.warning("[%s] Stream consumer already running", self.config.id)
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_reconnect_loop,
            name=f"Consumer-{self.config.id}",
            daemon=True,
        )
        self._thread.start()
        logger.info(
            "[%s] Stream consumer thread started (target sampling: %.1f FPS, URL: %s)",
            self.config.id,
            self.sample_fps,
            self.config.sanitized_url(),
        )

    def stop(self, timeout: float = 5.0) -> None:
        """Stop consumer thread gracefully"""
        self._stop_event.set()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=timeout)
            logger.info("[%s] Stream consumer thread joined", self.config.id)
        self.health_tracker.set_status(StreamStatus.STOPPED)

    def is_running(self) -> bool:
        """Check if consumer thread is active"""
        return self._thread is not None and self._thread.is_alive()

    def _run_reconnect_loop(self) -> None:
        """Outer loop managing reconnection with exponential backoff"""
        reconnect_delay = self.base_reconnect_delay

        while not self._stop_event.is_set():
            try:
                self._consume_stream()
            except Exception as ex:
                logger.error(
                    "[%s] Unexpected error in stream consumer loop: %s",
                    self.config.id,
                    str(ex),
                    exc_info=True,
                )

            if self._stop_event.is_set():
                break

            # Stream ended or disconnected, initiate backoff wait
            self.health_tracker.record_reconnect()
            logger.warning(
                "[%s] Disconnected from stream. Reconnecting in %.1fs (attempt count: %d)...",
                self.config.id,
                reconnect_delay,
                self.health_tracker.reconnect_count,
            )

            # Interruptible wait for reconnect delay
            interrupted = self._stop_event.wait(timeout=reconnect_delay)
            if interrupted:
                break

            # Exponential backoff calculation bounded by max_reconnect_delay
            reconnect_delay = min(reconnect_delay * 2.0, self.max_reconnect_delay)

        self.health_tracker.set_status(StreamStatus.STOPPED)
        logger.info("[%s] Reconnect loop terminated", self.config.id)

    def _open_capture(self) -> Optional[cv2.VideoCapture]:
        """Open OpenCV VideoCapture with TCP RTSP transport configuration"""
        # Ensure TCP transport via OpenCV FFmpeg backend environment variable
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

        try:
            cap = cv2.VideoCapture(self.config.url, cv2.CAP_FFMPEG)
            # Minimize internal buffer latency
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if not cap.isOpened():
                cap.release()
                return None
            return cap
        except Exception as ex:
            logger.warning(
                "[%s] Failed to open VideoCapture for %s: %s",
                self.config.id,
                self.config.sanitized_url(),
                str(ex),
            )
            return None

    def _consume_stream(self) -> None:
        """Inner loop reading frames from an established RTSP connection"""
        logger.info(
            "[%s] Connecting to RTSP stream: %s",
            self.config.id,
            self.config.sanitized_url(),
        )

        cap = self._open_capture()
        if cap is None:
            logger.warning(
                "[%s] Unable to open RTSP stream at %s",
                self.config.id,
                self.config.sanitized_url(),
            )
            self.health_tracker.set_status(StreamStatus.OFFLINE)
            return

        logger.info(
            "[%s] Successfully connected to RTSP stream. Starting frame ingestion...",
            self.config.id,
        )
        self.health_tracker.set_status(StreamStatus.CONNECTED)

        consecutive_failures = 0

        try:
            while not self._stop_event.is_set():
                read_start = time.time()
                ret, frame = cap.read()

                if not ret or frame is None or (isinstance(frame, np.ndarray) and frame.size == 0):
                    consecutive_failures += 1
                    self.health_tracker.record_decode_failure()

                    if consecutive_failures >= self.decode_failure_threshold:
                        logger.warning(
                            "[%s] Exceeded consecutive decode failure threshold (%d). Reconnecting stream...",
                            self.config.id,
                            self.decode_failure_threshold,
                        )
                        break

                    # Short pause before retry to avoid CPU spinning on dead stream
                    time.sleep(0.01)
                    continue

                # Frame successfully decoded
                consecutive_failures = 0
                now = time.time()
                self._frame_seq += 1

                # Evaluate sampling rate
                elapsed_since_last_sample = now - self._last_sample_ts
                is_sampled = elapsed_since_last_sample >= self.sample_interval

                if is_sampled:
                    self._last_sample_ts = now
                    height, width = frame.shape[:2]

                    # Validate frame dimensions
                    if width <= 0 or height <= 0:
                        logger.warning(
                            "[%s] Decoded invalid frame dimensions: %dx%d. Skipping.",
                            self.config.id,
                            width,
                            height,
                        )
                        self.health_tracker.record_decode_failure()
                        continue

                    channels = frame.shape[2] if len(frame.shape) > 2 else 1

                    payload = FramePayload(
                        camera_id=self.config.id,
                        frame_index=self._frame_seq,
                        captured_at=read_start,
                        sampled_at=now,
                        width=width,
                        height=height,
                        frame=frame,
                        channels=channels,
                    )

                    self.health_tracker.record_frame(sampled=True)

                    if self.frame_callback is not None:
                        try:
                            self.frame_callback(payload)
                        except Exception as cb_err:
                            logger.error(
                                "[%s] Error in downstream frame callback: %s",
                                self.config.id,
                                str(cb_err),
                                exc_info=True,
                            )
                else:
                    self.health_tracker.record_frame(sampled=False)

        finally:
            cap.release()
            logger.info("[%s] VideoCapture released", self.config.id)
