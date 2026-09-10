// ==============================================================================
// Evidence Domain & Integrity Verification Types
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 11 & Phase 5A Specification)
// ==============================================================================

export interface EvidenceInspection {
  id: string;
  sighting_id: string;
  source_type: 'SIGHTING' | 'ALERT' | string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  stored_sha256: string;
  computed_sha256?: string;
  created_at: string;
  retention_days: number;
  verification_status: 'INTEGRITY_VERIFIED' | 'INTEGRITY_BREACH' | 'VERIFICATION_UNAVAILABLE';
  integrity_match: boolean;
  tamper_detected: boolean;
  legal_admissibility_notice: string;
  sighting?: {
    plate_normalized: string;
    camera_id: string;
    timestamp: string;
    confidence: number;
    consensus_frames: number;
  };
}
