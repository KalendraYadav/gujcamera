import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    total_active: 3,
    critical: 1,
    high: 1,
    medium: 1,
    recent: [
      {
        id: 'alert-1',
        severity: 'CRITICAL',
        status: 'OPEN',
        category: 'STOLEN_VEHICLE',
        reason: 'Plate match against active amber alert',
        plate: 'GJ01AB1234',
        camera_name: 'SG Highway Junction 1',
        city: 'Ahmedabad',
        timestamp: '2026-10-03T09:45:00.000Z',
      },
    ],
  },
  watchlists: {
    total_watchlists: 2,
    active_entries: 5,
    recent_matches: [
      {
        plate: 'GJ01AB1234',
        category: 'STOLEN',
        priority: 'CRITICAL',
        camera_name: 'SG Highway Junction 1',
        city: 'Ahmedabad',
        timestamp: '2026-10-03T09:45:00.000Z',
      },
    ],
  },
  sightings: {
    recent_observations: [
      {
        id: 'sighting-1',
        plate: 'GJ05CD5678',
        camera_name: 'Ring Road Camera 2',
        city: 'Surat',
        confidence: 0.95,
        consensus_frames: 4,
        has_evidence: true,
        timestamp: '2026-10-03T09:50:00.000Z',
        is_watchlisted: false,
      },
    ],
  },
  jurisdictions: [
    { id: 'ahmedabad', name: 'Ahmedabad', code: 'AMD', total_cameras: 4, online_cameras: 3, active_alerts: 1, recent_sightings: 12 },
    { id: 'surat', name: 'Surat', code: 'SUR', total_cameras: 3, online_cameras: 3, active_alerts: 0, recent_sightings: 8 },
    { id: 'vadodara', name: 'Vadodara', code: 'BDQ', total_cameras: 3, online_cameras: 2, active_alerts: 1, recent_sightings: 5 },
    { id: 'rajkot', name: 'Rajkot', code: 'RAJ', total_cameras: 2, online_cameras: 2, active_alerts: 0, recent_sightings: 4 },
    { id: 'gandhinagar', name: 'Gandhinagar', code: 'GND', total_cameras: 2, online_cameras: 2, active_alerts: 0, recent_sightings: 6 },
    { id: 'expressway', name: 'NE-1 Expressway Corridor', code: 'EXP', total_cameras: 1, online_cameras: 0, active_alerts: 1, recent_sightings: 2 },
  ],
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

