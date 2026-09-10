"""
Automated Test Suite for Redis Streams Event Publisher & Contracts (Phase 3F)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026

Tests:
1. Valid event creation, serialization, and deserialization
2. Schema version validation and rejection of unsupported versions
3. Field invariant constraints (hash length, storage ref, confidence range)
4. Event publish success via RedisEventPublisher (with Mock Redis)
5. Resilience when Redis is unavailable or times out (never crashes worker)
6. Prevention of raw video/frame transmission through Redis
7. Integration with InferencePipeline:
   - Accepted consensus + MinIO success -> Event published
   - Rejected consensus -> No event published
   - MinIO storage failure -> No event published (Phase 3E false-success guarantee)
"""

from datetime import datetime, timezone
import json
import time
from unittest.mock import MagicMock, patch
import numpy as np
import pytest

from app.consensus import ConsensusResult, ConsensusStatus
from app.detection_contract import (
    BoundingBox,
    DetectedObject,
    DetectedPlate,
    VehicleClass,
)
from app.detector import BasePlateDetector, BaseVehicleDetector, InferencePipeline
from app.events import (
    EVENT_TYPE_SIGHTING_CREATED,
    SCHEMA_VERSION,
    RedisEventPublisher,
    VehicleSightingCreatedEvent,
)
from app.evidence import EvidenceArtifact, EvidenceSnapshotGenerator, EvidenceStorageResult
from app.frame_contract import FramePayload
from app.ocr import MockOCREngine


# ---------------------------------------------------------------------------
# Test Fixtures & Mock Helpers
# ---------------------------------------------------------------------------

VALID_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
VALID_STORAGE_REF = "s3://police-evidence-vault/evidence/2026/09/10/CAM-AHM-01/snap.jpg"


def create_dummy_frame(h: int = 480, w: int = 640) -> np.ndarray:
    return np.zeros((h, w, 3), dtype=np.uint8)


class DummyVehicleDetector(BaseVehicleDetector):
    def __init__(self, vehicles=None):
        self._vehicles = vehicles if vehicles is not None else []

    def is_ready(self) -> bool:
        return True

    def detect(self, frame):
        return self._vehicles


class DummyPlateDetector(BasePlateDetector):
    def __init__(self, plates=None, mode_name="HEURISTIC_PLATE_LOCALIZER"):
        self._plates = plates if plates is not None else []
        self._mode_name = mode_name

    def localize(self, frame, vehicles):
        return self._plates

    @property
    def mode_name(self) -> str:
        return self._mode_name


# ---------------------------------------------------------------------------
# Contract Unit Tests
# ---------------------------------------------------------------------------

def test_valid_event_serialization():
    """Verify event creation, dict conversion, and JSON roundtrip"""
    event = VehicleSightingCreatedEvent.create(
        sighting_id="sighting-uuid-1",
        evidence_id="evidence-uuid-1",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB1234",
        confidence=0.9543,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476800.0,
    )

    assert event.schema_version == SCHEMA_VERSION
    assert event.event_type == EVENT_TYPE_SIGHTING_CREATED
    assert event.plate_normalized == "GJ01AB1234"
    assert event.confidence == 0.9543
    assert event.consensus_of == 5

    # Test serialization to JSON
    json_str = event.to_json()
    assert "GJ01AB1234" in json_str
    assert VALID_SHA256 in json_str

    # Test deserialization
    deserialized = VehicleSightingCreatedEvent.from_json(json_str)
    assert deserialized.event_id == event.event_id
    assert deserialized.sighting_id == event.sighting_id
    assert deserialized.evidence_id == event.evidence_id
    assert deserialized.evidence_hash == event.evidence_hash
    assert deserialized.storage_ref == event.storage_ref


def test_schema_version_validation():
    """Verify that an unsupported schema version raises ValueError"""
    with pytest.raises(ValueError, match="Unsupported schema version '2.0'"):
        VehicleSightingCreatedEvent(
            event_id="evt-1",
            event_type=EVENT_TYPE_SIGHTING_CREATED,
            schema_version="2.0",  # Unsupported
            occurred_at="2026-09-10T00:00:00Z",
            producer="ai-worker",
            sighting_id="s-1",
            evidence_id="e-1",
            camera_id="CAM-AHM-01",
            plate_normalized="GJ01AB1234",
            confidence=0.9,
            consensus_of=5,
            total_observations=5,
            storage_ref=VALID_STORAGE_REF,
            evidence_hash=VALID_SHA256,
            captured_at="2026-09-10T00:00:00Z",
            correlation_id="corr-1",
        )


