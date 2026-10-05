// ==============================================================================
// Live CCTV Monitoring & Stream Playback Component Tests
// Gujarat Police Innovation Challenge 2026
// ==============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LiveMonitoringPage from '@/app/live/page';
import { LivePlayer } from '@/components/live/LivePlayer';
import { CameraSelector } from '@/components/live/CameraSelector';
import { StreamUnavailable } from '@/components/live/StreamUnavailable';
import { camerasApi } from '@/lib/api/cameras';
import { Camera } from '@/types/camera';

// Mock cameras API
vi.mock('@/lib/api/cameras', () => ({
  camerasApi: {
    getCameras: vi.fn(),
  },
}));

// Mock AuthContext
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-operator-1',
      email: 'operator.demo@gujcamera.local',
      role: 'OPERATOR',
      department_name: 'Ahmedabad City Police',
    },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

// Mock Next Navigation
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/live',
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock hls.js
const mockHlsInstance = {
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
  stopLoad: vi.fn(),
  detachMedia: vi.fn(),
  startLoad: vi.fn(),
  recoverMediaError: vi.fn(),
};

vi.mock('hls.js', () => {
  const MockClass = vi.fn().mockImplementation(() => mockHlsInstance);
  const isSupported = vi.fn().mockReturnValue(true);
  (MockClass as any).isSupported = isSupported;
  (MockClass as any).Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    LEVEL_LOADED: 'hlsLevelLoaded',
    AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
    ERROR: 'hlsError',
  };
  (MockClass as any).ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
    OTHER_ERROR: 'otherError',
  };
  return {
    default: MockClass,
    __esModule: true,
    isSupported,
    Events: (MockClass as any).Events,
    ErrorTypes: (MockClass as any).ErrorTypes,
  };
});

const MOCK_CAMERAS: Camera[] = [
  {
    id: 'cam-01',
    name: 'CAM-AHM-01',
    department_id: 'dept-ahm',
    department_name: 'Ahmedabad Police',
    lat: 23.0338,
    long: 72.5073,
    protocol: 'RTSP',
    connector_type_id: 'conn-01',
    operational_status: 'ONLINE',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    location: { address: 'Pakwan Crossroad', zone: 'West Zone', district: 'Ahmedabad' },
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
      last_heartbeat: '2026-09-10T06:00:00Z',
      fps_actual: 24.9,
      packet_loss: 0.01,
    },
  },
  {
    id: 'cam-02',
    name: 'CAM-AHM-02',
    department_id: 'dept-ahm',
    department_name: 'Ahmedabad Police',
    lat: 23.0225,
    long: 72.5714,
    protocol: 'RTSP',
    connector_type_id: 'conn-01',
    operational_status: 'ONLINE',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    location: { address: 'Income Tax Circle', zone: 'Central Zone', district: 'Ahmedabad' },
    streams: [
      {
        id: 'stream-2',
        codec: 'h264',
        resolution: '1920x1080',
        fps: 25,
        url_or_handle: 'rtsp://simulator:8554/live/cam-ahm-02',
      },
    ],
    health: {
      status: 'ONLINE',
      last_heartbeat: '2026-09-10T06:00:00Z',
      fps_actual: 25.0,
      packet_loss: 0.0,
    },
  },
  {
    id: 'cam-03',
    name: 'CAM-GND-01',
    department_id: 'dept-gnd',
    department_name: 'Gandhinagar Police',
    lat: 23.2156,
    long: 72.6369,
    protocol: 'MOCK_VENDOR',
    connector_type_id: 'conn-mock',
    operational_status: 'ONLINE',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    location: { address: 'CH-3 Circle', zone: 'Sector 6', district: 'Gandhinagar' },
    streams: [
      {
        id: 'stream-3',
        codec: 'mock',
        resolution: '1920x1080',
        fps: 30,
        url_or_handle: 'mock://vendor-a/gnd-sec-01',
      },
    ],
    health: {
      status: 'ONLINE',
      last_heartbeat: '2026-09-10T06:00:00Z',
      fps_actual: 30.0,
      packet_loss: 0.0,
    },
  },
];

