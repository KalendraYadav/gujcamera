import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EvidenceExportModal } from '@/components/evidence/EvidenceExportModal';
import { evidenceApi } from '@/lib/api/evidence';
import { EvidenceInspection } from '@/types/evidence';

// Mock evidence API
vi.mock('@/lib/api/evidence', () => ({
  evidenceApi: {
    getBySighting: vi.fn(),
    getEvidence: vi.fn(),
    downloadExport: vi.fn(),
  },
}));

const MOCK_VERIFIED_EVIDENCE: EvidenceInspection = {
  id: 'evi-test-12345678',
  sighting_id: 'sight-test-111',
  source_type: 'SIGHTING',
  file_path: 'evidence/frames/2026/09/sight-test-111.jpg',
  file_size_bytes: 524288,
  mime_type: 'image/jpeg',
  stored_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  computed_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  created_at: '2026-09-10T10:00:00.000Z',
  retention_days: 365,
  verification_status: 'INTEGRITY_VERIFIED',
  integrity_match: true,
  tamper_detected: false,
  legal_admissibility_notice: 'Statutory Notice: Indian Evidence Act Section 65B',
};

const MOCK_TAMPERED_EVIDENCE: EvidenceInspection = {
  ...MOCK_VERIFIED_EVIDENCE,
  id: 'evi-breach-999',
  computed_sha256: 'badc0ffee0000000000000000000000000000000000000000000000000000000',
  verification_status: 'INTEGRITY_BREACH',
  integrity_match: false,
  tamper_detected: true,
};

describe('EvidenceExportModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders cryptographic verification status when verified', async () => {
    vi.mocked(evidenceApi.getBySighting).mockResolvedValueOnce(MOCK_VERIFIED_EVIDENCE);

    render(
      <EvidenceExportModal
        sightingId="sight-test-111"
        plateNormalized="GJ01AB1234"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Evidence Integrity Package & Technical Certificate/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/SHA-256 INTEGRITY VERIFIED/i)).toBeInTheDocument();
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
      expect(screen.getByText(/STATUTORY NOTICE:/i)).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /Export Evidence Package/i });
    expect(exportBtn).not.toBeDisabled();
  });

  it('detects and displays tamper alert when hash mismatch occurs and disables export', async () => {
    vi.mocked(evidenceApi.getBySighting).mockResolvedValueOnce(MOCK_TAMPERED_EVIDENCE);

    render(
      <EvidenceExportModal
        sightingId="sight-test-111"
        plateNormalized="GJ01AB1234"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/INTEGRITY BREACH DETECTED: HASH MISMATCH/i)).toBeInTheDocument();
      expect(screen.getByText(/Export blocked/i)).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /Export Evidence Package/i });
    expect(exportBtn).toBeDisabled();
  });

  it('calls downloadExport API when export button is clicked on verified evidence', async () => {
    vi.mocked(evidenceApi.getBySighting).mockResolvedValueOnce(MOCK_VERIFIED_EVIDENCE);
    vi.mocked(evidenceApi.downloadExport).mockResolvedValueOnce(undefined);

    render(
      <EvidenceExportModal
        sightingId="sight-test-111"
        plateNormalized="GJ01AB1234"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/SHA-256 INTEGRITY VERIFIED/i)).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /Export Evidence Package/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(evidenceApi.downloadExport).toHaveBeenCalledWith(
        'evi-test-12345678',
        expect.stringContaining('EVIDENCE_GJ01AB1234')
      );
      expect(screen.getByText(/Evidence package downloaded successfully/i)).toBeInTheDocument();
    });
  });

  it('calls onClose callback when Close button is clicked', async () => {
    vi.mocked(evidenceApi.getBySighting).mockResolvedValueOnce(MOCK_VERIFIED_EVIDENCE);
    const onCloseMock = vi.fn();

    render(
      <EvidenceExportModal
        sightingId="sight-test-111"
        plateNormalized="GJ01AB1234"
        isOpen={true}
        onClose={onCloseMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Close'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
