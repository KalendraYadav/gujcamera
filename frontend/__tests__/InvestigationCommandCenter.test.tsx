import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VehicleInvestigationPage from '@/app/vehicles/[plate]/page';
import { vehiclesApi } from '@/lib/api/vehicles';
import { alertsApi } from '@/lib/api/alerts';
import { evidenceApi } from '@/lib/api/evidence';
import { useAuth } from '@/lib/auth/context';
import {
  VehicleDetail,
  VehicleTimelineResponse,
} from '@/types/vehicle';
import { AlertListResponse } from '@/types/alert';

// Mock Next.js navigation
const mockPush = vi.fn();
let mockParams = { plate: 'GJ01AB1234' };

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
  usePathname: () => `/vehicles/${mockParams.plate}`,
}));

// Mock Auth Context
vi.mock('@/lib/auth/context', () => ({
  useAuth: vi.fn(),
}));

// Mock Vehicles API
vi.mock('@/lib/api/vehicles', () => ({
  vehiclesApi: {
    getVehicleByPlate: vi.fn(),
    getVehicleTimeline: vi.fn(),
    getVehicleSightings: vi.fn(),
    searchVehicles: vi.fn(),
    getVehicleAudit: vi.fn(),
  },
}));

// Mock Alerts API
vi.mock('@/lib/api/alerts', () => ({
  alertsApi: {
    listAlerts: vi.fn(),
    getAlert: vi.fn(),
  },
}));

// Mock Evidence API
vi.mock('@/lib/api/evidence', () => ({
  evidenceApi: {
    getBySighting: vi.fn(),
    getEvidence: vi.fn(),
    downloadExport: vi.fn(),
  },
}));

// Mock RouteMap (MapLibre GL requires WebGL context)
vi.mock('@/components/vehicles/RouteMap', () => ({
  RouteMap: ({ sightings, routeSegments, disclaimer, onSelectSighting }: any) => (
    <div data-testid="mock-route-map">
      <span>Route Map Points: {sightings.length}</span>
      <span>Hops: {routeSegments.length}</span>
      <p>{disclaimer}</p>
      {sightings.map((s: any) => (
        <button key={s.id} onClick={() => onSelectSighting?.(s)}>
          Marker-{s.camera_name}
        </button>
      ))}
    </div>
  ),
}));

// Fixtures
const MOCK_VEHICLE_DETAIL: VehicleDetail = {
  plate_normalized: 'GJ01AB1234',
  first_seen: '2026-09-09T10:00:00.000Z',
  last_seen: '2026-09-09T10:30:00.000Z',
  attributes: {
    color: 'White',
    make: 'Hyundai',
    model: 'Creta',
    type: 'SUV',
  },
  total_sightings: 3,
  is_watchlisted: true,
  watchlist_details: {
    category: 'STOLEN_VEHICLE',
    priority: 'CRITICAL',
    reason: 'Reported stolen from Vastrapur - FIR #102/2026',
    flagged_at: '2026-09-09T08:00:00.000Z',
  },
  first_known_sighting: {
    id: 'sight-1',
    camera_name: 'CAM-AHM-01: Pakwan Cross Road',
    timestamp: '2026-09-09T10:00:00.000Z',
    location: 'SG Highway',
    district: 'Ahmedabad',
  },
  last_known_sighting: {
    id: 'sight-3',
    camera_name: 'CAM-GND-02: CH-0 Circle',
    timestamp: '2026-09-09T10:30:00.000Z',
    location: 'CH-0 Circle',
    district: 'Gandhinagar',
  },
};

