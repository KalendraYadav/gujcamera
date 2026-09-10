import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GisCameraMap } from '@/components/cameras/GisCameraMap';
import { camerasApi } from '@/lib/api/cameras';
import { Camera } from '@/types/camera';

// Mock cameras API
vi.mock('@/lib/api/cameras', () => ({
  camerasApi: {
    getCameras: vi.fn(),
  },
}));

// Mock MapLibre GL for jsdom environment
let mapEvents: Record<string, () => void> = {};
const mockGetBounds = vi.fn(() => ({
  getWest: () => 72.5,
  getSouth: () => 23.0,
  getEast: () => 72.65,
  getNorth: () => 23.25,
}));

const mockMarkerInstance = {
  setLngLat: vi.fn().mockReturnThis(),
  addTo: vi.fn().mockReturnThis(),
  remove: vi.fn(),
};

vi.mock('maplibre-gl', () => {
  const createMockMap = () => ({
    addControl: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      mapEvents[event] = cb;
      if (event === 'load') {
        setTimeout(cb, 0);
      }
    }),
    getBounds: mockGetBounds,
    remove: vi.fn(),
    flyTo: vi.fn(),
  });

  return {
    default: {
      Map: vi.fn().mockImplementation(createMockMap),
      NavigationControl: vi.fn(),
      AttributionControl: vi.fn(),
      Marker: vi.fn().mockImplementation(() => mockMarkerInstance),
    },
    Map: vi.fn().mockImplementation(createMockMap),
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
    Marker: vi.fn().mockImplementation(() => mockMarkerInstance),
  };
});

const MOCK_CAMERAS: Camera[] = [
  {
    id: 'cam-ahm-01-uuid',
    name: 'CAM-AHM-01: SG Highway',
    department_id: 'dept-ahm',
    department_name: 'Ahmedabad City Police',
    lat: 23.0338,
    long: 72.5073,
    protocol: 'RTSP',
    connector_type_id: 'conn-1',
    operational_status: 'ONLINE',
    is_active: true,
    created_at: '2026-09-09T01:58:24.045Z',
    updated_at: '2026-09-09T01:58:24.045Z',
    location: {
      address: 'SG Highway Pakwan Crossroad',
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
    id: 'cam-gnd-02-uuid',
    name: 'CAM-GND-02: CH-0 Circle',
    department_id: 'dept-gnd',
    department_name: 'Gandhinagar District Police',
    lat: 23.1985,
    long: 72.6288,
    protocol: 'RTSP',
    connector_type_id: 'conn-1',
    operational_status: 'DEGRADED',
    is_active: true,
    created_at: '2026-09-09T01:58:24.074Z',
    updated_at: '2026-09-09T01:58:24.074Z',
    location: {
      address: 'CH-0 Circle Entrance',
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

describe('GIS Camera Map Component (Phase 4B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapEvents = {};
  });

  it('renders tactical map HUD overlay with simulated data warning and map legend', async () => {
    (camerasApi.getCameras as any).mockResolvedValue({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });

    render(<GisCameraMap />);

    // Check simulated data indicator
    expect(screen.getByText(/SIMULATED DATA/i)).toBeInTheDocument();
    // Check HUD title
    expect(screen.getByText('GIS COMMAND MAP')).toBeInTheDocument();
    // Check map legend
    expect(screen.getByText(/Legend:/i)).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('queries backend cameras using the visible map bounding box on map load', async () => {
    (camerasApi.getCameras as any).mockResolvedValue({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });

    render(<GisCameraMap />);



    await waitFor(() => {
      expect(camerasApi.getCameras).toHaveBeenCalledWith({
        bbox: '72.500000,23.000000,72.650000,23.250000',
        limit: 100,
      });
    });
  });

  it('provides accessible camera side list panel for non-visual and keyboard navigation', async () => {
    (camerasApi.getCameras as any).mockResolvedValue({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });

    render(<GisCameraMap />);

    await waitFor(() => {
      expect(screen.getByText('Viewport Cameras')).toBeInTheDocument();
      expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      expect(screen.getByText('CAM-GND-02: CH-0 Circle')).toBeInTheDocument();
    });

    // Check accessible instructions
    expect(screen.getByText(/Keyboard accessible: Tab & Enter to select/i)).toBeInTheDocument();
  });

  it('opens CameraDetailDrawer when a camera is selected from the accessible list', async () => {
    (camerasApi.getCameras as any).mockResolvedValue({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });

    render(<GisCameraMap />);

    await waitFor(() => {
      expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
    });

    // Click camera in list
    fireEvent.click(screen.getByText('CAM-AHM-01: SG Highway'));

    // Drawer should appear
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('SG Highway Pakwan Crossroad').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/WGS-84 Coordinates/i)).toBeInTheDocument();
  });

  it('displays EmptyState when no cameras are in the visible viewport', async () => {
    (camerasApi.getCameras as any).mockResolvedValue({
      data: [],
      pagination: { limit: 100, total: 0, next_cursor: null },
    });

    render(<GisCameraMap />);

    await waitFor(() => {
      expect(screen.getByText('No Cameras in View')).toBeInTheDocument();
      expect(screen.getByText(/Pan or zoom out the map to inspect adjacent police zones/i)).toBeInTheDocument();
    });
  });

  it('displays ErrorState on spatial query failure without mock fallback', async () => {
    (camerasApi.getCameras as any).mockRejectedValue(new Error('Spatial PostGIS engine timeout'));

    render(<GisCameraMap />);

    await waitFor(() => {
      expect(screen.getByText('Spatial Query Failed')).toBeInTheDocument();
      expect(screen.getByText(/Spatial PostGIS engine timeout/i)).toBeInTheDocument();
    });

    // Verify no fake cameras are rendered
    expect(screen.queryByText('CAM-AHM-01: SG Highway')).not.toBeInTheDocument();
  });
});