def test_event_invariant_constraints():
    """Verify constraint validation: hash format, confidence bounds, storage_ref"""
    # Bad SHA-256 hash
    with pytest.raises(ValueError, match="64-character SHA-256"):
        VehicleSightingCreatedEvent.create(
            sighting_id="s-1",
            evidence_id="e-1",
            camera_id="CAM-AHM-01",
            plate_normalized="GJ01AB1234",
            confidence=0.9,
            consensus_of=5,
            total_observations=5,
            storage_ref=VALID_STORAGE_REF,
            evidence_hash="short-hash",
            captured_at_ts=1757476800.0,
        )

    # Bad confidence
    with pytest.raises(ValueError, match="confidence must be between 0.0 and 1.0"):
        VehicleSightingCreatedEvent.create(
            sighting_id="s-1",
            evidence_id="e-1",
            camera_id="CAM-AHM-01",
            plate_normalized="GJ01AB1234",
            confidence=1.5,
            consensus_of=5,
            total_observations=5,
            storage_ref=VALID_STORAGE_REF,
            evidence_hash=VALID_SHA256,
            captured_at_ts=1757476800.0,
        )

    # Invalid storage reference
    with pytest.raises(ValueError, match="Invalid evidence storage reference"):
        VehicleSightingCreatedEvent.create(
            sighting_id="s-1",
            evidence_id="e-1",
            camera_id="CAM-AHM-01",
            plate_normalized="GJ01AB1234",
            confidence=0.9,
            consensus_of=5,
            total_observations=5,
            storage_ref="ftp://invalid-server/file.jpg",
            evidence_hash=VALID_SHA256,
            captured_at_ts=1757476800.0,
        )


def test_no_raw_frames_in_event_payload():
    """Verify that event payload contains only reference metadata, never binary frame data"""
    event = VehicleSightingCreatedEvent.create(
        sighting_id="s-1",
        evidence_id="e-1",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB1234",
        confidence=0.95,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476800.0,
    )
    payload_dict = event.to_dict()

    # Verify absence of binary fields or large payloads
    assert "frame" not in payload_dict
    assert "jpeg" not in payload_dict
    assert "image" not in payload_dict
    assert len(event.to_json()) < 1024, "Event JSON must remain lightweight (<1KB)"


# ---------------------------------------------------------------------------
# Redis Publisher Unit Tests
# ---------------------------------------------------------------------------

def test_redis_publisher_success():
    """Verify successful event publishing via XADD with mock Redis client"""
    mock_redis = MagicMock()
    mock_redis.ping.return_value = True
    mock_redis.xadd.return_value = "1710000000000-0"

    publisher = RedisEventPublisher(
        host="localhost",
        port=6379,
        stream_name="gujcamera:events:vehicle-sightings",
        enabled=True,
    )
    publisher._client = mock_redis
    publisher._connected = True

    event = VehicleSightingCreatedEvent.create(
        sighting_id="sighting-123",
        evidence_id="evidence-456",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB1234",
        confidence=0.95,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476800.0,
    )

    msg_id = publisher.publish_sighting(event)
    assert msg_id == "1710000000000-0"
    assert publisher.total_published == 1
    assert publisher.total_publish_errors == 0

    # Verify xadd arguments
    mock_redis.xadd.assert_called_once()
    args, kwargs = mock_redis.xadd.call_args
    assert args[0] == "gujcamera:events:vehicle-sightings"
    entry = args[1]
    assert entry["event_id"] == event.event_id
    assert entry["event_type"] == EVENT_TYPE_SIGHTING_CREATED
    assert entry["schema_version"] == "1.0"
    assert "data" in entry


def test_redis_publisher_offline_resilience():
    """Verify publisher does not crash and increments error count when Redis is unreachable"""
    publisher = RedisEventPublisher(
        host="127.0.0.1",
        port=9999,  # Non-existent port
        enabled=True,
        connect_timeout=0.2,
    )
    publisher._connected = False
    publisher._client = None

    event = VehicleSightingCreatedEvent.create(
        sighting_id="sighting-123",
        evidence_id="evidence-456",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB1234",
        confidence=0.95,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476800.0,
    )

    # Should not raise exception
    msg_id = publisher.publish_sighting(event)
    assert msg_id is None
    assert publisher.total_publish_errors == 1
    assert publisher.total_published == 0


