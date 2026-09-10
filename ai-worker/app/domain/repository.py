"""
Domain Persistence Repository Interface (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 6.2

Defines domain persistence contracts and provides an in-memory repository for test isolation.
"""

from abc import ABC, abstractmethod
import logging
import threading
from typing import Dict, List, Optional

from app.domain.models import EvidenceRecord, VehicleRecord, VehicleSightingRecord

logger = logging.getLogger("ai_worker.domain")


class BaseDomainRepository(ABC):
    """Abstract repository for persisting canonical police domain records"""

    @abstractmethod
    def save_sighting(
        self,
        sighting: VehicleSightingRecord,
        evidence: Optional[EvidenceRecord] = None,
    ) -> bool:
        """Persist a canonical vehicle sighting and optional linked evidence record"""
        pass

    @abstractmethod
    def get_sighting(self, sighting_id: str) -> Optional[VehicleSightingRecord]:
        """Fetch a sighting by its primary UUID"""
        pass

    @abstractmethod
    def get_evidence_by_sighting(self, sighting_id: str) -> Optional[EvidenceRecord]:
        """Fetch the evidence record linked to a sighting ID"""
        pass

    @abstractmethod
    def get_sightings_by_plate(self, plate_normalized: str) -> List[VehicleSightingRecord]:
        """Fetch all sightings for a normalized license plate"""
        pass


class InMemoryDomainRepository(BaseDomainRepository):
    """
    Thread-safe in-memory domain repository implementation.
    Used for unit testing, fixture benchmarks, and isolated local pipeline validation.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._sightings: Dict[str, VehicleSightingRecord] = {}
        self._evidence: Dict[str, EvidenceRecord] = {}  # Keyed by evidence.id
        self._sighting_to_evidence: Dict[str, str] = {}  # sighting_id -> evidence_id
        self._plate_to_sightings: Dict[str, List[str]] = {}  # plate -> [sighting_ids]

    def save_sighting(
        self,
        sighting: VehicleSightingRecord,
        evidence: Optional[EvidenceRecord] = None,
    ) -> bool:
        if sighting is None or not sighting.id:
            return False

        with self._lock:
            self._sightings[sighting.id] = sighting

            if sighting.plate_normalized not in self._plate_to_sightings:
                self._plate_to_sightings[sighting.plate_normalized] = []
            self._plate_to_sightings[sighting.plate_normalized].append(sighting.id)

            if evidence is not None and evidence.id:
                self._evidence[evidence.id] = evidence
                self._sighting_to_evidence[sighting.id] = evidence.id

        return True

    def get_sighting(self, sighting_id: str) -> Optional[VehicleSightingRecord]:
        with self._lock:
            return self._sightings.get(sighting_id)

    def get_evidence_by_sighting(self, sighting_id: str) -> Optional[EvidenceRecord]:
        with self._lock:
            ev_id = self._sighting_to_evidence.get(sighting_id)
            return self._evidence.get(ev_id) if ev_id else None

    def get_sightings_by_plate(self, plate_normalized: str) -> List[VehicleSightingRecord]:
        with self._lock:
            sighting_ids = self._plate_to_sightings.get(plate_normalized, [])
            return [self._sightings[sid] for sid in sighting_ids if sid in self._sightings]

    def clear(self) -> None:
        """Reset all in-memory domain tables"""
        with self._lock:
            self._sightings.clear()
            self._evidence.clear()
            self._sighting_to_evidence.clear()
            self._plate_to_sightings.clear()

    @property
    def total_sightings(self) -> int:
        with self._lock:
            return len(self._sightings)

    @property
    def total_evidence_records(self) -> int:
        with self._lock:
            return len(self._evidence)
