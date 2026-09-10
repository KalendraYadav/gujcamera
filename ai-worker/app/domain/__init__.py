"""
Domain Models and Linkage Package (Phase 3E)
"""

from app.domain.converter import convert_consensus_to_domain
from app.domain.models import EvidenceRecord, VehicleRecord, VehicleSightingRecord
from app.domain.repository import BaseDomainRepository, InMemoryDomainRepository

__all__ = [
    "VehicleRecord",
    "VehicleSightingRecord",
    "EvidenceRecord",
    "convert_consensus_to_domain",
    "BaseDomainRepository",
    "InMemoryDomainRepository",
]