describe('Operational Command Center (Phase 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'OPERATOR';
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue(mockData);
  });

  // 1. Dashboard loads
  it('1. dashboard loads successfully with header and institutional title', async () => {
    render(<OperationalCommandCenterPage />);
    expect(screen.getByTestId('command-center-header')).toBeInTheDocument();
    expect(screen.getAllByText(/NETRAVAHA/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Operational Intelligence Command Center/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Camera Network Overview')).toBeInTheDocument();
    });
  });

  // 2. System health rendering
  it('2. system health rendering displays all measured subsystem states', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('subsystem-CAMERA NETWORK')).toBeInTheDocument();
    });
    expect(screen.getByTestId('subsystem-STREAM GATEWAY')).toBeInTheDocument();
    expect(screen.getByTestId('subsystem-AI PIPELINE')).toBeInTheDocument();
    expect(screen.getByTestId('subsystem-DATABASE')).toBeInTheDocument();
    expect(screen.getByTestId('subsystem-EVENT PIPELINE')).toBeInTheDocument();
  });

  // 3. Camera health counts
  it('3. camera health counts render real counts accurately', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('camera-overview-total')).toHaveTextContent('15');
      expect(screen.getByTestId('camera-overview-online')).toHaveTextContent('12');
      expect(screen.getByTestId('camera-overview-degraded')).toHaveTextContent('2');
      expect(screen.getByTestId('camera-overview-offline')).toHaveTextContent('1');
      expect(screen.getByTestId('camera-overview-error')).toHaveTextContent('0');
    });
  });

  // 4. Active alert rendering
  it('4. active alert rendering shows severity badges and alert metadata', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('active-alert-center')).toBeInTheDocument();
    });
    expect(screen.getByText('Plate match against active amber alert')).toBeInTheDocument();
    expect(screen.getAllByText('GJ01AB1234').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('OPEN ALERT').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('inspect-vehicle-btn')).not.toBeInTheDocument();
  });

  // 5. Watchlist activity
  it('5. watchlist activity displays monitored targets and hit records', async () => {
    mockUserRole = 'INVESTIGATOR';
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('watchlist-intelligence')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/5 TARGETS/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('INVESTIGATE')).toBeInTheDocument();
  });

  // 6. Recent vehicle sightings
  it('6. recent vehicle sightings shows observation stream with consensus & sha-256', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('recent-sightings-stream')).toBeInTheDocument();
    });
    expect(screen.getByText('GJ05CD5678')).toBeInTheDocument();
    expect(screen.getByText('95% CONF')).toBeInTheDocument();
    expect(screen.getByText(/4 FRAMES CONSENSUS/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SHA-256/i).length).toBeGreaterThanOrEqual(1);
  });

  // 7. Jurisdiction activity
  it('7. jurisdiction activity renders all 6 configured prototype zones', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('jurisdiction-activity')).toBeInTheDocument();
    });
    expect(screen.getByText('Ahmedabad')).toBeInTheDocument();
    expect(screen.getByText('Surat')).toBeInTheDocument();
    expect(screen.getByText('Vadodara')).toBeInTheDocument();
    expect(screen.getByText('Rajkot')).toBeInTheDocument();
    expect(screen.getByText('Gandhinagar')).toBeInTheDocument();
    expect(screen.getByText('NE-1 Expressway Corridor')).toBeInTheDocument();
  });

  // 8. Recent audit events
  it('8. recent audit events renders investigation audit logs for authorized officers', async () => {
    mockUserRole = 'INVESTIGATOR';
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('recent-investigations')).toBeInTheDocument();
    });
    expect(screen.getByText('VEHICLE_SEARCH')).toBeInTheDocument();
    expect(screen.getAllByText('investigator@gujcamera.local').length).toBeGreaterThanOrEqual(1);
  });

  // 9. RBAC visibility
  it('9. RBAC visibility filters quick actions based on user role', async () => {
    mockUserRole = 'OPERATOR';
    const { unmount } = render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('quick-action-alert-console')).toBeInTheDocument();
    });
    // OPERATOR cannot search vehicles
    expect(screen.queryByTestId('quick-action-search-vehicle')).not.toBeInTheDocument();
    unmount();

    // INVESTIGATOR can search vehicles
    mockUserRole = 'INVESTIGATOR';
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('quick-action-search-vehicle')).toBeInTheDocument();
    });
  });

  // 10. Empty states
  it('10. empty states render informative messages when lists are empty', async () => {
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue({
      ...mockData,
      alerts: { total_active: 0, critical: 0, high: 0, medium: 0, recent: [] },
      watchlists: { total_watchlists: 0, active_entries: 0, recent_matches: [] },
      sightings: { recent_observations: [] },
      investigations: { recent_events: [] },
    });

    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByText('No Active Operational Alerts')).toBeInTheDocument();
      expect(screen.getByText('No Recent Watchlist Matches')).toBeInTheDocument();
      expect(screen.getByText('No Recent Observations')).toBeInTheDocument();
    });
  });

  // 11. API failure state
  it('11. API failure state displays ErrorState with retry capability', async () => {
    vi.mocked(dashboardApi.getOperationalSummary).mockRejectedValue(new Error('Network Gateway Timeout'));
    render(<OperationalCommandCenterPage />);

    await waitFor(() => {
      expect(screen.getByText('Operational Intelligence Synchronization Failed')).toBeInTheDocument();
      expect(screen.getByText('Network Gateway Timeout')).toBeInTheDocument();
    });
  });

  // 12. Unavailable subsystem state
  it('12. unavailable subsystem state displays STATUS NOT AVAILABLE when unmeasured', async () => {
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue({
      ...mockData,
      system: {
        ...mockData.system,
        event_pipeline: undefined as any,
      },
    });

    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      const el = screen.getByTestId('subsystem-EVENT PIPELINE');
      expect(el).toHaveTextContent('STATUS NOT AVAILABLE');
    });
  });

  // 13. Navigation actions
  it('13. navigation actions provide verified links to subsystems', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('quick-action-open-gis')).toBeInTheDocument();
    });
    expect(screen.getByTestId('quick-action-open-gis')).toHaveAttribute('href', '/map');
    expect(screen.getByTestId('quick-action-camera-registry')).toHaveAttribute('href', '/cameras');
  });

  // 14. No-data conditions
  it('14. no-data conditions gracefully render 0 without breaking', async () => {
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue({
      ...mockData,
      cameras: {
        total: 0,
        online: 0,
        degraded: 0,
        offline: 0,
        error: 0,
        configured_prototype_sources: 0,
      },
    });

    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('camera-overview-total')).toHaveTextContent('0');
      expect(screen.getByTestId('camera-overview-online')).toHaveTextContent('0');
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  // 15. Compact Header: Default Collapsed and Toggle Expand
  it('15. compact header renders in collapsed state by default and toggles on click', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('command-center-header')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId('header-detail-toggle-btn');
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('command-center-detail-drawer')).not.toBeInTheDocument();

    // Click toggle to EXPAND
    fireEvent.click(toggleBtn);

    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByTestId('command-center-detail-drawer');
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveTextContent('operator@gujcamera.local');
    expect(drawer).toHaveTextContent('ORGANIZATION');
    expect(drawer).toHaveTextContent('Gujarat State Police HQ');
    expect(drawer).toHaveTextContent('PROTOTYPE BOUNDARY');
  });

  // 16. Click Outside Collapses Header Detail
  it('16. clicking outside automatically collapses the expanded detail drawer', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('command-center-header')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId('header-detail-toggle-btn');
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('command-center-detail-drawer')).toBeInTheDocument();

    // Click outside on document body
    fireEvent.mouseDown(document.body);

    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('command-center-detail-drawer')).not.toBeInTheDocument();
  });

  // 17. Pressing ESC Collapses Header Detail
  it('17. pressing Escape key collapses the expanded detail drawer', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('command-center-header')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId('header-detail-toggle-btn');
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('command-center-detail-drawer')).toBeInTheDocument();

    // Press Escape key
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('command-center-detail-drawer')).not.toBeInTheDocument();
  });

  // 18. Clicking Inside Detail Drawer Preserves Open State
  it('18. clicking inside the expanded detail drawer does not collapse it', async () => {
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('command-center-header')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId('header-detail-toggle-btn');
    fireEvent.click(toggleBtn);
    const drawer = screen.getByTestId('command-center-detail-drawer');
    expect(drawer).toBeInTheDocument();

    // Click inside the drawer (e.g., selecting text or clicking container)
    fireEvent.mouseDown(drawer);

    // Remains open
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('command-center-detail-drawer')).toBeInTheDocument();
  });

  // 19. Truthful Camera Network Telemetry
  it('19. truthfully resolves camera network status based on real fleet telemetry', async () => {
    // Condition A: 100% online fleet -> ONLINE
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue({
      ...mockData,
      cameras: {
        total: 10,
        online: 10,
        degraded: 0,
        offline: 0,
        error: 0,
        configured_prototype_sources: 10,
      },
    });

    const { unmount } = render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      const el = screen.getByTestId('subsystem-CAMERA NETWORK');
      expect(el).toHaveTextContent('ONLINE');
    });

    unmount();

    // Condition B: Some cameras offline/degraded -> DEGRADED
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue({
      ...mockData,
      cameras: {
        total: 10,
        online: 8,
        degraded: 1,
        offline: 1,
        error: 0,
        configured_prototype_sources: 10,
      },
    });

    const { unmount: unmountB } = render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      const el = screen.getByTestId('subsystem-CAMERA NETWORK');
      expect(el).toHaveTextContent('DEGRADED');
    });

    unmountB();

    // Condition C: Zero cameras online -> OFFLINE
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue({
      ...mockData,
      cameras: {
        total: 10,
        online: 0,
        degraded: 0,
        offline: 10,
        error: 0,
        configured_prototype_sources: 10,
      },
    });

    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      const el = screen.getByTestId('subsystem-CAMERA NETWORK');
      expect(el).toHaveTextContent('OFFLINE');
    });
  });

  // 20. Truthful Subsystem Health States
  it('20. displays truthful statuses for stream gateway, database, and event pipeline', async () => {
    vi.mocked(dashboardApi.getOperationalSummary).mockResolvedValue({
      ...mockData,
      system: {
        ...mockData.system,
        database: 'UNAVAILABLE',
        stream_gateway: 'UNAVAILABLE',
        event_pipeline: 'DEGRADED',
      },
    });

    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('subsystem-DATABASE')).toHaveTextContent('UNAVAILABLE');
      expect(screen.getByTestId('subsystem-STREAM GATEWAY')).toHaveTextContent('UNAVAILABLE');
      expect(screen.getByTestId('subsystem-EVENT PIPELINE')).toHaveTextContent('DEGRADED');
    });
  });

  // 21. Vehicle Action Authorization - OPERATOR restrictions
  it('21. prevents OPERATOR from seeing vehicle inspection, investigation, and tracking actions', async () => {
    mockUserRole = 'OPERATOR';
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('active-alert-center')).toBeInTheDocument();
    });

    // Inspect vehicle button must NOT be rendered
    expect(screen.queryByTestId('inspect-vehicle-btn')).not.toBeInTheDocument();
    expect(screen.queryByText('INSPECT VEHICLE')).not.toBeInTheDocument();

    // Open Alert action remains available
    const openAlertBtn = screen.getByTestId('open-alert-btn');
    expect(openAlertBtn).toBeInTheDocument();
    expect(openAlertBtn).toHaveAttribute('href', '/alerts');

    // Plate in active alert is NOT a link to /vehicles/
    expect(screen.queryByTestId('alert-plate-link')).not.toBeInTheDocument();

    // Watchlist investigate action must NOT be rendered
    expect(screen.queryByTestId('watchlist-investigate-btn')).not.toBeInTheDocument();
    expect(screen.queryByText('INVESTIGATE')).not.toBeInTheDocument();

    // Sightings vehicle command link and route button must NOT be rendered
    expect(screen.queryByTestId('sighting-vehicle-command-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sighting-route-btn')).not.toBeInTheDocument();
  });

  // 22. Vehicle Action Authorization - INVESTIGATOR and authorized roles
  it('22. renders vehicle inspection and investigation actions for authorized roles', async () => {
    mockUserRole = 'INVESTIGATOR';
    render(<OperationalCommandCenterPage />);
    await waitFor(() => {
      expect(screen.getByTestId('active-alert-center')).toBeInTheDocument();
    });

    // Inspect vehicle button IS rendered and links to /vehicles/[plate]
    const inspectBtn = screen.getByTestId('inspect-vehicle-btn');
    expect(inspectBtn).toBeInTheDocument();
    expect(inspectBtn).toHaveAttribute('href', '/vehicles/GJ01AB1234');

    // Open alert button remains available alongside Inspect Vehicle
    expect(screen.getByTestId('open-alert-btn')).toBeInTheDocument();

    // Plate in active alert is a link to /vehicles/[plate]
    const plateLink = screen.getByTestId('alert-plate-link');
    expect(plateLink).toBeInTheDocument();
    expect(plateLink).toHaveAttribute('href', '/vehicles/GJ01AB1234');

    // Watchlist investigate action IS rendered
    const investigateBtn = screen.getByTestId('watchlist-investigate-btn');
    expect(investigateBtn).toBeInTheDocument();
    expect(investigateBtn).toHaveAttribute('href', '/vehicles/GJ01AB1234');

    // Sightings vehicle command link and route button ARE rendered
    expect(screen.getByTestId('sighting-vehicle-command-link')).toBeInTheDocument();
    const routeBtn = screen.getByTestId('sighting-route-btn');
    expect(routeBtn).toBeInTheDocument();
    expect(routeBtn).toHaveAttribute('href', '/vehicles/GJ05CD5678');
  });
});