const MOCK_TIMELINE: VehicleTimelineResponse = {
  plate_normalized: 'GJ01AB1234',
  total_sightings: 3,
  cities: ['Ahmedabad', 'Gandhinagar'],
  route_plausibility_score: 0.5,
  route_confidence: 0.95,
  sightings: [
    {
      id: 'sight-1',
      timestamp: '2026-09-09T10:00:00.000Z',
      camera_id: 'cam-ahm-01',
      camera_name: 'CAM-AHM-01: Pakwan Cross Road',
      city: 'Ahmedabad',
      location: { address: 'SG Highway', zone: 'West', district: 'Ahmedabad' },
      coordinates: { lat: 23.0338, long: 72.5073 },
      confidence: 0.95,
      consensus_frames: 6,
      frame_ref: 's3://vault/frames/sight-1.jpg',
    },
    {
      id: 'sight-2',
      timestamp: '2026-09-09T10:10:00.000Z',
      camera_id: 'cam-ahm-02',
      camera_name: 'CAM-AHM-02: C.G. Road',
      city: 'Ahmedabad',
      location: { address: 'C.G. Road', zone: 'Central', district: 'Ahmedabad' },
      coordinates: { lat: 23.0289, long: 72.5565 },
      confidence: 0.96,
      consensus_frames: 7,
      frame_ref: 's3://vault/frames/sight-2.jpg',
    },
    {
      id: 'sight-3',
      timestamp: '2026-09-09T10:12:00.000Z',
      camera_id: 'cam-gnd-02',
      camera_name: 'CAM-GND-02: CH-0 Circle',
      city: 'Gandhinagar',
      location: { address: 'CH-0 Circle', zone: 'Sector 1', district: 'Gandhinagar' },
      coordinates: { lat: 23.2156, long: 72.6369 },
      confidence: 0.94,
      consensus_frames: 5,
      frame_ref: 's3://vault/frames/sight-3.jpg',
    },
  ],
  route_segments: [
    {
      from_camera_id: 'cam-ahm-01',
      from_camera_name: 'CAM-AHM-01: Pakwan Cross Road',
      from_city: 'Ahmedabad',
      from_coordinates: { lat: 23.0338, long: 72.5073 },
      from_timestamp: '2026-09-09T10:00:00.000Z',
      to_camera_id: 'cam-ahm-02',
      to_camera_name: 'CAM-AHM-02: C.G. Road',
      to_city: 'Ahmedabad',
      to_coordinates: { lat: 23.0289, long: 72.5565 },
      to_timestamp: '2026-09-09T10:10:00.000Z',
      distance_meters: 5200,
      elapsed_seconds: 600,
      estimated_speed_kmh: 31.2,
      is_plausible: true,
      status: 'PLAUSIBLE',
      plausibility_status: 'PLAUSIBLE',
      plausibility_reason: 'Physically plausible transit within expected urban speed limits.',
      segment_confidence: 0.95,
    },
    {
      from_camera_id: 'cam-ahm-02',
      from_camera_name: 'CAM-AHM-02: C.G. Road',
      from_city: 'Ahmedabad',
      from_coordinates: { lat: 23.0289, long: 72.5565 },
      from_timestamp: '2026-09-09T10:10:00.000Z',
      to_camera_id: 'cam-gnd-02',
      to_camera_name: 'CAM-GND-02: CH-0 Circle',
      to_city: 'Gandhinagar',
      to_coordinates: { lat: 23.2156, long: 72.6369 },
      to_timestamp: '2026-09-09T10:12:00.000Z',
      distance_meters: 22000,
      elapsed_seconds: 120,
      estimated_speed_kmh: 660.0,
      is_plausible: false,
      status: 'IMPOSSIBLE',
      plausibility_status: 'IMPLAUSIBLE',
      plausibility_reason: 'Unrealistic high velocity between camera sightings.',
      segment_confidence: 0.94,
    },
  ],
  summary: {
    total_distance_meters: 27200,
    total_elapsed_seconds: 720,
    average_speed_kmh: 136.0,
    hops_count: 2,
    implausible_hops_count: 1,
  },
  anomalies: [
    {
      segment_index: 2,
      from_camera: 'CAM-AHM-02: C.G. Road',
      to_camera: 'CAM-GND-02: CH-0 Circle',
      status: 'IMPOSSIBLE',
      reason: 'UNREALISTIC_HIGH_VELOCITY: 660.0 km/h exceeds maximum threshold.',
      estimated_speed_kmh: 660.0,
      elapsed_seconds: 120,
      distance_meters: 22000,
    },
  ],
  disclaimer:
    'Spatio-temporal correlation represents straight-line geodesic transitions between camera observation points, not continuous GPS tracking.',
};

const MOCK_ALERTS: AlertListResponse = {
  data: [
    {
      id: 'alert-001',
      severity: 'CRITICAL',
      status: 'NEW',
      timestamp: '2026-09-09T10:10:00.000Z',
      created_at: '2026-09-09T10:10:00.000Z',
      updated_at: '2026-09-09T10:10:00.000Z',
      sighting: {
        id: 'sight-2',
        camera: {
          id: 'cam-ahm-02',
          name: 'CAM-AHM-02: C.G. Road',
          location: { address: 'C.G. Road', zone: 'Central', district: 'Ahmedabad' },
        },
      },
      watchlist_match: {
        entry_id: 'w-entry-1',
        plate_normalized: 'GJ01AB1234',
        category: 'STOLEN_VEHICLE',
        reason: 'Reported stolen from Vastrapur - FIR #102/2026',
        priority: 'CRITICAL',
        added_by: 'investigator@gujcamera.local',
      },
    },
  ],
  pagination: {
    total: 1,
    page: 1,
    limit: 20,
    total_pages: 1,
  },
};

