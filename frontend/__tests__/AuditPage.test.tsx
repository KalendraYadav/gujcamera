import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditPage from '@/app/audit/page';
import { auditApi } from '@/lib/api/audit';
import { AuditListResponse } from '@/types/audit';

// Mock audit API
vi.mock('@/lib/api/audit', () => ({
  auditApi: {
    getAuditLogs: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-auditor-1',
      email: 'auditor@gujpolice.gov.in',
      role: 'SYSTEM_AUDITOR',
      department_name: 'Gujarat State Police HQ',
    },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

// Mock Next Navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/audit',
  useRouter: () => ({ push: vi.fn() }),
}));

const MOCK_AUDIT_RESPONSE: AuditListResponse = {
  data: [
    {
      id: 'aud-001',
      action: 'LOGIN_SUCCESS',
      resource_type: 'Auth',
      resource_id: 'usr-investigator-1',
      user_id: 'usr-investigator-1',
      ip_address: '10.0.4.12',
      status: 'SUCCESS',
      details: { role: 'INVESTIGATOR', method: 'password' },
      timestamp: '2026-09-10T10:15:00.000Z',
      user: {
        id: 'usr-investigator-1',
        name: 'Inspector Vikram Patel',
        badge_number: 'GJ-9901',
        role: 'INVESTIGATOR',
        department: 'Crime Branch',
      },
    },
    {
      id: 'aud-002',
      action: 'EVIDENCE_EXPORTED',
      resource_type: 'Evidence',
      resource_id: 'evi-888',
      user_id: 'usr-investigator-1',
      ip_address: '10.0.4.12',
      status: 'SUCCESS',
      details: { export_type: 'ZIP_PACKAGE', sha256: 'abc123canonical' },
      timestamp: '2026-09-10T10:20:00.000Z',
      user: {
        id: 'usr-investigator-1',
        name: 'Inspector Vikram Patel',
        badge_number: 'GJ-9901',
        role: 'INVESTIGATOR',
        department: 'Crime Branch',
      },
    },
  ],
  meta: {
    total: 2,
    page: 1,
    limit: 15,
    totalPages: 1,
  },
};

describe('AuditPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auditApi.getAuditLogs).mockResolvedValue(MOCK_AUDIT_RESPONSE);
  });

  it('renders page header and statutory audit governance disclaimer', async () => {
    render(<AuditPage />);

    expect(screen.getByText(/System Security & Compliance Audit Trail/i)).toBeInTheDocument();
    expect(screen.getByText(/STATUTORY AUDIT GOVERNANCE/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('LOGIN_SUCCESS').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('EVIDENCE_EXPORTED').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Inspector Vikram Patel').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('triggers API query with action filter when select changed', async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getAllByText('LOGIN_SUCCESS').length).toBeGreaterThanOrEqual(1);
    });

    vi.mocked(auditApi.getAuditLogs).mockResolvedValue({
      data: [MOCK_AUDIT_RESPONSE.data[1]],
      meta: { total: 1, page: 1, limit: 15, totalPages: 1 },
    });

    fireEvent.change(document.getElementById('audit-action-filter')!, {
      target: { value: 'EVIDENCE_EXPORTED' },
    });

    await waitFor(() => {
      expect(auditApi.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EVIDENCE_EXPORTED' })
      );
    });
  });

  it('opens payload inspector modal when Inspect button clicked', async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Inspect').length).toBe(2);
    });

    fireEvent.click(screen.getAllByText('Inspect')[1]);

    expect(screen.getByText('Audit Event Payload Inspector')).toBeInTheDocument();
    expect(screen.getByText(/abc123canonical/i)).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText('Audit Event Payload Inspector')).not.toBeInTheDocument();
    });
  });

  it('does not send sort_order in audit query parameters', async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(auditApi.getAuditLogs).toHaveBeenCalled();
    });

    const callArgs = vi.mocked(auditApi.getAuditLogs).mock.calls[0][0];
    expect(callArgs).toBeDefined();
    expect((callArgs as any)?.sort_order).toBeUndefined();
  });

  it('triggers API query with resource filter when select changed', async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getAllByText('LOGIN_SUCCESS').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.change(document.getElementById('audit-resource-filter')!, {
      target: { value: 'Evidence' },
    });

    await waitFor(() => {
      expect(auditApi.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'Evidence' })
      );
    });
  });

  it('renders dropdown selects with dark color scheme for option visibility', async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getAllByText('LOGIN_SUCCESS').length).toBeGreaterThanOrEqual(1);
    });

    const actionSelect = document.getElementById('audit-action-filter');
    const resourceSelect = document.getElementById('audit-resource-filter');
    const statusSelect = document.getElementById('audit-status-filter');

    expect(actionSelect).toBeInTheDocument();
    expect(resourceSelect).toBeInTheDocument();
    expect(statusSelect).toBeInTheDocument();

    expect(actionSelect?.style.colorScheme).toBe('dark');
    expect(resourceSelect?.style.colorScheme).toBe('dark');
    expect(statusSelect?.style.colorScheme).toBe('dark');
  });

  it('displays empty state when no records found', async () => {
    vi.mocked(auditApi.getAuditLogs).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 15, totalPages: 0 },
    });

    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByText('No Audit Records Found')).toBeInTheDocument();
    });
  });

  it('displays error state when audit API fails', async () => {
    vi.mocked(auditApi.getAuditLogs).mockRejectedValue(new Error('Network connection timeout'));

    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Audit Logs')).toBeInTheDocument();
      expect(screen.getByText(/Network connection timeout/i)).toBeInTheDocument();
    });
  });
});