def test_redis_publisher_timeout_handling():
    """Verify that socket timeout is caught cleanly and recorded"""
    from redis.exceptions import TimeoutError as RedisTimeoutError

    mock_redis = MagicMock()
    mock_redis.ping.return_value = True
    mock_redis.xadd.side_effect = RedisTimeoutError("Connection timed out")

    publisher = RedisEventPublisher(
        host="localhost",
        port=6379,
        enabled=True,
    )
    publisher._client = mock_redis
    publisher._connected = True

    event = VehicleSightingCreatedEvent.create(
        sighting_id="s-1",
        evidence_id="e-1",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB1234",
        confidence=0.95,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476800.0,
    )

    msg_id = publisher.publish_sighting(event)
    assert msg_id is None
    assert publisher.total_publish_errors == 1
    assert publisher.buffer_size == 1
    assert "timed out" in publisher.last_error_message.lower()


def test_redis_publisher_retry_buffer_preserves_payload_and_recovers():
    """
    Verify failure recovery policy:
    1. First publish fails due to transient Redis error -> Event buffered
    2. event_id, sighting_id, and payload remain strictly unchanged
    3. Redis recovers -> Buffer flushes successfully
    """
    mock_redis = MagicMock()
    # First ping/connect fails
    mock_redis.ping.side_effect = [Exception("Redis offline"), True, True]
    mock_redis.xadd.return_value = "1710000000000-0"

    publisher = RedisEventPublisher(
        host="localhost",
        port=6379,
        enabled=True,
        reconnect_backoff_seconds=0.01,
    )
    publisher._client = mock_redis
    publisher._connected = False

    event = VehicleSightingCreatedEvent.create(
        sighting_id="sighting-fixed-uuid",
        evidence_id="evidence-fixed-uuid",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB1234",
        confidence=0.96,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476800.0,
    )

    orig_event_id = event.event_id
    orig_sighting_id = event.sighting_id
    orig_payload_json = event.to_json()

    # Attempt publish while Redis offline -> buffered
    msg_id = publisher.publish_sighting(event)
    assert msg_id is None
    assert publisher.buffer_size == 1
    assert publisher.total_buffered == 1

    # Verify event inside buffer is completely identical (immutable)
    buffered_event = publisher._buffer[0]
    assert buffered_event.event_id == orig_event_id
    assert buffered_event.sighting_id == orig_sighting_id
    assert buffered_event.to_json() == orig_payload_json

    # Redis recovers: flush buffer
    time.sleep(0.02)  # Wait past backoff
    flushed = publisher.flush_buffer()
    assert flushed == 1
    assert publisher.buffer_size == 0
    assert publisher.total_retried_success == 1
    assert publisher.total_published == 1

    # Verify xadd received the exact original payload
    mock_redis.xadd.assert_called_once()
    xadd_args = mock_redis.xadd.call_args[0]
    entry = xadd_args[1]
    assert entry["event_id"] == orig_event_id
    assert entry["sighting_id"] == orig_sighting_id
    assert entry["data"] == orig_payload_json


def test_redis_publisher_bounded_buffer_overflow_handling():
    """Verify that buffer enforces max_buffer_size and safely drops oldest events when full"""
    publisher = RedisEventPublisher(
        host="127.0.0.1",
        port=9999,
        enabled=True,
        max_buffer_size=2,  # Bounded to 2 events
        connect_timeout=0.1,
        reconnect_backoff_seconds=10.0,
    )
    publisher._connected = False
    publisher._client = None

    ev1 = VehicleSightingCreatedEvent.create(
        sighting_id="s-1",
        evidence_id="e-1",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB1111",
        confidence=0.9,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476800.0,
    )
    ev2 = VehicleSightingCreatedEvent.create(
        sighting_id="s-2",
        evidence_id="e-2",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB2222",
        confidence=0.9,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476801.0,
    )
    ev3 = VehicleSightingCreatedEvent.create(
        sighting_id="s-3",
        evidence_id="e-3",
        camera_id="CAM-AHM-01",
        plate_normalized="GJ01AB3333",
        confidence=0.9,
        consensus_of=5,
        total_observations=5,
        storage_ref=VALID_STORAGE_REF,
        evidence_hash=VALID_SHA256,
        captured_at_ts=1757476802.0,
    )

    publisher.publish_sighting(ev1)
    publisher.publish_sighting(ev2)
    assert publisher.buffer_size == 2
    assert publisher.total_buffer_drops == 0

    # ev3 causes overflow: drops ev1
    publisher.publish_sighting(ev3)
    assert publisher.buffer_size == 2
    assert publisher.total_buffer_drops == 1

    # Buffer should now hold ev2 and ev3
    assert publisher._buffer[0].sighting_id == "s-2"
    assert publisher._buffer[1].sighting_id == "s-3"


