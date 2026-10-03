import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OperationalCommandCenterPage from '@/app/page';
import { PoliceRole } from '@/types/auth';
import { dashboardApi } from '@/lib/api/dashboard';
import { OperationalSummaryResponse } from '@/types/dashboard';

let mockUserRole: PoliceRole = 'OPERATOR';

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: `${mockUserRole.toLowerCase()}@gujcamera.local`,
      role: mockUserRole,
      department_name: 'Gujarat State Police HQ',
    },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api/dashboard', () => ({
  dashboardApi: {
    getOperationalSummary: vi.fn(),
  },
}));

const mockData: OperationalSummaryResponse = {
  timestamp: '2026-10-03T10:00:00.000Z',
  system: {
    database: 'HEALTHY',
    stream_gateway: 'HEALTHY',
    ai_pipeline: 'HEALTHY',
    event_pipeline: 'HEALTHY',
    camera_network: 'ONLINE',
    postgis: 'HEALTHY',
  },
  cameras: {
    total: 15,
    online: 12,
    degraded: 2,
    offline: 1,
    error: 0,
    configured_prototype_sources: 15,
  },
  alerts: {
    total_active: 2,
    critical: 1,
    high: 1,
    medium: 0,
    recent: [],
  },
  watchlists: {
    total_watchlists: 2,
    active_entries: 5,
    recent_matches: [],
  },
  sightings: {
    recent_observations: [],
  },
  jurisdictions: [],
  investigations: {
    recent_events: [
      {
        id: 'audit-1',
        timestamp: '2026-10-03T09:30:00.000Z',
        actor_email: 'investigator@gujcamera.local',
        actor_role: 'INVESTIGATOR',
        action: 'VEHICLE_SEARCH',
        resource: 'VEHICLE',
        target: 'GJ01AB1234',
      },
    ],
  },
  disclaimer: 'PROTOTYPE DEMONSTRATION ENVIRONMENT',
};

describe('Command Center RBAC UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'OPERATOR';
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue(mockData);
  });

  it('renders operational mode and tactical navigation for OPERATOR', async () => {
    mockUserRole = 'OPERATOR';
    render(<OperationalCommandCenterPage />);

    expect(screen.getAllByText(/Operational/i).length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      expect(screen.getByText('Tactical Command Navigation')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-alert-console')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-open-gis')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-live-cctv')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-camera-registry')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-watchlists')).toBeInTheDocument();
    });

    // OPERATOR must NOT see Vehicle search in command bar or audit activity section
    expect(screen.queryByTestId('quick-action-search-vehicle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-investigations')).not.toBeInTheDocument();
  });

  it('renders Statutory Audit Mode context and authorized modules for SYSTEM_AUDITOR', async () => {
    mockUserRole = 'SYSTEM_AUDITOR';
    render(<OperationalCommandCenterPage />);

    // Oversight banner indicators
    expect(screen.getByText('Statutory Audit Mode')).toBeInTheDocument();
    expect(screen.getByText('Statutory Auditor')).toBeInTheDocument();

    await waitFor(() => {
      // Auditor must see GIS and Camera Registry in command bar
      expect(screen.getByTestId('quick-action-open-gis')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-camera-registry')).toBeInTheDocument();
      // Auditor sees Recent Investigation & Audit Activity
      expect(screen.getByTestId('recent-investigations')).toBeInTheDocument();
      expect(screen.getByText('FULL AUDIT TRAIL')).toBeInTheDocument();
    });

    // Auditor must NOT see tactical mutation command actions
    expect(screen.queryByTestId('quick-action-live-cctv')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-action-search-vehicle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-action-alert-console')).not.toBeInTheDocument();
  });

  it('renders both tactical and audit modules for SUPER_ADMIN', async () => {
    mockUserRole = 'SUPER_ADMIN';
    render(<OperationalCommandCenterPage />);

    expect(screen.getAllByText(/Operational/i).length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      // Super Admin has access to all actions
      expect(screen.getByTestId('quick-action-search-vehicle')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-alert-console')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-open-gis')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-live-cctv')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-camera-registry')).toBeInTheDocument();
      expect(screen.getByTestId('quick-action-watchlists')).toBeInTheDocument();
      expect(screen.getByTestId('recent-investigations')).toBeInTheDocument();
      expect(screen.getByText('FULL AUDIT TRAIL')).toBeInTheDocument();
    });
  });
});