const MOCK_AUDIT = {
  plate_normalized: 'GJ01AB1234',
  total_records: 2,
  data: [
    {
      id: 'audit-001',
      actor_id: 'usr-inv-1',
      actor_email: 'investigator@gujcamera.local',
      actor_role: 'INVESTIGATOR',
      actor_department: 'Ahmedabad Crime Branch',
      action: 'VEHICLE_DETAIL_VIEW',
      resource: 'Vehicle',
      ts: '2026-09-09T10:15:00.000Z',
      correlation_id: 'req-corr-1111',
      details: { plate_normalized: 'GJ01AB1234' },
    },
  ],
};

const MOCK_EVIDENCE_INSPECTION = {
  id: 'ev-001',
  sighting_id: 'sight-1',
  source_type: 'SIGHTING',
  file_path: 's3://vault/frames/sight-1.jpg',
  file_size_bytes: 45200,
  mime_type: 'image/jpeg',
  stored_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  computed_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  created_at: '2026-09-09T10:00:00.000Z',
  retention_days: 365,
  verification_status: 'INTEGRITY_VERIFIED',
  integrity_match: true,
  tamper_detected: false,
  legal_admissibility_notice:
    'LEGAL / PROCEDURAL NOTICE: Cryptographic integrity verification confirms that the retrieved evidence object matches its recorded SHA-256 digest. This technical verification does not by itself establish legal admissibility, statutory compliance, authenticity, or evidentiary sufficiency. Applicable legal and departmental procedures must be followed independently.',
  sighting: {
    plate_normalized: 'GJ01AB1234',
    camera_id: 'cam-ahm-01',
    timestamp: '2026-09-09T10:00:00.000Z',
    confidence: 0.95,
    consensus_frames: 6,
  },
};

