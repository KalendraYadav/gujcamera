"""
Dynamic Stream Dispatcher for AI Vision Worker
Allows the AI worker to dynamically start and stop RTSP stream consumers
via Redis Pub/Sub control events and Redis Hash state synchronization,
without requiring a process restart.
"""

import json
import logging
import threading
import time
from typing import Callable, Dict, List, Optional
import redis

from app.config import CameraConfig
from app.frame_contract import FramePayload
from app.health import CameraHealthTracker, StreamStatus, worker_health
from app.stream_consumer import StreamConsumer

logger = logging.getLogger("ai_worker.stream_dispatcher")


class DynamicStreamDispatcher:
    """
    Manages active StreamConsumer instances dynamically.
    Listens to Redis Pub/Sub control channel for ACTIVATE/DEACTIVATE events
    and syncs initial/recovered state from Redis active-streams hash.
    """

    def __init__(
        self,
        sample_fps: float = 3.0,
        base_reconnect_delay: float = 2.0,
        max_reconnect_delay: float = 30.0,
        decode_failure_threshold: int = 5,
        frame_callback: Optional[Callable[[FramePayload], None]] = None,
        redis_host: str = "localhost",
        redis_port: int = 6379,
        redis_password: str = "",
        control_channel: str = "gujcamera:control:camera-events",
        registry_hash: str = "gujcamera:registry:active-streams",
        enabled: bool = True,
        max_concurrent_streams: int = 50,
    ):
        self.sample_fps = sample_fps
        self.base_reconnect_delay = base_reconnect_delay
        self.max_reconnect_delay = max_reconnect_delay
        self.decode_failure_threshold = decode_failure_threshold
        self.frame_callback = frame_callback

        self.redis_host = redis_host
        self.redis_port = redis_port
        self.redis_password = redis_password
        self.control_channel = control_channel
        self.registry_hash = registry_hash
        self.enabled = enabled
        self.max_concurrent_streams = max_concurrent_streams

        self.consumers: Dict[str, StreamConsumer] = {}
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._listener_thread: Optional[threading.Thread] = None

    def add_camera(self, camera_id: str, stream_url: str) -> bool:
        """
        Dynamically add or update an active camera stream consumer.
        If already running with the exact same URL, no action needed.
        """
        if not camera_id or not stream_url:
            logger.warning("[DISPATCHER] Invalid camera_id or stream_url provided: %s -> %s", camera_id, stream_url)
            return False

        with self._lock:
            existing = self.consumers.get(camera_id)
            if existing is not None:
                if existing.config.url == stream_url and existing.is_running():
                    logger.debug("[DISPATCHER] Camera %s already running with matching URL", camera_id)
                    return True
                # URL changed or stopped: stop existing consumer
                logger.info("[DISPATCHER] Stopping previous consumer for camera %s", camera_id)
                existing.stop(timeout=2.0)
                del self.consumers[camera_id]
            elif len(self.consumers) >= self.max_concurrent_streams:
                logger.warning(
                    "[DISPATCHER] Concurrency limit reached (%d/%d streams). Rejecting new stream for [%s] to preserve system stability.",
                    len(self.consumers),
                    self.max_concurrent_streams,
                    camera_id,
                )
                return False

            # Initialize new consumer
            cfg = CameraConfig(id=camera_id, url=stream_url)
            tracker = worker_health.get_or_create_camera(camera_id)
            consumer = StreamConsumer(
                config=cfg,
                health_tracker=tracker,
                sample_fps=self.sample_fps,
                base_reconnect_delay=self.base_reconnect_delay,
                max_reconnect_delay=self.max_reconnect_delay,
                decode_failure_threshold=self.decode_failure_threshold,
                frame_callback=self.frame_callback,
            )
            self.consumers[camera_id] = consumer
            consumer.start()
            logger.info(
                "[DISPATCHER] Successfully activated dynamic stream consumer for [%s] -> %s",
                camera_id,
                cfg.sanitized_url(),
            )
            return True

    def remove_camera(self, camera_id: str) -> bool:
        """
        Dynamically stop and remove an active camera stream consumer.
        """
        with self._lock:
            consumer = self.consumers.get(camera_id)
            if consumer is None:
                logger.debug("[DISPATCHER] Camera %s not currently managed", camera_id)
                return False

            logger.info("[DISPATCHER] Deactivating stream consumer for [%s]", camera_id)
            consumer.stop(timeout=2.0)
            del self.consumers[camera_id]
            logger.info("[DISPATCHER] Stream consumer [%s] stopped and removed", camera_id)
            return True

    def get_managed_camera_ids(self) -> List[str]:
        """Return list of all currently registered camera stream IDs"""
        with self._lock:
            return list(self.consumers.keys())

    def get_consumer(self, camera_id: str) -> Optional[StreamConsumer]:
        """Get consumer instance for camera_id if present"""
        with self._lock:
            return self.consumers.get(camera_id)

    def sync_from_redis(self, client: Optional[redis.Redis] = None) -> int:
        """
        Query Redis hash for all active streams and activate any missing or changed streams.
        """
        r = client or self._create_redis_client()
        if r is None:
            return 0

        try:
            entries = r.hgetall(self.registry_hash)
            if not entries:
                return 0

            count = 0
            for cam_id_bytes, data_bytes in entries.items():
                cam_id = cam_id_bytes.decode("utf-8") if isinstance(cam_id_bytes, bytes) else str(cam_id_bytes)
                raw_data = data_bytes.decode("utf-8") if isinstance(data_bytes, bytes) else str(data_bytes)

                stream_url = ""
                try:
                    parsed = json.loads(raw_data)
                    stream_url = parsed.get("internal_url") or parsed.get("stream_url") or ""
                except Exception:
                    # Raw URL string format
                    stream_url = raw_data.strip()

                if stream_url:
                    if self.add_camera(cam_id, stream_url):
                        count += 1

            logger.info("[DISPATCHER] State sync from Redis completed: %d active streams verified", count)
            return count
        except Exception as ex:
            logger.warning("[DISPATCHER] Failed to sync active streams from Redis: %s", ex)
            return 0

    def start_listener(self) -> None:
        """Start background daemon thread listening for Redis control events"""
        if not self.enabled:
            logger.info("[DISPATCHER] Dynamic stream dispatcher Redis listener is disabled")
            return

        if self._listener_thread is not None and self._listener_thread.is_alive():
            return

        self._stop_event.clear()
        self._listener_thread = threading.Thread(
            target=self._run_listener_loop,
            name="StreamDispatcherListener",
            daemon=True,
        )
        self._listener_thread.start()
        logger.info("[DISPATCHER] Redis stream control listener thread started on channel '%s'", self.control_channel)

    def stop(self) -> None:
        """Stop all consumers and terminate listener thread"""
        self._stop_event.set()

        with self._lock:
            logger.info("[DISPATCHER] Stopping %d active stream consumers...", len(self.consumers))
            for cam_id, consumer in list(self.consumers.items()):
                try:
                    consumer.stop(timeout=2.0)
                except Exception as ex:
                    logger.warning("[DISPATCHER] Error stopping consumer %s: %s", cam_id, ex)
            self.consumers.clear()

        if self._listener_thread is not None and self._listener_thread.is_alive():
            self._listener_thread.join(timeout=2.0)
        logger.info("[DISPATCHER] Stream dispatcher shutdown complete")

    def _create_redis_client(self) -> Optional[redis.Redis]:
        try:
            r = redis.Redis(
                host=self.redis_host,
                port=self.redis_port,
                password=self.redis_password if self.redis_password else None,
                socket_timeout=3.0,
                socket_connect_timeout=3.0,
                decode_responses=False,
            )
            r.ping()
            return r
        except Exception as ex:
            logger.warning("[DISPATCHER] Cannot connect to Redis at %s:%d: %s", self.redis_host, self.redis_port, ex)
            return None

    def _run_listener_loop(self) -> None:
        """Background loop subscribing to Redis Pub/Sub for stream management events"""
        reconnect_delay = 2.0

        while not self._stop_event.is_set():
            client = self._create_redis_client()
            if client is None:
                self._stop_event.wait(timeout=reconnect_delay)
                reconnect_delay = min(reconnect_delay * 1.5, 30.0)
                continue

            reconnect_delay = 2.0
            pubsub = None
            try:
                # Sync state from registry hash on initial connect or reconnect
                self.sync_from_redis(client)

                pubsub = client.pubsub()
                pubsub.subscribe(self.control_channel)
                logger.info("[DISPATCHER] Subscribed to Redis channel: %s", self.control_channel)

                while not self._stop_event.is_set():
                    message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    if message is None:
                        continue

                    data_bytes = message.get("data")
                    if not data_bytes:
                        continue

                    try:
                        raw_str = data_bytes.decode("utf-8") if isinstance(data_bytes, bytes) else str(data_bytes)
                        event = json.loads(raw_str)
                        action = event.get("action", "").upper()
                        camera_id = event.get("camera_id")
                        internal_url = event.get("internal_url") or event.get("stream_url")

                        logger.info("[DISPATCHER] Received control event: action=%s, camera_id=%s", action, camera_id)

                        if action == "ACTIVATE" and camera_id and internal_url:
                            self.add_camera(camera_id, internal_url)
                        elif action == "DEACTIVATE" and camera_id:
                            self.remove_camera(camera_id)
                        elif action == "SYNC":
                            self.sync_from_redis(client)
                        else:
                            logger.warning("[DISPATCHER] Unrecognized control event payload: %s", raw_str)
                    except Exception as parse_err:
                        logger.error("[DISPATCHER] Error parsing control event: %s", parse_err)

            except Exception as loop_err:
                if not self._stop_event.is_set():
                    logger.warning("[DISPATCHER] Redis listener connection lost: %s. Reconnecting in 3s...", loop_err)
                    self._stop_event.wait(timeout=3.0)
            finally:
                if pubsub is not None:
                    try:
                        pubsub.close()
                    except Exception:
                        pass
                try:
                    client.close()
                except Exception:
                    pass
