import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FleetAdminPage from '@/app/admin/page';
import { camerasApi } from '@/lib/api/cameras';

vi.mock('@/lib/api/cameras', () => ({
  camerasApi: {
    getConnectors: vi.fn(),
    testConnection: vi.fn(),
    createCamera: vi.fn(),
  },
}));

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-usr-1',
      email: 'admin.demo@gujcamera.local',
      role: 'SUPER_ADMIN',
      department_name: 'Ahmedabad City Police',
    },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn() }),
}));

describe('Fleet Administration & Camera Onboarding UI (Phase 4F)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(camerasApi.getConnectors).mockResolvedValue({
      connectors: [
        {
          id: 'conn-rtsp-uuid',
          adapter_type: 'RTSP_GENERIC',
          config_ref: 'vault://connectors/rtsp-standard-h264',
          created_at: new Date().toISOString(),
        },
        {
          id: 'conn-onvif-uuid',
          adapter_type: 'ONVIF_PROFILE_S',
          config_ref: 'vault://connectors/onvif-profiles-s',
          created_at: new Date().toISOString(),
        },
      ],
      supported_protocols: ['RTSP', 'ONVIF'],
    });

    vi.mocked(camerasApi.testConnection).mockResolvedValue({
      status: 'CONNECTED',
      protocol: 'RTSP',
      reachable: true,
      latencyMs: 14,
      streamMetadata: {
        codec: 'H264',
        resolution: '1920x1080',
        fps: 25,
        streamUri: 'rtsp://localhost:8554/live/cam-ahm-01',
      },
      testedAt: new Date().toISOString(),
    });

    vi.mocked(camerasApi.createCamera).mockResolvedValue({
      id: 'new-cam-uuid-888',
      name: 'CAM-AHM-07: SG Highway - Thaltej Crossroad Junction',
      department_id: 'd1111111-0000-0000-0000-000000000001',
      lat: 23.05128,
      long: 72.51842,
      protocol: 'RTSP',
      connector_type_id: 'conn-rtsp-uuid',
      operational_status: 'ONLINE',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      location: {
        address: 'Thaltej Crossroad, SG Highway',
        zone: 'West Zone',
        district: 'Ahmedabad',
      },
      streams: [],
      health: null,
    });
  });

  it('renders page header with Phase 4F badge and protocol architecture disclaimers', async () => {
    render(<FleetAdminPage />);

    expect(screen.getAllByText('Phase 4F').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Fleet Administration & Camera Onboarding')).toBeInTheDocument();

    expect(screen.getByText(/Authoritative Protocol Architecture Boundary/i)).toBeInTheDocument();
    expect(screen.getByText(/Real Protocol Implementation/i)).toBeInTheDocument();
  });

  it('switches between RTSP and ONVIF protocol configurations', async () => {
    render(<FleetAdminPage />);

    // Initial default is RTSP
    expect(screen.getByText('RTSP Adapter')).toBeInTheDocument();
    expect(screen.getByText('ONVIF Adapter')).toBeInTheDocument();

    const onvifButton = screen.getByRole('button', { name: /ONVIF Adapter/i });
    fireEvent.click(onvifButton);

    // Verify endpoint label switches to ONVIF
    expect(screen.getByText(/ONVIF Device Service URL \*/i)).toBeInTheDocument();
    const endpointInput = screen.getByDisplayValue('http://localhost:8555/onvif/device_service');
    expect(endpointInput).toBeInTheDocument();
  });

  it('executes protocol adapter connection probe and displays probe results', async () => {
    render(<FleetAdminPage />);

    const testButton = screen.getByRole('button', { name: /Test Connection \(RTSP\)/i });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(camerasApi.testConnection).toHaveBeenCalledWith({
        protocol: 'RTSP',
        url_or_handle: 'rtsp://localhost:8554/live/cam-ahm-01',
        username: 'admin',
        password: undefined,
        timeoutMs: 5000,
      });
    });

    // Check probe results in DOM
    await waitFor(() => {
      expect(screen.getByText('14 ms')).toBeInTheDocument();
      expect(screen.getByText('H264')).toBeInTheDocument();
      expect(screen.getByText('REACHABLE')).toBeInTheDocument();
    });
  });

  it('displays degraded status when connection probe returns auth failure', async () => {
    vi.mocked(camerasApi.testConnection).mockResolvedValueOnce({
      status: 'DEGRADED',
      protocol: 'ONVIF',
      reachable: true,
      latencyMs: 25,
      errorMessage: 'ONVIF Authentication Failed: Invalid WS-Security UsernameToken credentials',
      testedAt: new Date().toISOString(),
    });

    render(<FleetAdminPage />);

    const onvifButton = screen.getByRole('button', { name: /ONVIF Adapter/i });
    fireEvent.click(onvifButton);

    const testButton = screen.getByRole('button', { name: /Test Connection \(ONVIF\)/i });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/ONVIF Authentication Failed/i)).toBeInTheDocument();
    });
  });

  it('submits camera onboarding form and renders success notification', async () => {
    render(<FleetAdminPage />);

    const submitButton = screen.getByRole('button', { name: /Register Camera in Fleet/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(camerasApi.createCamera).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/successfully onboarded with ID new-cam-uuid-888/i)).toBeInTheDocument();
    });
  });
});
