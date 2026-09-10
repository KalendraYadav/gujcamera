"""
Canonical Domain Event Package (Phase 3F)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 7
"""

from app.events.contract import (
    EVENT_TYPE_SIGHTING_CREATED,
    SCHEMA_VERSION,
    VehicleSightingCreatedEvent,
)
from app.events.publisher import RedisEventPublisher

__all__ = [
    "SCHEMA_VERSION",
    "EVENT_TYPE_SIGHTING_CREATED",
    "VehicleSightingCreatedEvent",
    "RedisEventPublisher",
]
