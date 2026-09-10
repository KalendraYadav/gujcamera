import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CameraRegistryPage from '@/app/cameras/page';
import { camerasApi } from '@/lib/api/cameras';
import { Camera, CameraHealthSummary } from '@/types/camera';

// Mock cameras API
vi.mock('@/lib/api/cameras', () => ({
  camerasApi: {
    getCameras: vi.fn(),
    getCameraHealthSummary: vi.fn(),
    getCameraById: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-admin-1',
      email: 'admin.demo@gujcamera.local',
      role: 'SUPER_ADMIN',
      department_name: 'DGP Headquarters',
    },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

// Mock Next Navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/cameras',
  useRouter: () => ({ push: vi.fn() }),
}));

const MOCK_CAMERAS: Camera[] = [
  {
    id: '3c93c2d0-adea-484c-a813-9d2fb65d6df5',
    name: 'CAM-AHM-01: SG Highway - Pakwan Crossroad',
    department_id: 'dept-ahm',
    department_name: 'Ahmedabad City Police Commissionerate',
    lat: 23.0338142,
    long: 72.5073289,
    protocol: 'RTSP',
    connector_type_id: 'conn-rtsp-generic',
    operational_status: 'ONLINE',
    is_active: true,
    created_at: '2026-09-09T01:58:24.045Z',
    updated_at: '2026-09-09T01:58:24.045Z',
    location: {
      address: 'Pakwan Crossroad, SG Highway',
      zone: 'West Zone',
      district: 'Ahmedabad',
    },
    streams: [
      {
        id: 'stream-1',
        codec: 'h264',
        resolution: '1920x1080',
        fps: 25,
        url_or_handle: 'rtsp://simulator:8554/live/cam-ahm-01',
      },
    ],
    health: {
      status: 'ONLINE',
      last_heartbeat: '2026-09-09T01:58:24.044Z',
      fps_actual: 25,
      packet_loss: 0,
    },
  },
  {
    id: '4b3e85c4-56b0-42bb-9cd7-77ee6c965933',
    name: 'CAM-GND-02: CH-0 Circle',
    department_id: 'dept-gnd',
    department_name: 'Gandhinagar District Police',
    lat: 23.19854,
    long: 72.62883,
    protocol: 'RTSP',
    connector_type_id: 'conn-rtsp-generic',
    operational_status: 'DEGRADED',
    is_active: true,
    created_at: '2026-09-09T01:58:24.074Z',
    updated_at: '2026-09-09T01:58:24.074Z',
    location: {
      address: 'CH-0 Circle, Gandhinagar Entrance',
      zone: 'Outer Zone',
      district: 'Gandhinagar',
    },
    streams: [
      {
        id: 'stream-2',
        codec: 'h264',
        resolution: '1920x1080',
        fps: 15,
        url_or_handle: 'rtsp://simulator:8554/live/cam-gnd-02',
      },
    ],
    health: {
      status: 'DEGRADED',
      last_heartbeat: '2026-09-09T01:58:24.072Z',
      fps_actual: 15,
      packet_loss: 4.5,
    },
  },
];

const MOCK_SUMMARY: CameraHealthSummary = {
  total_cameras: 2,
  online: 1,
  degraded: 1,
  offline: 0,
  connecting: 0,
  error: 0,
  decommissioned: 0,
  note: 'Operational telemetry summary',
};