describe('Investigation Command Center Experience (Phase 8 Specification)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { plate: 'GJ01AB1234' };

    // Default: Authenticated Investigator
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'usr-inv-1',
        email: 'investigator.demo@gujcamera.local',
        role: 'INVESTIGATOR',
        department_id: 'dept-ahm-1',
        department_name: 'Ahmedabad City Police',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    vi.mocked(vehiclesApi.getVehicleByPlate).mockResolvedValue(MOCK_VEHICLE_DETAIL);
    vi.mocked(vehiclesApi.getVehicleTimeline).mockResolvedValue(MOCK_TIMELINE);
    vi.mocked(alertsApi.listAlerts).mockResolvedValue(MOCK_ALERTS);
    vi.mocked(vehiclesApi.getVehicleAudit).mockResolvedValue(MOCK_AUDIT);
    vi.mocked(evidenceApi.getBySighting).mockResolvedValue(MOCK_EVIDENCE_INSPECTION as any);
  });

  // 1. Vehicle Search & Quick Switch
  it('1. Vehicle Search: renders target plate and allows quick-switching vehicle', async () => {
    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Switch Plate/i);
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'GJ05CD5678' } });
    fireEvent.submit(searchInput.closest('form')!);

    expect(mockPush).toHaveBeenCalledWith('/vehicles/GJ05CD5678');
  });

  // 2. Timeline Rendering
  it('2. Timeline Rendering: exposes camera, city, source type, plate confidence, and consensus frames', async () => {
    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const cameras = screen.getAllByText(/Pakwan Cross Road/);
    expect(cameras.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('FIXED CCTV (ANPR)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Plate Conf:/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Consensus:/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/SPATIO-TEMPORAL SIGHTING CORRELATION/i)).toBeInTheDocument();
  });

  // 3. Route Segment Rendering
  it('3. Route Segment Rendering: shows geodesic distance, elapsed time, and average velocity', async () => {
    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText('5.20 km')).toBeInTheDocument();
      expect(screen.getByText('10m 0s')).toBeInTheDocument();
      expect(screen.getByText('31.2 km/h')).toBeInTheDocument();
    });
  });

  // 4. Anomaly Rendering
  it('4. Anomaly Rendering: displays deterministic reason and highlights impossible velocity hops', async () => {
    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText(/SPATIO-TEMPORAL ROUTE ANOMALIES DETECTED/i)).toBeInTheDocument();
      expect(screen.getByText(/UNREALISTIC_HIGH_VELOCITY/i)).toBeInTheDocument();
    });
  });

  // 5. Watchlist Match
  it('5. Watchlist Match: displays alert severity, category, observing camera, and OPEN ALERT button', async () => {
    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText(/WATCHLIST MATCH — STOLEN VEHICLE/i)).toBeInTheDocument();
      expect(screen.getByText(/Reported stolen from Vastrapur/i)).toBeInTheDocument();
      expect(screen.getByText(/OPEN ALERT #alert-00/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/OPEN ALERT #alert-00/i));
    expect(mockPush).toHaveBeenCalledWith('/alerts?plate=GJ01AB1234');
  });

  // 6. No Watchlist Match
  it('6. No Watchlist Match: displays clear status badge when vehicle is not watchlisted', async () => {
    vi.mocked(vehiclesApi.getVehicleByPlate).mockResolvedValue({
      ...MOCK_VEHICLE_DETAIL,
      is_watchlisted: false,
      watchlist_details: null,
    });
    vi.mocked(alertsApi.listAlerts).mockResolvedValue({ data: [], pagination: { total: 0, page: 1, limit: 20, total_pages: 1 } });

    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText(/NO WATCHLIST MATCH:/i)).toBeInTheDocument();
    });
  });

  // 7. Evidence Available & SHA-256 Integrity Verification
  it('7. Evidence Available: displays INTEGRITY VERIFIED status with cryptographic hashes', async () => {
    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getAllByText('INTEGRITY VERIFIED').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });

    expect(screen.getByText(/STORED DIGEST:/i)).toBeInTheDocument();
    expect(screen.getByText(/LIVE CALCULATED DIGEST:/i)).toBeInTheDocument();
    expect(screen.getByText(/LEGAL \/ PROCEDURAL NOTICE/i)).toBeInTheDocument();
    expect(screen.getByText(/AUTHENTICITY \/ ADMISSIBILITY REQUIRES INDEPENDENT LEGAL AND PROCEDURAL REVIEW/i)).toBeInTheDocument();
    expect(screen.getAllByText(MOCK_EVIDENCE_INSPECTION.stored_sha256).length).toBe(2);
  });

  // 8. Evidence Unavailable
  it('8. Evidence Unavailable: renders institutional empty state when evidence is missing', async () => {
    vi.mocked(evidenceApi.getBySighting).mockRejectedValue(new Error('Evidence not found'));

    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText('EVIDENCE NOT AVAILABLE')).toBeInTheDocument();
    });
  });

  // 9. Missing Coordinates
  it('9. Missing Coordinates: warns with ROUTE ANALYSIS INCOMPLETE if camera coordinates are missing', async () => {
    vi.mocked(vehiclesApi.getVehicleTimeline).mockResolvedValue({
      ...MOCK_TIMELINE,
      sightings: [
        {
          ...MOCK_TIMELINE.sightings[0],
          coordinates: { lat: 0, long: 0 },
        },
      ],
    });

    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText('ROUTE ANALYSIS INCOMPLETE')).toBeInTheDocument();
    });
  });

  // 10. Empty Investigation
  it('10. Empty Investigation: renders ENTER VEHICLE REGISTRATION when plate parameter is empty', async () => {
    mockParams = { plate: '' };

    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText('ENTER VEHICLE REGISTRATION')).toBeInTheDocument();
    });
  });

  // 11. Backend Failure & Retry
  it('11. Backend Failure: shows INVESTIGATION DATA UNAVAILABLE and allows retry', async () => {
    vi.mocked(vehiclesApi.getVehicleByPlate).mockRejectedValue(new Error('Database cluster timeout'));

    render(<VehicleInvestigationPage />);

    await waitFor(() => {
      expect(screen.getByText('INVESTIGATION DATA UNAVAILABLE')).toBeInTheDocument();
      expect(screen.getByText(/Database cluster timeout/i)).toBeInTheDocument();
    });

    // Retry recovery
    vi.mocked(vehiclesApi.getVehicleByPlate).mockResolvedValue(MOCK_VEHICLE_DETAIL);
    fireEvent.click(screen.getByText(/Retry Retrieval/i));

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });
  });

  // 12. Loading State
  it('12. Loading State: renders institutional loading indicator while data resolves', () => {
    vi.mocked(vehiclesApi.getVehicleByPlate).mockReturnValue(new Promise(() => {})); // pending promise
    vi.mocked(vehiclesApi.getVehicleTimeline).mockReturnValue(new Promise(() => {}));

    render(<VehicleInvestigationPage />);

    expect(screen.getByText(/Reconstructing investigation dossier for GJ01AB1234/i)).toBeInTheDocument();
    expect(screen.getByText(/Querying sightings, PostGIS spatial hops/i)).toBeInTheDocument();
  });

  // 13. RBAC Restrictions
  it('13. RBAC Restrictions: blocks OPERATOR from viewing investigation command center', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'usr-op-1',
        email: 'operator@gujcamera.local',
        role: 'OPERATOR',
        department_id: 'dept-ahm-1',
        department_name: 'Ahmedabad Police',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    render(<VehicleInvestigationPage />);

    expect(screen.getByText('Investigation Access Restricted')).toBeInTheDocument();
    expect(vehiclesApi.getVehicleByPlate).not.toHaveBeenCalled();
  });
});
