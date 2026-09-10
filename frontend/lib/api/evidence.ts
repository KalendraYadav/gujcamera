// ==============================================================================
// Evidence Management & Cryptographic Export API Client
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 11 & Phase 5A Specification)
// ==============================================================================

import { apiClient, getApiBaseUrl } from './client';
import { EvidenceInspection } from '@/types/evidence';
import { tokenStorage } from '@/lib/auth/session';

export const evidenceApi = {
  /**
   * Inspect evidence record and execute live cryptographic SHA-256 verification
   */
  async getEvidence(id: string): Promise<EvidenceInspection> {
    return apiClient.get<EvidenceInspection>(`/evidence/${id}`);
  },

  /**
   * Find and verify evidence associated with a vehicle sighting
   */
  async getBySighting(sightingId: string): Promise<EvidenceInspection> {
    return apiClient.get<EvidenceInspection>(`/evidence/by-sighting/${sightingId}`);
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
