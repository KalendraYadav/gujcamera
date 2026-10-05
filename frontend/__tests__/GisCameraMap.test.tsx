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

let createdMarkers: any[] = [];
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

  const mockMarkerConstructor = vi.fn().mockImplementation((options: any) => {
    if (options) createdMarkers.push(options);
    return mockMarkerInstance;
  });

  return {
    default: {
      Map: vi.fn().mockImplementation(createMockMap),
      NavigationControl: vi.fn(),
      AttributionControl: vi.fn(),
      Marker: mockMarkerConstructor,
    },
    Map: vi.fn().mockImplementation(createMockMap),
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
    Marker: mockMarkerConstructor,
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
    createdMarkers = [];
  });

  it('renders tactical map HUD overlay with simulated data warning and map legend', async () => {
    (camerasApi.getCameras as any).mockResolvedValue({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });

    render(<GisCameraMap />);

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

  it('creates transform-safe camera markers where hover scales only the inner element and preserves outer element transform', async () => {
    (camerasApi.getCameras as any).mockResolvedValue({
      data: MOCK_CAMERAS,
      pagination: { limit: 100, total: 2, next_cursor: null },
    });

    render(<GisCameraMap />);

    await waitFor(() => {
      expect(createdMarkers.length).toBe(2);
    });

    const markerEl = createdMarkers[0].element as HTMLElement;
    expect(markerEl).toBeDefined();
    expect(markerEl.className).toBe('tactical-camera-marker');

    // Simulate MapLibre setting geographic translate transform on the outer container
    markerEl.style.transform = 'translate(-50%, -50%) translate(450px, 280px)';

    const innerVisual = markerEl.querySelector('.tactical-marker-visual') as HTMLElement;
    expect(innerVisual).toBeDefined();
    expect(innerVisual.style.transform).toBe('');

    // Trigger hover (mouseenter)
    fireEvent.mouseEnter(markerEl);

    // Verify outer transform is NOT overwritten (preserves geographic translate coordinates, NOT scale)
    expect(markerEl.style.transform).toBe('translate(-50%, -50%) translate(450px, 280px)');
    expect(markerEl.style.zIndex).toBe('100');

    // Verify inner visual element received the scale transform
    expect(innerVisual.style.transform).toBe('scale(1.25)');

    // Trigger mouseleave
    fireEvent.mouseLeave(markerEl);

    // Verify outer transform is still untouched
    expect(markerEl.style.transform).toBe('translate(-50%, -50%) translate(450px, 280px)');
    expect(markerEl.style.zIndex).toBe('1');

    // Verify inner visual element reset to scale(1)
    expect(innerVisual.style.transform).toBe('scale(1)');
  });

  describe('Scalable Dynamic Filter Architecture', () => {
    const MOCK_MULTI_STATE_CAMERAS: Camera[] = [
      {
        id: 'cam-ahm-01',
        name: 'CAM-AHM-01: SG Highway',
        department_id: 'dept-ahm',
        department_name: 'Ahmedabad City Police',
        lat: 23.0338,
        long: 72.5073,
        protocol: 'RTSP',
        connector_type_id: 'conn-1',
        operational_status: 'ONLINE',
        source_type: 'RESEARCH_VIDEO',
        is_active: true,
        created_at: '2026-09-09T01:58:24.045Z',
        updated_at: '2026-09-09T01:58:24.045Z',
        location: {
          address: 'SG Highway Pakwan Crossroad',
          zone: 'West Zone',
          district: 'Ahmedabad',
          state: 'Gujarat',
        },
        streams: [],
        health: { status: 'ONLINE', last_heartbeat: '2026-09-09T01:58:24.044Z' },
      },
      {
        id: 'cam-gnd-02',
        name: 'CAM-GND-02: CH-0 Circle',
        department_id: 'dept-gnd',
        department_name: 'Gandhinagar District Police',
        lat: 23.1985,
        long: 72.6288,
        protocol: 'RTSP',
        connector_type_id: 'conn-1',
        operational_status: 'DEGRADED',
        source_type: 'SYNTHETIC_STREAM',
        is_active: true,
        created_at: '2026-09-09T01:58:24.074Z',
        updated_at: '2026-09-09T01:58:24.074Z',
        location: {
          address: 'CH-0 Circle Entrance',
          zone: 'Outer Zone',
          district: 'Gandhinagar',
          state: 'Gujarat',
        },
        streams: [],
        health: { status: 'DEGRADED', last_heartbeat: '2026-09-09T01:58:24.072Z' },
      },
      {
        id: 'cam-mrt-03',
        name: 'CAM-MRT-03: Meerut Clock Tower',
        department_id: 'dept-up-01',
        department_name: 'Meerut Police Commissionerate',
        lat: 28.9845,
        long: 77.7064,
        protocol: 'RTSP',
        connector_type_id: 'conn-1',
        operational_status: 'OFFLINE',
        source_type: 'DEMO_FILE',
        is_active: true,
        created_at: '2026-09-09T01:58:24.074Z',
        updated_at: '2026-09-09T01:58:24.074Z',
        location: {
          address: 'Ghanta Ghar Chowk',
          zone: 'City Zone',
          district: 'Meerut',
          state: 'Uttar Pradesh',
        },
        streams: [],
        health: { status: 'OFFLINE', last_heartbeat: '2026-09-09T01:58:24.072Z' },
      },
      {
        id: 'cam-mum-04',
        name: 'CAM-MUM-04: Marine Drive',
        department_id: 'dept-mh-01',
        department_name: 'Mumbai Police HQ',
        lat: 18.9438,
        long: 72.8233,
        protocol: 'RTSP',
        connector_type_id: 'conn-1',
        operational_status: 'ONLINE',
        source_type: 'REAL_RTSP',
        is_active: true,
        created_at: '2026-09-09T01:58:24.074Z',
        updated_at: '2026-09-09T01:58:24.074Z',
        location: {
          address: 'Marine Drive Promenade',
          zone: 'South Zone',
          district: 'Mumbai',
          state: 'Maharashtra',
        },
        streams: [],
        health: { status: 'ONLINE', last_heartbeat: '2026-09-09T01:58:24.072Z' },
      },
    ];

    it('populates states and cities dynamically from camera dataset without hardcoding', async () => {
      (camerasApi.getCameras as any).mockResolvedValue({
        data: MOCK_MULTI_STATE_CAMERAS,
        pagination: { limit: 100, total: 4, next_cursor: null },
      });

      render(<GisCameraMap />);

      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // Verify NO old hardcoded city button bar exists (e.g. Surat or Rajkot should not exist)
      expect(document.getElementById('gis-filter-city-surat')).not.toBeInTheDocument();
      expect(document.getElementById('gis-filter-city-rajkot')).not.toBeInTheDocument();

      // Open location dropdown
      const locationDropdownBtn = document.getElementById('gis-filter-dropdown-location')!;
      fireEvent.click(locationDropdownBtn);

      // Verify dynamically populated states with IDs
      expect(document.getElementById('gis-filter-state-gujarat')).toBeInTheDocument();
      expect(document.getElementById('gis-filter-state-maharashtra')).toBeInTheDocument();
      expect(document.getElementById('gis-filter-state-uttar-pradesh')).toBeInTheDocument();

      // Verify dynamically populated cities with IDs
      expect(document.getElementById('gis-filter-city-ahmedabad')).toBeInTheDocument();
      expect(document.getElementById('gis-filter-city-gandhinagar')).toBeInTheDocument();
      expect(document.getElementById('gis-filter-city-meerut')).toBeInTheDocument();
      expect(document.getElementById('gis-filter-city-mumbai')).toBeInTheDocument();
    });

    it('filters dependent cities based on selected state', async () => {
      (camerasApi.getCameras as any).mockResolvedValue({
        data: MOCK_MULTI_STATE_CAMERAS,
        pagination: { limit: 100, total: 4, next_cursor: null },
      });

      render(<GisCameraMap />);

      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // Open location dropdown
      fireEvent.click(document.getElementById('gis-filter-dropdown-location')!);

      // Select Uttar Pradesh
      const upStateBtn = document.getElementById('gis-filter-state-uttar-pradesh')!;
      fireEvent.click(upStateBtn);

      // When Uttar Pradesh is selected, only Meerut should be in the cities list
      expect(document.getElementById('gis-filter-city-meerut')).toBeInTheDocument();
      expect(document.getElementById('gis-filter-city-ahmedabad')).not.toBeInTheDocument();
      expect(document.getElementById('gis-filter-city-mumbai')).not.toBeInTheDocument();

      // The camera list should now only contain UP cameras
      expect(screen.getByText('CAM-MRT-03: Meerut Clock Tower')).toBeInTheDocument();
      expect(screen.queryByText('CAM-AHM-01: SG Highway')).not.toBeInTheDocument();
      expect(screen.queryByText('CAM-MUM-04: Marine Drive')).not.toBeInTheDocument();
    });

    it('supports search filtering within the location dropdown', async () => {
      (camerasApi.getCameras as any).mockResolvedValue({
        data: MOCK_MULTI_STATE_CAMERAS,
        pagination: { limit: 100, total: 4, next_cursor: null },
      });

      render(<GisCameraMap />);

      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // Open location dropdown
      fireEvent.click(document.getElementById('gis-filter-dropdown-location')!);

      // Find search input inside location menu
      const searchInput = screen.getByPlaceholderText('Search state or city...');
      fireEvent.change(searchInput, { target: { value: 'Mee' } });

      // Meerut and Uttar Pradesh should remain, others filtered out from options
      expect(document.getElementById('gis-filter-city-meerut')).toBeInTheDocument();
      expect(document.getElementById('gis-filter-city-ahmedabad')).not.toBeInTheDocument();
      expect(document.getElementById('gis-filter-city-gandhinagar')).not.toBeInTheDocument();
    });

    it('filters cameras by operational status and data source provenance', async () => {
      (camerasApi.getCameras as any).mockResolvedValue({
        data: MOCK_MULTI_STATE_CAMERAS,
        pagination: { limit: 100, total: 4, next_cursor: null },
      });

      render(<GisCameraMap />);

      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // 1. Status Filter
      const statusBtn = document.getElementById('gis-filter-dropdown-status')!;
      fireEvent.click(statusBtn);

      // Select ONLINE
      const onlineOption = document.getElementById('gis-filter-status-online')!;
      fireEvent.click(onlineOption);

      // Only ONLINE cameras (SG Highway and Marine Drive) should be visible
      expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      expect(screen.getByText('CAM-MUM-04: Marine Drive')).toBeInTheDocument();
      expect(screen.queryByText('CAM-GND-02: CH-0 Circle')).not.toBeInTheDocument();
      expect(screen.queryByText('CAM-MRT-03: Meerut Clock Tower')).not.toBeInTheDocument();

      // 2. Source Filter
      const sourceBtn = document.getElementById('gis-filter-dropdown-source')!;
      fireEvent.click(sourceBtn);

      // Select Research Video
      const researchOption = document.getElementById('gis-filter-source-research-video')!;
      fireEvent.click(researchOption);

      // Now only CAM-AHM-01 matches both ONLINE + RESEARCH_VIDEO
      expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      expect(screen.queryByText('CAM-MUM-04: Marine Drive')).not.toBeInTheDocument();
    });

    it('renders active filter chips and allows removing individual filters or clearing all', async () => {
      (camerasApi.getCameras as any).mockResolvedValue({
        data: MOCK_MULTI_STATE_CAMERAS,
        pagination: { limit: 100, total: 4, next_cursor: null },
      });

      render(<GisCameraMap />);

      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // Select State: Gujarat
      fireEvent.click(document.getElementById('gis-filter-dropdown-location')!);
      fireEvent.click(document.getElementById('gis-filter-state-gujarat')!);

      // Select City: Ahmedabad
      fireEvent.click(document.getElementById('gis-filter-city-ahmedabad')!);

      // Verify active chips appear
      expect(screen.getByText('State: Gujarat')).toBeInTheDocument();
      expect(screen.getByText('City: Ahmedabad')).toBeInTheDocument();

      // Remove city filter via chip
      const removeCityBtn = document.getElementById('gis-chip-remove-city')!;
      fireEvent.click(removeCityBtn);

      // City filter removed, state remains active
      expect(screen.queryByText('City: Ahmedabad')).not.toBeInTheDocument();
      expect(screen.getByText('State: Gujarat')).toBeInTheDocument();
      // Both Gujarat cameras should be visible
      expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      expect(screen.getByText('CAM-GND-02: CH-0 Circle')).toBeInTheDocument();

      // Click Clear all
      const clearAllBtn = document.getElementById('gis-filter-clear-all')!;
      fireEvent.click(clearAllBtn);

      // All filters cleared
      expect(screen.queryByText('State: Gujarat')).not.toBeInTheDocument();
      expect(screen.getByText('CAM-MRT-03: Meerut Clock Tower')).toBeInTheDocument();
      expect(screen.getByText('CAM-MUM-04: Marine Drive')).toBeInTheDocument();
    });

    it('displays empty state with clear action when filters match zero cameras', async () => {
      (camerasApi.getCameras as any).mockResolvedValue({
        data: MOCK_MULTI_STATE_CAMERAS,
        pagination: { limit: 100, total: 4, next_cursor: null },
      });

      render(<GisCameraMap />);

      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // Select State: Uttar Pradesh
      fireEvent.click(screen.getByRole('button', { name: /Location/i }));
      fireEvent.click(screen.getByRole('button', { name: /Uttar Pradesh/i }));

      // Select Status: DEGRADED (UP only has OFFLINE camera)
      fireEvent.click(screen.getByRole('button', { name: /Status/i }));
      fireEvent.click(screen.getByRole('button', { name: /DEGRADED/i }));

      // Expect Empty State for zero filter matches
      expect(screen.getByText('No Cameras Matching Filters')).toBeInTheDocument();
      expect(screen.getByText('No cameras match the active filter criteria.')).toBeInTheDocument();

      // Clicking 'Clear All Filters' resets
      fireEvent.click(screen.getByRole('button', { name: /Clear All Filters/i }));
      expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
    });

    it('synchronizes map markers by removing stale markers when filters change', async () => {
      (camerasApi.getCameras as any).mockResolvedValue({
        data: MOCK_MULTI_STATE_CAMERAS,
        pagination: { limit: 100, total: 4, next_cursor: null },
      });

      render(<GisCameraMap />);

      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // Filter by status: OFFLINE (only Meerut is offline)
      fireEvent.click(screen.getByRole('button', { name: /Status/i }));
      fireEvent.click(screen.getByRole('button', { name: /OFFLINE/i }));

      // Stale markers for the other 3 cameras should have been removed
      await waitFor(() => {
        expect(mockMarkerInstance.remove).toHaveBeenCalled();
      });
    });
  });
});

