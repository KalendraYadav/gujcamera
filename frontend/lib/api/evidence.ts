// ==============================================================================
// Evidence Management & Cryptographic Export API Client
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 11 & Phase 5A Specification)
// ==============================================================================

import { apiClient, getApiBaseUrl } from './client';
import { EvidenceInspection } from '@/types/evidence';
import { tokenStorage } from '@/lib/auth/session';

function mapBackendEvidence(raw: any): EvidenceInspection {
  if (!raw) return raw;

  const isVerified =
    raw.verification?.verified !== undefined
      ? Boolean(raw.verification.verified)
      : raw.verification_status === 'INTEGRITY_VERIFIED';

  const isBreach =
    raw.verification?.status === 'INTEGRITY_BREACH' ||
    raw.verification_status === 'INTEGRITY_BREACH' ||
    (raw.verification && !raw.verification.verified);

  const verificationStatus = isVerified
    ? 'INTEGRITY_VERIFIED'
    : isBreach
    ? 'INTEGRITY_BREACH'
    : 'VERIFICATION_UNAVAILABLE';

  return {
    id: raw.id,
    sighting_id: raw.sighting_id || raw.source_id || raw.sighting?.id || '',
    source_type: raw.source_type || 'SIGHTING',
    file_path: raw.file_path || raw.storage_ref || '',
    file_size_bytes: raw.file_size_bytes || raw.verification?.size_bytes || 0,
    mime_type: raw.mime_type || 'image/jpeg',
    stored_sha256: raw.stored_sha256 || raw.hash || raw.verification?.expected_hash || '',
    computed_sha256: raw.computed_sha256 || raw.verification?.calculated_hash,
    created_at: raw.created_at || new Date().toISOString(),
    retention_days: raw.retention_days || 365,
    verification_status: verificationStatus,
    integrity_match: isVerified,
    tamper_detected: isBreach,
    legal_admissibility_notice:
      raw.legal_admissibility_notice ||
      'Statutory Notice: Indian Evidence Act Section 65B electronic record metadata.',
    sighting: raw.sighting
      ? {
          plate_normalized: raw.sighting.plate_normalized,
          camera_id: raw.sighting.camera_id,
          timestamp: raw.sighting.timestamp,
          confidence: Number(raw.sighting.confidence),
          consensus_frames:
            raw.sighting.consensus_frames ?? raw.sighting.consensus_of ?? 0,
        }
      : undefined,
  };
}

export const evidenceApi = {
  /**
   * Inspect evidence record and execute live cryptographic SHA-256 verification
   */
  async getEvidence(id: string): Promise<EvidenceInspection> {
    const raw = await apiClient.get<any>(`/evidence/${id}`);
    return mapBackendEvidence(raw);
  },

  /**
   * Find and verify evidence associated with a vehicle sighting
   */
  async getBySighting(sightingId: string): Promise<EvidenceInspection> {
    const raw = await apiClient.get<any>(`/evidence/by-sighting/${sightingId}`);
    return mapBackendEvidence(raw);
  },

  /**
   * Download authenticated Evidence Integrity Package (ZIP bundle)
   * Triggers live verification on the server; blocks on hash mismatch or storage failure.
   */
  async downloadExport(id: string, defaultFilename?: string): Promise<void> {
    const accessToken = tokenStorage.getAccessToken();
    const headers: Record<string, string> = {
      'X-Request-Id': 'req-exp-' + Math.random().toString(36).substring(2, 9),
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${getApiBaseUrl()}/evidence/${id}/export`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      let errorMsg = `Export failed with HTTP status ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.message) errorMsg = errJson.message;
      } catch {
        // use default errorMsg
      }
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('content-disposition');
    let filename = defaultFilename || `EVIDENCE_PACKAGE_${id.substring(0, 8)}.zip`;

    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";]+)"?/i);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    // Trigger browser download
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  },
};
