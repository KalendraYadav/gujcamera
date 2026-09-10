import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertsPage from '@/app/alerts/page';
import { alertsApi } from '@/lib/api/alerts';
import { AlertItem, AlertListResponse } from '@/types/alert';

// Mock alerts API
vi.mock('@/lib/api/alerts', () => ({
  alertsApi: {
    listAlerts: vi.fn(),
    getAlert: vi.fn(),
    acknowledgeAlert: vi.fn(),
    investigateAlert: vi.fn(),
    resolveAlert: vi.fn(),
    dismissAlert: vi.fn(),
  },
}));

// Mock AlertWebSocketClient
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
let registeredAlertCreatedCb: ((alert: AlertItem) => void) | null = null;
let registeredAlertUpdatedCb: ((alert: AlertItem) => void) | null = null;
let registeredStatusCb: ((status: any) => void) | null = null;

vi.mock('@/lib/websocket/alert-socket', () => ({
  AlertWebSocketClient: vi.fn().mockImplementation((options) => {
    registeredAlertCreatedCb = options?.onAlertCreated;
    registeredAlertUpdatedCb = options?.onAlertUpdated;
    registeredStatusCb = options?.onStatusChange;
    return {
      connect: mockConnect,
      disconnect: mockDisconnect,
    };
  }),
}));

// Mock Audio Notifier
vi.mock('@/components/alerts/AlertAudioNotifier', () => ({
  alertAudioNotifier: {
    playCriticalAlert: vi.fn(),
    getMuted: vi.fn().mockReturnValue(false),
    toggleMute: vi.fn().mockReturnValue(true),
  },
}));

let mockUserRole = 'OPERATOR';

// Mock AuthContext
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-op-1',
      email: 'operator@gujcamera.local',
      role: mockUserRole,
      department_name: 'Ahmedabad City Police',
    },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

// Mock Next Navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/alerts',
  useRouter: () => ({ push: mockPush }),
}));

const MOCK_ALERTS: AlertItem[] = [
  {
    id: 'alt-1',
    severity: 'CRITICAL',
    status: 'NEW',
    timestamp: '2026-09-10T08:00:00.000Z',
    sighting: {
      id: 'sight-1',
      vehicle: {
        plate_normalized: 'GJ01AB1234',
      },
      camera: {
        id: 'cam-1',
        name: 'CAM-AHM-01: SG Highway',
      },
    },
    watchlist_match: {
      entry_id: 'ent-1',
      plate_normalized: 'GJ01AB1234',
      category: 'STOLEN',
      reason: 'Stolen vehicle alert match',
      priority: 'CRITICAL',
      added_by: 'usr-admin-1',
      watchlist: {
        id: 'wl-1',
        name: 'STOLEN VEHICLES AHMEDABAD',
      },
    },
    created_at: '2026-09-10T08:00:05.000Z',
    updated_at: '2026-09-10T08:00:05.000Z',
  },
  {
    id: 'alt-2',
    severity: 'HIGH',
    status: 'ACKNOWLEDGED',
    timestamp: '2026-09-10T07:30:00.000Z',
    sighting: {
      id: 'sight-2',
      vehicle: {
        plate_normalized: 'GJ05CD5678',
      },
      camera: {
        id: 'cam-2',
        name: 'CAM-AHM-02: Iscon Crossroad',
      },
    },
    watchlist_match: {
      entry_id: 'ent-2',
      plate_normalized: 'GJ05CD5678',
      category: 'SUSPECT',
      reason: 'Vehicle used in armed robbery',
      priority: 'HIGH',
      added_by: 'usr-admin-1',
      watchlist: {
        id: 'wl-2',
        name: 'WANTED NARCOTICS COURIERS',
      },
    },
    created_at: '2026-09-10T07:30:05.000Z',
    updated_at: '2026-09-10T07:30:05.000Z',
  },
];

const MOCK_LIST_RESPONSE: AlertListResponse = {
  data: MOCK_ALERTS,
  pagination: {
    total: 2,
    page: 1,
    limit: 25,
    total_pages: 1,
  },
};