describe('Camera Registry UI Component (Phase 4B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially during API fetch', () => {
    (camerasApi.getCameras as any).mockReturnValue(new Promise(() => {}));
    (camerasApi.getCameraHealthSummary as any).mockReturnValue(new Promise(() => {}));

    render(<CameraRegistryPage />);
    expect(screen.getByText(/Loading CCTV camera registry/i)).toBeInTheDocument();
  });

  it('renders real-shaped camera list and operational health telemetry cards', async () => {
    (camerasApi.getCameras as any).mockResolvedValueOnce({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });
    (camerasApi.getCameraHealthSummary as any).mockResolvedValueOnce(MOCK_SUMMARY);

    render(<CameraRegistryPage />);

    // Check title
    await waitFor(() => {
      expect(screen.getByText('CCTV Camera Registry')).toBeInTheDocument();
    });

    // Check health summary metrics
    expect(screen.getByText('Total Registered Cameras')).toBeInTheDocument();
    expect(screen.getByText('Online & Operational')).toBeInTheDocument();
    expect(screen.getByText('Degraded Performance')).toBeInTheDocument();

    // Check cameras in table
    expect(screen.getByText('CAM-AHM-01: SG Highway - Pakwan Crossroad')).toBeInTheDocument();
    expect(screen.getByText('CAM-GND-02: CH-0 Circle')).toBeInTheDocument();

    // Check status badges
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByText('DEGRADED')).toBeInTheDocument();

    // Check persistent simulated data notice
    expect(screen.getAllByText(/SIMULATED DATA/i).length).toBeGreaterThanOrEqual(1);
  });

  it('filters cameras dynamically by search text', async () => {
    (camerasApi.getCameras as any).mockResolvedValueOnce({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });
    (camerasApi.getCameraHealthSummary as any).mockResolvedValueOnce(MOCK_SUMMARY);

    render(<CameraRegistryPage />);

    await waitFor(() => {
      expect(screen.getByText('CAM-AHM-01: SG Highway - Pakwan Crossroad')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/Search camera registry/i);
    fireEvent.change(searchInput, { target: { value: 'Gandhinagar' } });

    // Gandhinagar camera should remain visible
    expect(screen.getByText('CAM-GND-02: CH-0 Circle')).toBeInTheDocument();
    // Ahmedabad camera should be filtered out
    expect(screen.queryByText('CAM-AHM-01: SG Highway - Pakwan Crossroad')).not.toBeInTheDocument();
  });

  it('filters cameras by operational status dropdown', async () => {
    (camerasApi.getCameras as any).mockResolvedValueOnce({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });
    (camerasApi.getCameraHealthSummary as any).mockResolvedValueOnce(MOCK_SUMMARY);

    render(<CameraRegistryPage />);

    await waitFor(() => {
      expect(screen.getByText('CAM-AHM-01: SG Highway - Pakwan Crossroad')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText(/Status:/i);
    fireEvent.change(statusSelect, { target: { value: 'DEGRADED' } });

    expect(screen.getByText('CAM-GND-02: CH-0 Circle')).toBeInTheDocument();
    expect(screen.queryByText('CAM-AHM-01: SG Highway - Pakwan Crossroad')).not.toBeInTheDocument();
  });

  it('opens CameraDetailDrawer upon clicking a camera row', async () => {
    (camerasApi.getCameras as any).mockResolvedValueOnce({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });
    (camerasApi.getCameraHealthSummary as any).mockResolvedValueOnce(MOCK_SUMMARY);

    render(<CameraRegistryPage />);

    await waitFor(() => {
      expect(screen.getByText('CAM-AHM-01: SG Highway - Pakwan Crossroad')).toBeInTheDocument();
    });

    // Click on camera row
    const row = screen.getByText('CAM-AHM-01: SG Highway - Pakwan Crossroad');
    fireEvent.click(row);

    // Camera detail drawer should open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Physical Location & GIS Coordinates/i)).toBeInTheDocument();
    expect(screen.getAllByText('Pakwan Crossroad, SG Highway').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Hardware & Stream Configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Video Preview Disabled/i)).toBeInTheDocument();
  });

  it('displays EmptyState when search yields no matches', async () => {
    (camerasApi.getCameras as any).mockResolvedValueOnce({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });
    (camerasApi.getCameraHealthSummary as any).mockResolvedValueOnce(MOCK_SUMMARY);

    render(<CameraRegistryPage />);

    await waitFor(() => {
      expect(screen.getByText('CAM-AHM-01: SG Highway - Pakwan Crossroad')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/Search camera registry/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Camera Code 9999' } });

    expect(screen.getByText('No Cameras Found')).toBeInTheDocument();
  });

  it('displays ErrorState on API failure without mock fallback', async () => {
    (camerasApi.getCameras as any).mockRejectedValueOnce(new Error('PostGIS database connection failed'));
    (camerasApi.getCameraHealthSummary as any).mockRejectedValueOnce(new Error('Connection failed'));

    render(<CameraRegistryPage />);

    await waitFor(() => {
      expect(screen.getByText(/Camera Registry Unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/PostGIS database connection failed/i)).toBeInTheDocument();
    });

    // Ensure no fake cameras are displayed
    expect(screen.queryByText('CAM-AHM-01: SG Highway - Pakwan Crossroad')).not.toBeInTheDocument();
  });
});