describe('Live CCTV Monitoring Page & Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('camera');
    (camerasApi.getCameras as any).mockResolvedValue({
      data: MOCK_CAMERAS,
      pagination: { limit: 50, total: 3, next_cursor: null },
    });

    // Mock HTMLMediaElement methods in JSDOM
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
  });

  it('renders live monitoring console and loads cameras', async () => {
    render(<LiveMonitoringPage />);

    // Check header
    expect(screen.getByText('Live Video Monitoring')).toBeInTheDocument();

    // Wait for cameras to load
    await waitFor(() => {
      expect(screen.getByTestId('camera-item-CAM-AHM-01')).toBeInTheDocument();
      expect(screen.getByTestId('camera-item-CAM-AHM-02')).toBeInTheDocument();
      expect(screen.getByTestId('camera-item-CAM-GND-01')).toBeInTheDocument();
    });
  });

  it('initializes HLS player for RTSP camera (CAM-AHM-01)', async () => {
    render(<LiveMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByTestId('live-player-container')).toBeInTheDocument();
      expect(screen.getByTestId('live-video-element')).toBeInTheDocument();
    });

    // Verify hls.js was attached with converted HLS URL
    await waitFor(() => {
      expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(
        'http://localhost:8888/live/cam-ahm-01/index.m3u8'
      );
    });
  });

  it('decouples Camera Operational Status from Playback Status', async () => {
    render(<LiveMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByTestId('camera-telemetry-card')).toBeInTheDocument();
    });

    // PostgreSQL status says ONLINE
    expect(screen.getByText('CAMERA HEALTH:')).toBeInTheDocument();
    expect(screen.getByText('PLAYBACK HEALTH:')).toBeInTheDocument();
    expect(screen.getByTestId('live-playback-status-pill')).toBeInTheDocument();
  });

  it('displays honest non-playable state for CAM-GND-01 (mock protocol)', async () => {
    render(<LiveMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByTestId('camera-item-CAM-GND-01')).toBeInTheDocument();
    });

    // Select CAM-GND-01
    fireEvent.click(screen.getByTestId('camera-item-CAM-GND-01'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-unavailable-panel')).toBeInTheDocument();
      expect(
        screen.getByText(/CAM-GND-01 — No Browser-Playable Feed/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Stream protocol 'mock' is not supported for browser playback/i)
      ).toBeInTheDocument();
    });
  });

  it('switches camera and destroys previous HLS instance cleanly', async () => {
    render(<LiveMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByTestId('camera-item-CAM-AHM-02')).toBeInTheDocument();
    });

    // Switch to CAM-AHM-02
    fireEvent.click(screen.getByTestId('camera-item-CAM-AHM-02'));

    await waitFor(() => {
      expect(mockHlsInstance.destroy).toHaveBeenCalled();
      expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(
        'http://localhost:8888/live/cam-ahm-02/index.m3u8'
      );
    });
  });

  it('filters cameras by status in CameraSelector', async () => {
    render(
      <CameraSelector
        cameras={MOCK_CAMERAS}
        selectedCameraId="cam-01"
        onSelectCamera={vi.fn()}
      />
    );

    expect(screen.getByTestId('camera-item-CAM-AHM-01')).toBeInTheDocument();
    expect(screen.getByTestId('camera-item-CAM-AHM-02')).toBeInTheDocument();
    expect(screen.getByTestId('camera-item-CAM-GND-01')).toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByTestId('camera-search-input');
    fireEvent.change(searchInput, { target: { value: 'Pakwan' } });

    expect(screen.getByTestId('camera-item-CAM-AHM-01')).toBeInTheDocument();
    expect(screen.queryByTestId('camera-item-CAM-AHM-02')).not.toBeInTheDocument();
  });

  it('provides manual retry button when stream encounters failure and hides audio button when no audio track', async () => {
    render(
      <LivePlayer
        streamUrl="http://localhost:8888/live/cam-ahm-01/index.m3u8"
        camera={MOCK_CAMERAS[0]}
      />
    );

    // Initial state shows connecting or player container
    expect(screen.getByTestId('live-player-container')).toBeInTheDocument();
    expect(screen.getByTestId('player-control-bar')).toBeInTheDocument();
    expect(screen.getByTestId('player-play-pause-button')).toBeInTheDocument();
    expect(screen.getByTestId('player-reload-button')).toBeInTheDocument();
    // Audio control must be hidden for demo CCTV streams without audio tracks
    expect(screen.queryByTestId('player-mute-button')).not.toBeInTheDocument();
  });

  it('does not render speaker/mute control when stream has no audio track', () => {
    render(
      <LivePlayer
        streamUrl="http://localhost:8888/live/cam-gnd-02/index.m3u8"
        camera={MOCK_CAMERAS[0]}
      />
    );

    // Speaker/mute control should not be rendered when audio is unavailable
    expect(screen.queryByTestId('player-mute-button')).not.toBeInTheDocument();
  });

  it('selects camera via URL search query parameter', async () => {
    mockSearchParams.set('camera', 'CAM-AHM-02');

    render(<LiveMonitoringPage />);

    await waitFor(() => {
      // Should select CAM-AHM-02 directly and load its stream
      expect(screen.getAllByText(/CAM-AHM-02/).length).toBeGreaterThan(0);
      expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(
        'http://localhost:8888/live/cam-ahm-02/index.m3u8'
      );
    });
  });

  it('displays ErrorState when camera registry API fails', async () => {
    (camerasApi.getCameras as any).mockRejectedValueOnce(
      new Error('Failed to connect to backend camera registry')
    );

    render(<LiveMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByText('Stream Registry Error')).toBeInTheDocument();
      expect(
        screen.getByText('Failed to connect to backend camera registry')
      ).toBeInTheDocument();
    });
  });

  it('destroys HLS instance upon LivePlayer unmount', () => {
    const { unmount } = render(
      <LivePlayer
        streamUrl="http://localhost:8888/live/cam-ahm-01/index.m3u8"
        camera={MOCK_CAMERAS[0]}
      />
    );

    unmount();
    expect(mockHlsInstance.destroy).toHaveBeenCalled();
  });

  it('correctly displays packet loss as bounded percentage without multiplying by 100', async () => {
    const cameraWithPacketLoss: Camera = {
      ...MOCK_CAMERAS[0],
      id: 'cam-degraded',
      name: 'CAM-GND-02',
      operational_status: 'DEGRADED',
      health: {
        status: 'DEGRADED',
        last_heartbeat: '2026-09-10T06:00:00Z',
        fps_actual: 15.0,
        packet_loss: 4.5,
      },
    };

    (camerasApi.getCameras as any).mockResolvedValueOnce({
      data: [cameraWithPacketLoss],
      pagination: { limit: 50, total: 1, next_cursor: null },
    });

    render(<LiveMonitoringPage />);

    await waitFor(() => {
      expect(screen.getByTestId('camera-telemetry-card')).toBeInTheDocument();
      // Should display 4.50% and definitely NOT 450.00%
      expect(screen.getByText('4.50%')).toBeInTheDocument();
      expect(screen.queryByText('450.00%')).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // PART 1 & 2 TESTS: COMPACT CAMERA CARDS, INFO POPOVER & SCALABLE LOCATION FILTERING
  // --------------------------------------------------------------------------

  const MOCK_MULTI_REGION_CAMERAS: Camera[] = [
    {
      id: 'cam-ahm-01',
      name: 'CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)',
      department_id: 'dept-ahm',
      department_name: 'Ahmedabad Police',
      lat: 23.0338,
      long: 72.5073,
      protocol: 'RTSP',
      connector_type_id: 'conn-01',
      operational_status: 'ONLINE',
      source_type: 'REAL_RTSP',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      location: {
        address: 'SG Highway Pakwan Crossroad, Sector 4',
        zone: 'West Zone',
        district: 'Ahmedabad',
        state: 'Gujarat',
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
        last_heartbeat: '2026-09-10T06:00:00Z',
        fps_actual: 25.0,
        packet_loss: 0.0,
      },
    },
    {
      id: 'cam-sur-01',
      name: 'CAM-SUR-01: Ring Road Majura Gate',
      department_id: 'dept-sur',
      department_name: 'Surat City Police',
      lat: 21.1702,
      long: 72.8311,
      protocol: 'RTSP',
      connector_type_id: 'conn-02',
      operational_status: 'DEGRADED',
      source_type: 'RESEARCH_VIDEO',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      location: {
        address: 'Majura Gate Junction',
        zone: 'Central Zone',
        district: 'Surat',
        state: 'Gujarat',
      },
      streams: [
        {
          id: 'stream-2',
          codec: 'h265',
          resolution: '1280x720',
          fps: 30,
          url_or_handle: 'rtsp://simulator:8554/live/cam-sur-01',
        },
      ],
      health: {
        status: 'DEGRADED',
        last_heartbeat: '2026-09-10T06:00:00Z',
        fps_actual: 18.0,
        packet_loss: 4.2,
      },
    },
    {
      id: 'cam-mrt-01',
      name: 'CAM-MRT-01: Clock Tower Meerut',
      department_id: 'dept-up-01',
      department_name: 'Meerut Police',
      lat: 28.9845,
      long: 77.7064,
      protocol: 'ONVIF',
      connector_type_id: 'conn-03',
      operational_status: 'OFFLINE',
      source_type: 'SYNTHETIC_STREAM',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      location: {
        address: 'Ghanta Ghar Chowk',
        zone: 'City Zone',
        district: 'Meerut',
        state: 'Uttar Pradesh',
      },
      streams: [],
      health: {
        status: 'OFFLINE',
        last_heartbeat: '2026-09-10T06:00:00Z',
        fps_actual: 0,
        packet_loss: 100.0,
      },
    },
  ];

  describe('Compact Camera Cards & Information Popover (Part 1)', () => {
    it('renders compact camera identity and hides long secondary specs from permanent card', () => {
      render(
        <CameraSelector
          cameras={MOCK_MULTI_REGION_CAMERAS}
          selectedCameraId="cam-ahm-01"
          onSelectCamera={vi.fn()}
        />
      );

      // Camera ID code is prominently visible
      expect(screen.getByText('CAM-AHM-01')).toBeInTheDocument();
      // Short name is visible
      expect(screen.getByText('SG Highway Pakwan Junction (RESEARCH)')).toBeInTheDocument();
      // Operational status is visible
      expect(screen.getByText('ONLINE')).toBeInTheDocument();

      // Technical stream specs (1920x1080 • 25 FPS • h264) are NOT permanently displayed on card
      expect(screen.queryByText(/1920x1080/)).not.toBeInTheDocument();
      expect(screen.queryByText(/25 FPS • h264/)).not.toBeInTheDocument();

      // Information icon button exists
      expect(
        screen.getByTestId('camera-info-btn-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)')
      ).toBeInTheDocument();
    });

    it('opens information popover on demand with full specifications and closes on outside click', () => {
      const mockSelect = vi.fn();
      render(
        <CameraSelector
          cameras={MOCK_MULTI_REGION_CAMERAS}
          selectedCameraId="cam-ahm-01"
          onSelectCamera={mockSelect}
        />
      );

      const infoBtn = screen.getByTestId(
        'camera-info-btn-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
      );

      // Clicking info icon opens popover without selecting camera
      fireEvent.click(infoBtn);
      expect(mockSelect).not.toHaveBeenCalled();

      // Popover is now rendered
      const popover = screen.getByTestId(
        'camera-info-popover-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
      );
      expect(popover).toBeInTheDocument();

      // Contains detailed secondary specs
      expect(screen.getByText('Camera Information')).toBeInTheDocument();
      expect(screen.getByText(/1920x1080 • 25 FPS • h264/)).toBeInTheDocument();
      expect(screen.getByText('SG Highway Pakwan Crossroad, Sector 4 (West Zone)')).toBeInTheDocument();
      expect(screen.getByText('Ahmedabad Police')).toBeInTheDocument();
      expect(screen.getByText('23.0338°N, 72.5073°E')).toBeInTheDocument();

      // Verify compact popover container styling class
      expect(popover).toHaveClass('camera-info-popover');

      // Clicking inside popover does not select camera
      fireEvent.click(popover);
      expect(mockSelect).not.toHaveBeenCalled();

      // Outside click closes popover
      fireEvent.mouseDown(document.body);
      expect(
        screen.queryByTestId(
          'camera-info-popover-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
        )
      ).not.toBeInTheDocument();
    });

    it('enforces dark institutional camera-feed-card styling without netrava-nav-link white hover regression', () => {
      render(
        <CameraSelector
          cameras={MOCK_MULTI_REGION_CAMERAS}
          selectedCameraId="cam-ahm-01"
          onSelectCamera={vi.fn()}
        />
      );

      const selectedCard = screen.getByTestId(
        'camera-item-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
      );
      const unselectedCard = screen.getByTestId(
        'camera-item-CAM-SUR-01: Ring Road Majura Gate'
      );

      // Must have dedicated .camera-feed-card class
      expect(selectedCard).toHaveClass('camera-feed-card');
      expect(unselectedCard).toHaveClass('camera-feed-card');

      // Must NOT use .netrava-nav-link which caused the cream/white hover regression
      expect(selectedCard).not.toHaveClass('netrava-nav-link');
      expect(unselectedCard).not.toHaveClass('netrava-nav-link');

      // Selected card retains .active crimson operational highlight class
      expect(selectedCard).toHaveClass('active');
      expect(unselectedCard).not.toHaveClass('active');
    });

    it('closes information popover when Escape key or close button is pressed', () => {
      render(
        <CameraSelector
          cameras={MOCK_MULTI_REGION_CAMERAS}
          selectedCameraId="cam-ahm-01"
          onSelectCamera={vi.fn()}
        />
      );

      const infoBtn = screen.getByTestId(
        'camera-info-btn-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
      );
      fireEvent.click(infoBtn);
      expect(
        screen.getByTestId(
          'camera-info-popover-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
        )
      ).toBeInTheDocument();

      // Press Escape key
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(
        screen.queryByTestId(
          'camera-info-popover-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
        )
      ).not.toBeInTheDocument();

      // Test close button
      fireEvent.click(infoBtn);
      const closeBtn = screen.getByRole('button', { name: 'Close specifications' });
      fireEvent.click(closeBtn);
      expect(
        screen.queryByTestId(
          'camera-info-popover-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
        )
      ).not.toBeInTheDocument();
    });
  });

  describe('Scalable Dynamic Location & Multi-faceted Filtering (Part 2)', () => {
    it('populates state and city options dynamically from camera dataset', () => {
      render(
        <CameraSelector
          cameras={MOCK_MULTI_REGION_CAMERAS}
          selectedCameraId="cam-ahm-01"
          onSelectCamera={vi.fn()}
        />
      );

      // Open location dropdown
      fireEvent.click(screen.getByTestId('live-filter-dropdown-location'));

      // Dynamically derived states
      expect(screen.getByTestId('live-filter-state-all')).toBeInTheDocument();
      expect(screen.getByTestId('live-filter-state-gujarat')).toBeInTheDocument();
      expect(screen.getByTestId('live-filter-state-uttar-pradesh')).toBeInTheDocument();

      // Dynamically derived cities
      expect(screen.getByTestId('live-filter-city-all')).toBeInTheDocument();
      expect(screen.getByTestId('live-filter-city-ahmedabad')).toBeInTheDocument();
      expect(screen.getByTestId('live-filter-city-surat')).toBeInTheDocument();
      expect(screen.getByTestId('live-filter-city-meerut')).toBeInTheDocument();
    });

    it('filters dependent cities based on selected state and resets invalid city when state changes', () => {
      render(
        <CameraSelector
          cameras={MOCK_MULTI_REGION_CAMERAS}
          selectedCameraId="cam-ahm-01"
          onSelectCamera={vi.fn()}
        />
      );

      // Open location dropdown
      fireEvent.click(screen.getByTestId('live-filter-dropdown-location'));

      // Select Uttar Pradesh
      fireEvent.click(screen.getByTestId('live-filter-state-uttar-pradesh'));

      // When Uttar Pradesh is selected, only Meerut should be visible in cities list
      expect(screen.getByTestId('live-filter-city-meerut')).toBeInTheDocument();
      expect(screen.queryByTestId('live-filter-city-ahmedabad')).not.toBeInTheDocument();
      expect(screen.queryByTestId('live-filter-city-surat')).not.toBeInTheDocument();

      // Camera list now contains only Uttar Pradesh cameras
      expect(
        screen.getByTestId('camera-item-CAM-MRT-01: Clock Tower Meerut')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(
          'camera-item-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
        )
      ).not.toBeInTheDocument();

      // Select Meerut city
      fireEvent.click(screen.getByTestId('live-filter-city-meerut'));
      expect(screen.getByTestId('active-filter-city')).toHaveTextContent('Meerut');

      // Now switch state to Gujarat -> City should automatically reset to ALL
      fireEvent.click(screen.getByTestId('live-filter-dropdown-location'));
      fireEvent.click(screen.getByTestId('live-filter-state-gujarat'));
      expect(screen.queryByTestId('active-filter-city')).not.toBeInTheDocument();
      expect(screen.getByTestId('active-filter-state')).toHaveTextContent('Gujarat');
    });

    it('filters by status and source and supports combined filtering', () => {
      render(
        <CameraSelector
          cameras={MOCK_MULTI_REGION_CAMERAS}
          selectedCameraId="cam-ahm-01"
          onSelectCamera={vi.fn()}
        />
      );

      // Filter by Status: DEGRADED
      fireEvent.click(screen.getByTestId('live-filter-dropdown-status'));
      fireEvent.click(screen.getByTestId('filter-degraded'));

      // Only Surat camera (DEGRADED) is visible
      expect(
        screen.getByTestId('camera-item-CAM-SUR-01: Ring Road Majura Gate')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId(
          'camera-item-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
        )
      ).not.toBeInTheDocument();

      // Filter by Source: RESEARCH_VIDEO
      fireEvent.click(screen.getByTestId('live-filter-dropdown-source'));
      fireEvent.click(screen.getByTestId('live-filter-source-research-video'));

      expect(
        screen.getByTestId('camera-item-CAM-SUR-01: Ring Road Majura Gate')
      ).toBeInTheDocument();

      // Clear all filters
      fireEvent.click(screen.getByTestId('live-filter-clear-all'));

      // All 3 cameras restored
      expect(
        screen.getByTestId(
          'camera-item-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('camera-item-CAM-SUR-01: Ring Road Majura Gate')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('camera-item-CAM-MRT-01: Clock Tower Meerut')
      ).toBeInTheDocument();
    });

    it('shows empty state when no cameras match combined filters and provides reset', () => {
      render(
        <CameraSelector
          cameras={MOCK_MULTI_REGION_CAMERAS}
          selectedCameraId="cam-ahm-01"
          onSelectCamera={vi.fn()}
        />
      );

      // Search for nonexistent camera
      const searchInput = screen.getByTestId('camera-search-input');
      fireEvent.change(searchInput, { target: { value: 'NonexistentLocationXYZ' } });

      expect(screen.getByTestId('camera-empty-state')).toBeInTheDocument();
      expect(screen.getByText('No cameras match your current filters.')).toBeInTheDocument();

      // Reset filters button
      const resetBtn = screen.getByRole('button', { name: 'Reset All Filters' });
      fireEvent.click(resetBtn);

      expect(screen.queryByTestId('camera-empty-state')).not.toBeInTheDocument();
      expect(
        screen.getByTestId(
          'camera-item-CAM-AHM-01: SG Highway Pakwan Junction (RESEARCH)'
        )
      ).toBeInTheDocument();
    });
  });
});

