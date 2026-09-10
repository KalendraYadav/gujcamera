"""
Redis Streams Event Publisher (Phase 3F Hardened)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 5.2, Section 7.1 & Section 7.3

Publishes canonical vehicle.sighting_created domain events to Redis Streams.
Preserves Phase 3E false-success guarantee:
Only publishes if consensus was accepted and MinIO evidence was successfully stored.

Provides:
- In-process bounded retry buffer for transient Redis outages
- Exponential/bounded reconnect backoff (no tight looping)
- Zero mutation of event_id, sighting_id, timestamps, or payload during retry
- Graceful error isolation (never crashes the streaming AI worker)
- Honest logging of in-memory PoC buffer limitations upon process shutdown
"""

from collections import deque
import logging
import threading
import time
from typing import Any, Dict, List, Optional

try:
    import redis
    from redis.exceptions import ConnectionError as RedisConnectionError
    from redis.exceptions import RedisError, TimeoutError as RedisTimeoutError
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None
    RedisError = Exception
    RedisConnectionError = Exception
    RedisTimeoutError = Exception

from app.events.contract import VehicleSightingCreatedEvent

logger = logging.getLogger("ai_worker.events.publisher")


class RedisEventPublisher:
    """
    Resilient Redis Streams publisher for AI Worker domain events.
    Includes in-process bounded retry buffer to survive temporary Redis unavailability
    without dropping accepted consensus events.
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        password: Optional[str] = None,
        stream_name: str = "gujcamera:events:vehicle-sightings",
        enabled: bool = True,
        connect_timeout: float = 3.0,
        max_buffer_size: int = 100,
        reconnect_backoff_seconds: float = 2.0,
    ):
        self.host = host
        self.port = port
        self.password = password if password else None
        self.stream_name = stream_name
        self.enabled = enabled
        self.connect_timeout = connect_timeout
        self.max_buffer_size = max_buffer_size
        self._reconnect_backoff_seconds = reconnect_backoff_seconds

        self._client: Optional[Any] = None
        self._lock = threading.Lock()
        self._connected = False
        self._last_connect_attempt: float = 0.0

        # In-process bounded retry buffer for temporary outages
        self._buffer: deque[VehicleSightingCreatedEvent] = deque()

        # Telemetry metrics
        self.total_published: int = 0
        self.total_publish_errors: int = 0
        self.total_buffered: int = 0
        self.total_buffer_drops: int = 0
        self.total_retried_success: int = 0
        self.last_published_at: Optional[float] = None
        self.last_error_message: Optional[str] = None

        if self.enabled and REDIS_AVAILABLE:
            self._try_connect()
        elif not REDIS_AVAILABLE and self.enabled:
            logger.warning("redis-py library is not installed. Event publishing will be disabled.")
            self.enabled = False

    def _try_connect(self) -> bool:
        """Attempt to establish or ping connection to Redis server with backoff check"""
        now = time.time()
        if now - self._last_connect_attempt < self._reconnect_backoff_seconds:
            return self._connected

        self._last_connect_attempt = now

        if not REDIS_AVAILABLE:
            self._connected = False
            return False

        try:
            if self._client is None:
                self._client = redis.Redis(
                    host=self.host,
                    port=self.port,
                    password=self.password,
                    socket_connect_timeout=self.connect_timeout,
                    socket_timeout=self.connect_timeout,
                    decode_responses=True,
                )
            self._client.ping()
            self._connected = True
            logger.info(
                "Connected to Redis at %s:%d (stream: %s)",
                self.host,
                self.port,
                self.stream_name,
            )
            return True
        except (RedisConnectionError, RedisTimeoutError, Exception) as conn_err:
            self._connected = False
            self.last_error_message = str(conn_err)
            logger.warning(
                "Failed to connect to Redis at %s:%d: %s. Reconnect backoff is %.1fs.",
                self.host,
                self.port,
                str(conn_err),
                self._reconnect_backoff_seconds,
            )
            return False

    def is_connected(self) -> bool:
        """Check if Redis connection is active"""
        if not self.enabled or not REDIS_AVAILABLE:
            return False
        with self._lock:
            if not self._connected or self._client is None:
                return self._try_connect()
            try:
                self._client.ping()
                return True
            except Exception:
                self._connected = False
                return False

    def _publish_raw(self, event: VehicleSightingCreatedEvent) -> Optional[str]:
        """Low-level XADD publication without buffer manipulation (must be called with _lock held)"""
        if self._client is None or not self._connected:
            return None

        entry_payload: Dict[str, str] = {
            "event_id": event.event_id,
            "event_type": event.event_type,
            "schema_version": event.schema_version,
            "sighting_id": event.sighting_id,
            "evidence_id": event.evidence_id,
            "camera_id": event.camera_id,
            "plate_normalized": event.plate_normalized,
            "data": event.to_json(),
        }

        try:
            msg_id = self._client.xadd(self.stream_name, entry_payload)
            self.last_published_at = time.time()
            return str(msg_id)
        except (RedisConnectionError, RedisTimeoutError) as net_err:
            self._connected = False
            self.total_publish_errors += 1
            self.last_error_message = str(net_err)
            logger.error(
                "[%s] Redis network failure publishing event %s: %s",
                event.camera_id,
                event.event_id,
                str(net_err),
            )
            return None
        except Exception as ex:
            self.total_publish_errors += 1
            self.last_error_message = str(ex)
            logger.error(
                "[%s] Redis error publishing event %s: %s",
                event.camera_id,
                event.event_id,
                str(ex),
            )
            return None

    def flush_buffer(self) -> int:
        """
        Flush previously buffered events in FIFO order when Redis connectivity is restored.
        Preserves original event_id, sighting_id, evidence_hash, and payload.

        Returns:
            Number of events successfully flushed and published.
        """
        flushed_count = 0
        with self._lock:
            if not self._buffer:
                return 0

            if not self._connected or self._client is None:
                if not self._try_connect():
                    return 0

            logger.info("Attempting to flush %d buffered sighting events to Redis...", len(self._buffer))

            while self._buffer:
                event = self._buffer[0]
                msg_id = self._publish_raw(event)
                if msg_id:
                    self._buffer.popleft()
                    self.total_published += 1
                    self.total_retried_success += 1
                    flushed_count += 1
                    logger.info(
                        "[%s] Successfully flushed buffered event %s (sighting: %s): message_id=%s",
                        event.camera_id,
                        event.event_id,
                        event.sighting_id,
                        msg_id,
                    )
                else:
                    logger.warning(
                        "Failed to flush buffered event %s. Keeping in buffer (remaining: %d). Backing off.",
                        event.event_id,
                        len(self._buffer),
                    )
                    break

        return flushed_count

    def publish_sighting(self, event: VehicleSightingCreatedEvent) -> Optional[str]:
        """
        Publish a validated VehicleSightingCreatedEvent to the configured Redis Stream.
        If Redis is temporarily unavailable, buffers the event in-process for automatic retry.

        Args:
            event: Validated VehicleSightingCreatedEvent instance

        Returns:
            Redis stream message ID (e.g., '1710000000000-0') if published immediately,
            or None if buffered for retry or disabled.
        """
        if not self.enabled:
            logger.debug("Redis publishing is disabled; skipping event %s", event.event_id)
            return None

        # Validate event contract invariants
        try:
            event.validate()
        except ValueError as val_err:
            logger.error("Rejecting invalid event %s: %s", getattr(event, "event_id", "UNKNOWN"), str(val_err))
            with self._lock:
                self.total_publish_errors += 1
            return None

        with self._lock:
            # 1. Attempt to flush any previously buffered events if Redis is active
            if self._buffer:
                # Release lock briefly by calling helper logic directly inline
                if self._connected or self._try_connect():
                    while self._buffer:
                        buffered_ev = self._buffer[0]
                        m_id = self._publish_raw(buffered_ev)
                        if m_id:
                            self._buffer.popleft()
                            self.total_published += 1
                            self.total_retried_success += 1
                            logger.info(
                                "[%s] Flushed buffered event %s (sighting: %s): msg_id=%s",
                                buffered_ev.camera_id,
                                buffered_ev.event_id,
                                buffered_ev.sighting_id,
                                m_id,
                            )
                        else:
                            break

            # 2. Try to connect if currently disconnected
            if not self._connected or self._client is None:
                self._try_connect()

            # 3. If connected, attempt direct publication
            if self._connected and self._client is not None:
                message_id = self._publish_raw(event)
                if message_id:
                    self.total_published += 1
                    logger.info(
                        "[%s] Published %s (sighting: %s, plate: %s, sha256: %s...): message_id=%s",
                        event.camera_id,
                        event.event_type,
                        event.sighting_id,
                        event.plate_normalized,
                        event.evidence_hash[:12] if event.evidence_hash else "none",
                        message_id,
                    )
                    return message_id
            else:
                self.total_publish_errors += 1

            # 4. Redis is unavailable or publish failed: Buffer event in memory for bounded retry
            if len(self._buffer) >= self.max_buffer_size:
                dropped = self._buffer.popleft()
                self.total_buffer_drops += 1
                logger.error(
                    "Redis publisher buffer capacity reached (%d). Dropping oldest event %s (sighting: %s).",
                    self.max_buffer_size,
                    dropped.event_id,
                    dropped.sighting_id,
                )

            self._buffer.append(event)
            self.total_buffered += 1
            logger.warning(
                "[%s] Sighting event %s buffered for retry (buffer: %d/%d). Sighting ID: %s",
                event.camera_id,
                event.event_id,
                len(self._buffer),
                self.max_buffer_size,
                event.sighting_id,
            )
            return None

    @property
    def buffer_size(self) -> int:
        with self._lock:
            return len(self._buffer)

    def close(self) -> None:
        """Close connection to Redis and log buffer state"""
        with self._lock:
            if len(self._buffer) > 0:
                logger.warning(
                    "AI Worker shutdown with %d unflushed sighting event(s) in memory buffer. "
                    "These events are lost (in-memory PoC limitation; persistent outbox deferred to production).",
                    len(self._buffer),
                )
            if self._client is not None:
                try:
                    self._client.close()
                except Exception:
                    pass
                self._client = None
            self._connected = False
