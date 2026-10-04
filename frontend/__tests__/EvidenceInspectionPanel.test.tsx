import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { EvidenceInspectionPanel } from '@/components/vehicles/EvidenceInspectionPanel';
import { evidenceApi } from '@/lib/api/evidence';
import { EvidenceInspection } from '@/types/evidence';

// Mock evidence API
vi.mock('@/lib/api/evidence', () => ({
  evidenceApi: {
    getBySighting: vi.fn(),
    getEvidence: vi.fn(),
    getFrameBlob: vi.fn(),
    getFrameUrl: vi.fn((id: string) => `/api/v1/evidence/${id}/frame`),
  },
}));

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockObjectUrl = 'blob:http://localhost:3000/mock-jpeg-frame-blob';
global.URL.createObjectURL = vi.fn(() => mockObjectUrl);
global.URL.revokeObjectURL = vi.fn();

const MOCK_VERIFIED_EVIDENCE: EvidenceInspection = {
  id: 'evi-phase11-001',
  sighting_id: 'sight-001',
  source_type: 'SIGHTING',
  file_path: 'evidence/frames/2026/09/sight-001.jpg',
  file_size_bytes: 102400,
  mime_type: 'image/jpeg',
  stored_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  computed_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  created_at: '2026-09-10T10:00:00.000Z',
  retention_days: 365,
  verification_status: 'INTEGRITY_VERIFIED',
  integrity_match: true,
  tamper_detected: false,
  legal_admissibility_notice:
    'LEGAL / PROCEDURAL NOTICE: Cryptographic integrity verification confirms that the retrieved evidence object matches its recorded SHA-256 digest.',
  sighting: {
    plate_normalized: 'GJ01AB1234',
    camera_id: 'CAM-AHM-01',
    timestamp: '2026-09-10T10:00:00.000Z',
    confidence: 0.98,
    consensus_frames: 5,
    vehicle_class: 'CAR',
    vehicleClass: 'CAR',
  },
};

const MOCK_BREACH_EVIDENCE: EvidenceInspection = {
  ...MOCK_VERIFIED_EVIDENCE,
  id: 'evi-phase11-breach',
  computed_sha256: '0000000000000000000000000000000000000000000000000000000000000000',
  verification_status: 'INTEGRITY_BREACH',
  integrity_match: false,
  tamper_detected: true,
};

describe('EvidenceInspectionPanel — Phase 11 Forensic Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders prompt when no sighting is selected', () => {
    render(
      <EvidenceInspectionPanel
        sightingId={null}
        plateNormalized="GJ01AB1234"
      />
    );

    expect(screen.getByText(/SELECT SIGHTING TO INSPECT EVIDENCE/i)).toBeInTheDocument();
  });

  it('M & N: fetches and renders actual JPEG frame with INTEGRITY VERIFIED status badge', async () => {
    vi.mocked(evidenceApi.getBySighting).mockResolvedValueOnce(MOCK_VERIFIED_EVIDENCE);
    vi.mocked(evidenceApi.getFrameBlob).mockResolvedValueOnce(new Blob(['fake-jpg-bytes'], { type: 'image/jpeg' }));

    render(
      <EvidenceInspectionPanel
        sightingId="sight-001"
        plateNormalized="GJ01AB1234"
        cameraName="CAM-AHM-01: SG Highway"
      />
    );

    // Initial loading or header check
    expect(screen.getByText(/Evidence & Integrity Verification/i)).toBeInTheDocument();

    await waitFor(() => {
      // Status badge
      expect(screen.getAllByText(/INTEGRITY VERIFIED/i).length).toBeGreaterThanOrEqual(1);
      // SHA-256 digests displayed (both stored and live computed)
      expect(screen.getAllByText(MOCK_VERIFIED_EVIDENCE.stored_sha256).length).toBe(2);
    });

    // Frame rendered
    await waitFor(() => {
      const img = screen.getByTestId('evidence-frame-image');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', mockObjectUrl);
    });

    expect(evidenceApi.getFrameBlob).toHaveBeenCalledWith('evi-phase11-001');
  });

  it('O: blocks frame streaming and displays INTEGRITY BREACH warning on hash mismatch', async () => {
    vi.mocked(evidenceApi.getBySighting).mockResolvedValueOnce(MOCK_BREACH_EVIDENCE);

    render(
      <EvidenceInspectionPanel
        sightingId="sight-001"
        plateNormalized="GJ01AB1234"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('INTEGRITY BREACH')).toBeInTheDocument();
      expect(screen.getByText(/INTEGRITY BREACH DETECTED/i)).toBeInTheDocument();
      expect(screen.getByText(/Visual streaming is blocked/i)).toBeInTheDocument();
    });

    // Does NOT call getFrameBlob when evidence is breached
    expect(evidenceApi.getFrameBlob).not.toHaveBeenCalled();
    expect(screen.queryByTestId('evidence-frame-image')).not.toBeInTheDocument();
  });

  it('P: displays STORAGE VAULT OBJECT UNAVAILABLE when frame retrieval fails', async () => {
    vi.mocked(evidenceApi.getBySighting).mockResolvedValueOnce(MOCK_VERIFIED_EVIDENCE);
    vi.mocked(evidenceApi.getFrameBlob).mockRejectedValueOnce(new Error('Evidence artifact key not found in storage vault'));

    render(
      <EvidenceInspectionPanel
        sightingId="sight-001"
        plateNormalized="GJ01AB1234"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/STORAGE VAULT OBJECT UNAVAILABLE/i)).toBeInTheDocument();
      expect(screen.getByText(/Evidence artifact key not found in storage vault/i)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('evidence-frame-image')).not.toBeInTheDocument();
  });

  it('preserves claim discipline: does NOT claim legal admissibility or court certification', async () => {
    vi.mocked(evidenceApi.getBySighting).mockResolvedValueOnce(MOCK_VERIFIED_EVIDENCE);
    vi.mocked(evidenceApi.getFrameBlob).mockResolvedValueOnce(new Blob(['fake-jpg-bytes'], { type: 'image/jpeg' }));

    render(
      <EvidenceInspectionPanel
        sightingId="sight-001"
        plateNormalized="GJ01AB1234"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/LEGAL \/ PROCEDURAL NOTICE/i)).toBeInTheDocument();
      expect(screen.getByText(/AUTHENTICITY \/ ADMISSIBILITY REQUIRES INDEPENDENT LEGAL AND PROCEDURAL REVIEW/i)).toBeInTheDocument();
    });

    // Prohibited strings
    expect(screen.queryByText(/legally admissible evidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/court-certified evidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Section 65B compliance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tamper-proof evidence/i)).not.toBeInTheDocument();
  });
});