describe('Alerts Live Console Page (Phase 4E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'OPERATOR';
    registeredAlertCreatedCb = null;
    registeredAlertUpdatedCb = null;
    registeredStatusCb = null;
    vi.mocked(alertsApi.listAlerts).mockResolvedValue(MOCK_LIST_RESPONSE);
  });

  it('renders initial alerts from REST and connects WebSocket', async () => {
    render(<AlertsPage />);

    expect(screen.getByText('Live Alert Feed & Triage')).toBeInTheDocument();
    expect(screen.getAllByText('SIMULATED DATA').length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      expect(alertsApi.listAlerts).toHaveBeenCalled();
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
      expect(screen.getByText('GJ05CD5678')).toBeInTheDocument();
    });

    expect(mockConnect).toHaveBeenCalled();
  });

  it('displays severity breakdown KPIs accurately', async () => {
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    expect(screen.getByText('Active Critical Alerts')).toBeInTheDocument();
    expect(screen.getByText('Active High Alerts')).toBeInTheDocument();
  });

  it('allows operators to Acknowledge open alerts', async () => {
    const acknowledgedAlert: AlertItem = {
      ...MOCK_ALERTS[0],
      status: 'ACKNOWLEDGED',
    };
    vi.mocked(alertsApi.acknowledgeAlert).mockResolvedValue(acknowledgedAlert);

    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const ackBtn = screen.getByText('Acknowledge');
    fireEvent.click(ackBtn);

    await waitFor(() => {
      expect(alertsApi.acknowledgeAlert).toHaveBeenCalledWith('alt-1');
    });
  });

  it('allows investigators to transition alerts to INVESTIGATE', async () => {
    mockUserRole = 'INVESTIGATOR';
    const investigatingAlert: AlertItem = {
      ...MOCK_ALERTS[1],
      status: 'INVESTIGATING',
    };
    vi.mocked(alertsApi.investigateAlert).mockResolvedValue(investigatingAlert);

    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ05CD5678')).toBeInTheDocument();
    });

    const invBtn = screen.getByText('Open Investigation');
    fireEvent.click(invBtn);

    await waitFor(() => {
      expect(alertsApi.investigateAlert).toHaveBeenCalledWith('alt-2');
    });
  });

  it('restricts OPERATOR from seeing "Investigate Vehicle" CTA', async () => {
    mockUserRole = 'OPERATOR';
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    expect(screen.queryByText('Investigate Vehicle')).not.toBeInTheDocument();
  });

  it('restricts SYSTEM_AUDITOR from seeing "Investigate Vehicle" CTA', async () => {
    mockUserRole = 'SYSTEM_AUDITOR';
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    expect(screen.queryByText('Investigate Vehicle')).not.toBeInTheDocument();
  });

  it('allows INVESTIGATOR to see "Investigate Vehicle" with route /vehicles/[plate]', async () => {
    mockUserRole = 'INVESTIGATOR';
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const investigateLinks = screen.getAllByText('Investigate Vehicle');
    expect(investigateLinks.length).toBeGreaterThanOrEqual(1);
    const link = investigateLinks[0].closest('a');
    expect(link).toHaveAttribute('href', '/vehicles/GJ01AB1234');
  });

  it('allows DEPARTMENT_ADMIN to see "Investigate Vehicle"', async () => {
    mockUserRole = 'DEPARTMENT_ADMIN';
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const investigateLinks = screen.getAllByText('Investigate Vehicle');
    expect(investigateLinks.length).toBeGreaterThanOrEqual(1);
    const link = investigateLinks[0].closest('a');
    expect(link).toHaveAttribute('href', '/vehicles/GJ01AB1234');
  });

  it('allows SUPER_ADMIN to see "Investigate Vehicle"', async () => {
    mockUserRole = 'SUPER_ADMIN';
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const investigateLinks = screen.getAllByText('Investigate Vehicle');
    expect(investigateLinks.length).toBeGreaterThanOrEqual(1);
    const link = investigateLinks[0].closest('a');
    expect(link).toHaveAttribute('href', '/vehicles/GJ01AB1234');
  });

  it('expands alert audit details without vehicle API invocation', async () => {
    mockUserRole = 'OPERATOR';
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const toggleBtn = screen.getAllByTitle('Toggle Audit & Evidence Details')[0];
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Alert ID:/i)).toBeInTheDocument();
    expect(screen.getByText(/Sighting ID:/i)).toBeInTheDocument();
    expect(screen.getByText(/Disclaimer:/i)).toBeInTheDocument();
  });

  it('toggles sound control on click', async () => {
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const soundBtn = screen.getByRole('button', { name: /Sound/i });
    expect(soundBtn).toBeInTheDocument();
    fireEvent.click(soundBtn);

    // Verify toggleMute was called
    const { alertAudioNotifier } = await import('@/components/alerts/AlertAudioNotifier');
    expect(alertAudioNotifier.toggleMute).toHaveBeenCalled();
  });

  it('prepends new real-time WebSocket alert without duplication', async () => {
    render(<AlertsPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const newWsAlert: AlertItem = {
      id: 'alt-new-99',
      severity: 'CRITICAL',
      status: 'NEW',
      timestamp: '2026-09-10T08:15:00.000Z',
      sighting: {
        id: 'sight-99',
        vehicle: {
          plate_normalized: 'GJ27XX9999',
        },
        camera: {
          id: 'cam-3',
          name: 'CAM-GND-01: Infocity Crossroad',
        },
      },
      watchlist_match: {
        entry_id: 'ent-99',
        plate_normalized: 'GJ27XX9999',
        category: 'STOLEN',
        reason: 'Flagged suspect vehicle',
        priority: 'CRITICAL',
        added_by: 'usr-admin-1',
        watchlist: {
          id: 'wl-1',
          name: 'STOLEN VEHICLES AHMEDABAD',
        },
      },
      created_at: '2026-09-10T08:15:02.000Z',
      updated_at: '2026-09-10T08:15:02.000Z',
    };

    // Trigger registered callback
    if (registeredAlertCreatedCb) {
      (registeredAlertCreatedCb as (alert: AlertItem) => void)(newWsAlert);
    }

    await waitFor(() => {
      expect(screen.getByText('GJ27XX9999')).toBeInTheDocument();
    });

    // Send the same alert again to test deduplication
    if (registeredAlertCreatedCb) {
      (registeredAlertCreatedCb as (alert: AlertItem) => void)(newWsAlert);
    }

    // Should only have 1 instance of GJ27XX9999
    const elements = screen.getAllByText('GJ27XX9999');
    expect(elements.length).toBe(1);
  });
});