def test_redis_publisher_backoff_avoids_tight_loop():
    """Verify that reconnect attempts respect backoff delay rather than tight looping"""
    mock_redis = MagicMock()
    mock_redis.ping.side_effect = Exception("Offline")

    publisher = RedisEventPublisher(
        host="localhost",
        port=6379,
        enabled=True,
        reconnect_backoff_seconds=1.0,  # 1 second backoff
    )
    publisher._client = mock_redis
    publisher._connected = False
    publisher._last_connect_attempt = 0.0

    # Attempt connection
    assert publisher._try_connect() is False
    assert mock_redis.ping.call_count == 1

    # Immediate second call before backoff elapses should return without pinging
    assert publisher._try_connect() is False
    assert mock_redis.ping.call_count == 1, "Must not ping Redis within backoff window"


# ---------------------------------------------------------------------------
# Pipeline Integration Tests
# ---------------------------------------------------------------------------

def test_pipeline_accepted_consensus_publishes_event():
    """Verify that accepted consensus with successful storage emits vehicle.sighting_created"""
    frame = create_dummy_frame()
    v = DetectedObject(object_id="v1", vehicle_class=VehicleClass.CAR, confidence=0.9, bbox=BoundingBox(50, 50, 200, 200))
    p = DetectedPlate(plate_id="p1", bbox=BoundingBox(60, 60, 100, 90), confidence=0.85, vehicle_id="v1")

    mock_publisher = MagicMock(spec=RedisEventPublisher)
    mock_publisher.publish_sighting.return_value = "msg-1"

    mock_vault = MagicMock()
    mock_vault.store_artifact.return_value = EvidenceStorageResult(
        success=True,
        bucket="police-evidence-vault",
        object_key="evidence/2026/09/10/CAM-AHM-01/snap.jpg",
        storage_ref=VALID_STORAGE_REF,
        sha256_hash=VALID_SHA256,
        upload_latency_ms=10.0,
    )

    snapshot_gen = EvidenceSnapshotGenerator()

    mock_consensus = MagicMock()
    accepted_res = ConsensusResult(
        status=ConsensusStatus.ACCEPTED,
        camera_id="CAM-AHM-01",
        consensus_plate="GJ01AB1234",
        consensus_confidence=0.92,
        consensus_of=5,
        total_window_observations=5,
        best_frame=frame,
        best_frame_sequence=1,
        best_frame_confidence=0.95,
        first_observed_ts=1757476800.0,
        last_observed_ts=1757476801.0,
    )
    mock_consensus.add_observation.return_value = accepted_res

    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([v]),
        plate_detector=DummyPlateDetector([p]),
        ocr_engine=MockOCREngine(default_text="GJ01AB1234", default_confidence=0.95),
        consensus_aggregator=mock_consensus,
        snapshot_generator=snapshot_gen,
        evidence_vault=mock_vault,
        event_publisher=mock_publisher,
    )

    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=1,
        captured_at=1757476800.0,
        sampled_at=1757476800.1,
        width=640,
        height=480,
        frame=frame,
    )

    pipeline.process_frame(payload)

    # Event publisher must have been called
    mock_publisher.publish_sighting.assert_called_once()
    published_event: VehicleSightingCreatedEvent = mock_publisher.publish_sighting.call_args[0][0]

    assert published_event.event_type == EVENT_TYPE_SIGHTING_CREATED
    assert published_event.plate_normalized == "GJ01AB1234"
    assert published_event.storage_ref == VALID_STORAGE_REF
    assert len(published_event.evidence_hash) == 64
    assert int(published_event.evidence_hash, 16) > 0
    assert published_event.consensus_of == 5
    assert pipeline.total_events_published == 1


def test_pipeline_rejected_consensus_produces_no_event():
    """Verify that rejected consensus emits NO event and NO domain record"""
    frame = create_dummy_frame()
    v = DetectedObject(object_id="v1", vehicle_class=VehicleClass.CAR, confidence=0.9, bbox=BoundingBox(50, 50, 200, 200))
    p = DetectedPlate(plate_id="p1", bbox=BoundingBox(60, 60, 100, 90), confidence=0.85, vehicle_id="v1")

    mock_publisher = MagicMock(spec=RedisEventPublisher)
    mock_vault = MagicMock()

    mock_consensus = MagicMock()
    rejected_res = ConsensusResult(
        status=ConsensusStatus.REJECTED,
        camera_id="CAM-AHM-01",
        consensus_plate=None,
        consensus_confidence=0.0,
        consensus_of=0,
        total_window_observations=5,
        rejection_reason="Character agreement ratio below threshold",
    )
    mock_consensus.add_observation.return_value = rejected_res

    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([v]),
        plate_detector=DummyPlateDetector([p]),
        ocr_engine=MockOCREngine(default_text="GJ01AB1234", default_confidence=0.5),
        consensus_aggregator=mock_consensus,
        evidence_vault=mock_vault,
        event_publisher=mock_publisher,
    )

    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=1,
        captured_at=1757476800.0,
        sampled_at=1757476800.1,
        width=640,
        height=480,
        frame=frame,
    )

    pipeline.process_frame(payload)

    # Invariant: NO event emitted, NO storage called
    mock_publisher.publish_sighting.assert_not_called()
    mock_vault.store_artifact.assert_not_called()
    assert pipeline.total_events_published == 0


def test_pipeline_minio_storage_failure_produces_no_event():
    """
    Verify Phase 3E false-success guarantee:
    If MinIO storage fails, do NOT publish event to Redis even if consensus was accepted.
    """
    frame = create_dummy_frame()
    v = DetectedObject(object_id="v1", vehicle_class=VehicleClass.CAR, confidence=0.9, bbox=BoundingBox(50, 50, 200, 200))
    p = DetectedPlate(plate_id="p1", bbox=BoundingBox(60, 60, 100, 90), confidence=0.85, vehicle_id="v1")

    mock_publisher = MagicMock(spec=RedisEventPublisher)

    # MinIO upload FAILS
    mock_vault = MagicMock()
    mock_vault.store_artifact.return_value = EvidenceStorageResult(
        success=False,
        bucket="police-evidence-vault",
        object_key="evidence/2026/09/10/CAM-AHM-01/snap.jpg",
        error_code="STORAGE_TIMEOUT",
        error_message="MinIO connection timed out",
    )

    snapshot_gen = EvidenceSnapshotGenerator()

    mock_consensus = MagicMock()
    accepted_res = ConsensusResult(
        status=ConsensusStatus.ACCEPTED,
        camera_id="CAM-AHM-01",
        consensus_plate="GJ01AB1234",
        consensus_confidence=0.92,
        consensus_of=5,
        total_window_observations=5,
        best_frame=frame,
        best_frame_sequence=1,
        best_frame_confidence=0.95,
        first_observed_ts=1757476800.0,
        last_observed_ts=1757476801.0,
    )
    mock_consensus.add_observation.return_value = accepted_res

    pipeline = InferencePipeline(
        vehicle_detector=DummyVehicleDetector([v]),
        plate_detector=DummyPlateDetector([p]),
        ocr_engine=MockOCREngine(default_text="GJ01AB1234", default_confidence=0.95),
        consensus_aggregator=mock_consensus,
        snapshot_generator=snapshot_gen,
        evidence_vault=mock_vault,
        event_publisher=mock_publisher,
    )

    payload = FramePayload(
        camera_id="CAM-AHM-01",
        frame_index=1,
        captured_at=1757476800.0,
        sampled_at=1757476800.1,
        width=640,
        height=480,
        frame=frame,
    )

    pipeline.process_frame(payload)

    # Invariant: NO event emitted when storage fails!
    mock_publisher.publish_sighting.assert_not_called()
    assert pipeline.total_events_published == 0
