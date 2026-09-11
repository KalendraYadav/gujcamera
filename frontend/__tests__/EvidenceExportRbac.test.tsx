import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { canExportEvidence } from '@/lib/auth/rbac';
import { SightingsTimeline } from '@/components/vehicles/SightingsTimeline';
import VehicleDetailPage from '@/app/vehicles/[plate]/page';
import { vehiclesApi } from '@/lib/api/vehicles';
import { useAuth } from '@/lib/auth/context';
import {
  TimelineSighting,
  RouteSegment,
  RouteSummary,
  VehicleDetail,
  VehicleTimelineResponse,
} from '@/types/vehicle';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ plate: 'GJ01AB1234' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/vehicles/GJ01AB1234',
}));

// Mock auth context
vi.mock('@/lib/auth/context', () => ({
  useAuth: vi.fn(),
}));

// Mock vehicles API
vi.mock('@/lib/api/vehicles', () => ({
  vehiclesApi: {
    getVehicleByPlate: vi.fn(),
    getVehicleTimeline: vi.fn(),
    getVehicleSightings: vi.fn(),
    searchVehicles: vi.fn(),
  },
}));

// Mock EvidenceExportModal so we can verify if it gets mounted
vi.mock('@/components/evidence/EvidenceExportModal', () => ({
  EvidenceExportModal: ({ sightingId, onClose }: any) => (
    <div data-testid="mock-evidence-export-modal">
      <span>Modal for {sightingId}</span>
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

// Mock RouteMap for MapLibre
vi.mock('@/components/vehicles/RouteMap', () => ({
  RouteMap: () => <div data-testid="mock-route-map">Route Map Mock</div>,
}));

// Sample fixtures
const MOCK_SIGHTINGS: TimelineSighting[] = [
  {
    id: 'sighting-001',
    camera_id: 'cam-001',
    camera_name: 'CAM-AHM-01: SG Highway',
    department_name: 'Ahmedabad City Police',
    timestamp: '2026-09-09T01:00:00.000Z',
    confidence: 0.98,
    consensus_frames: 5,
    frame_ref: 's3://vault/sighting_001.jpg',
    coordinates: { lat: 23.0338, long: 72.5073 },
    location: {
      address: 'SG Highway Pakwan Crossroad',
      zone: 'West Zone',
      district: 'Ahmedabad',
    },
  },
  {
    id: 'sighting-002',
    camera_id: 'cam-002',
    camera_name: 'CAM-AHM-02: C.G. Road',
    department_name: 'Ahmedabad City Police',
    timestamp: '2026-09-09T01:12:00.000Z',
    confidence: 0.95,
    consensus_frames: 4,
    frame_ref: 's3://vault/sighting_002.jpg',
    coordinates: { lat: 23.0275, long: 72.5562 },
    location: {
      address: 'C.G. Road Swastik Char Rasta',
      zone: 'West Zone',
      district: 'Ahmedabad',
    },
  },
];

const MOCK_ROUTE_SEGMENTS: RouteSegment[] = [
  {
    from_camera_id: 'cam-001',
    from_camera_name: 'CAM-AHM-01',
    from_coordinates: { lat: 23.0338, long: 72.5073 },
    from_timestamp: '2026-09-09T01:00:00.000Z',
    to_camera_id: 'cam-002',
    to_camera_name: 'CAM-AHM-02',
    to_coordinates: { lat: 23.0275, long: 72.5562 },
    to_timestamp: '2026-09-09T01:12:00.000Z',
    distance_meters: 5200,
    elapsed_seconds: 720,
    estimated_speed_kmh: 26.0,
    is_plausible: true,
    plausibility_status: 'PLAUSIBLE',
    plausibility_reason: 'Normal corridor velocity',
    segment_confidence: 0.96,
  },
];

const MOCK_ROUTE_SUMMARY: RouteSummary = {
  total_distance_meters: 5200,
  total_elapsed_seconds: 720,
  average_speed_kmh: 26.0,
  hops_count: 1,
  implausible_hops_count: 0,
};

const MOCK_VEHICLE_DETAIL: VehicleDetail = {
  plate_normalized: 'GJ01AB1234',
  first_seen: '2026-09-09T01:00:00.000Z',
  last_seen: '2026-09-09T01:12:00.000Z',
  total_sightings: 2,
  attributes: {
    color: 'White',
    make: 'Hyundai',
    model: 'Creta',
  },
  is_watchlisted: false,
  watchlist_details: null,
  first_known_sighting: {
    id: 'sighting-001',
    timestamp: '2026-09-09T01:00:00.000Z',
    camera_name: 'CAM-AHM-01: SG Highway',
    location: 'SG Highway Pakwan Crossroad',
    district: 'Ahmedabad',
  },
  last_known_sighting: {
    id: 'sighting-002',
    timestamp: '2026-09-09T01:12:00.000Z',
    camera_name: 'CAM-AHM-02: C.G. Road',
    location: 'C.G. Road Swastik Char Rasta',
    district: 'Ahmedabad',
  },
};

const MOCK_TIMELINE_RESPONSE: VehicleTimelineResponse = {
  plate_normalized: 'GJ01AB1234',
  total_sightings: 2,
  route_plausibility_score: 1.0,
  sightings: MOCK_SIGHTINGS,
  route_segments: MOCK_ROUTE_SEGMENTS,
  summary: MOCK_ROUTE_SUMMARY,
  disclaimer: 'Plate-based correlation only.',
};

describe('Evidence Export RBAC Alignment (Department Admin vs Authorized Roles)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vehiclesApi.getVehicleByPlate as any).mockResolvedValue(MOCK_VEHICLE_DETAIL);
    (vehiclesApi.getVehicleTimeline as any).mockResolvedValue(MOCK_TIMELINE_RESPONSE);
  });

  // --------------------------------------------------------------------------
  // 1. UNIT TEST: canExportEvidence role matrix
  // --------------------------------------------------------------------------
  describe('canExportEvidence RBAC Helper', () => {
    it('authorizes INVESTIGATOR, SUPER_ADMIN, and SYSTEM_AUDITOR for evidence export', () => {
      expect(canExportEvidence('INVESTIGATOR')).toBe(true);
      expect(canExportEvidence('SUPER_ADMIN')).toBe(true);
      expect(canExportEvidence('SYSTEM_AUDITOR')).toBe(true);
    });

    it('rejects DEPARTMENT_ADMIN, OPERATOR, VIEWER, and undefined roles', () => {
      expect(canExportEvidence('DEPARTMENT_ADMIN')).toBe(false);
      expect(canExportEvidence('OPERATOR')).toBe(false);
      expect(canExportEvidence('VIEWER')).toBe(false);
      expect(canExportEvidence(undefined)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. COMPONENT TEST: SightingsTimeline export action suppression
  // --------------------------------------------------------------------------
  describe('SightingsTimeline Component Export Action Suppression', () => {
    const onExportMock = vi.fn();

    it('does NOT render Verify & Export button for DEPARTMENT_ADMIN', () => {
      render(
        <SightingsTimeline
          sightings={MOCK_SIGHTINGS}
          routeSegments={MOCK_ROUTE_SEGMENTS}
          summary={MOCK_ROUTE_SUMMARY}
          routePlausibilityScore={1.0}
          onExportEvidence={onExportMock}
          userRole="DEPARTMENT_ADMIN"
        />
      );

      expect(screen.queryByText(/Verify & Export Evidence Package/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Verify & Export Evidence Package/i })).not.toBeInTheDocument();
    });

    it('does NOT render Verify & Export button for OPERATOR', () => {
      render(
        <SightingsTimeline
          sightings={MOCK_SIGHTINGS}
          routeSegments={MOCK_ROUTE_SEGMENTS}
          summary={MOCK_ROUTE_SUMMARY}
          routePlausibilityScore={1.0}
          onExportEvidence={onExportMock}
          userRole="OPERATOR"
        />
      );

      expect(screen.queryByText(/Verify & Export Evidence Package/i)).not.toBeInTheDocument();
    });

    it('renders Verify & Export button for INVESTIGATOR', () => {
      render(
        <SightingsTimeline
          sightings={MOCK_SIGHTINGS}
          routeSegments={MOCK_ROUTE_SEGMENTS}
          summary={MOCK_ROUTE_SUMMARY}
          routePlausibilityScore={1.0}
          onExportEvidence={onExportMock}
          userRole="INVESTIGATOR"
        />
      );

      const exportButtons = screen.getAllByText(/Verify & Export Evidence Package/i);
      expect(exportButtons.length).toBe(2);
      fireEvent.click(exportButtons[0]);
      expect(onExportMock).toHaveBeenCalledWith('sighting-001');
    });

    it('renders Verify & Export button for SUPER_ADMIN', () => {
      render(
        <SightingsTimeline
          sightings={MOCK_SIGHTINGS}
          routeSegments={MOCK_ROUTE_SEGMENTS}
          summary={MOCK_ROUTE_SUMMARY}
          routePlausibilityScore={1.0}
          onExportEvidence={onExportMock}
          userRole="SUPER_ADMIN"
        />
      );

      expect(screen.getAllByText(/Verify & Export Evidence Package/i).length).toBe(2);
    });

    it('renders Verify & Export button for SYSTEM_AUDITOR', () => {
      render(
        <SightingsTimeline
          sightings={MOCK_SIGHTINGS}
          routeSegments={MOCK_ROUTE_SEGMENTS}
          summary={MOCK_ROUTE_SUMMARY}
          routePlausibilityScore={1.0}
          onExportEvidence={onExportMock}
          userRole="SYSTEM_AUDITOR"
        />
      );

      expect(screen.getAllByText(/Verify & Export Evidence Package/i).length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // 3. INTEGRATION TEST: VehicleDetailPage (/vehicles/[plate])
  // --------------------------------------------------------------------------
  describe('VehicleDetailPage (/vehicles/[plate]) UX Flow', () => {
    it('allows DEPARTMENT_ADMIN to investigate vehicle but completely hides evidence export actions', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'usr-dept-1',
          email: 'deptadmin.demo@gujcamera.local',
          role: 'DEPARTMENT_ADMIN',
          department_id: 'dept-gnd-1',
          department_name: 'Gandhinagar District Police',
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        clearError: vi.fn(),
        error: null,
      });

      render(<VehicleDetailPage />);

      // Wait for vehicle details to load
      await waitFor(() => {
        expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
        expect(screen.getByText('Hyundai')).toBeInTheDocument();
        expect(screen.getByText('Creta')).toBeInTheDocument();
      });

      // 1. Header Export button must NOT be rendered
      expect(screen.queryByText('Export Evidence Package')).not.toBeInTheDocument();
      expect(document.getElementById('header-export-evidence-btn')).toBeNull();

      // 2. Switch to Timeline tab
      fireEvent.click(document.getElementById('vehicle-tab-timeline')!);

      // Wait for timeline to render
      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // 3. Timeline Verify & Export button must NOT be rendered
      expect(screen.queryByText(/Verify & Export Evidence Package/i)).not.toBeInTheDocument();
      expect(document.getElementById('verify-evidence-btn-sighting-001')).toBeNull();

      // 4. EvidenceExportModal must NOT be mounted
      expect(screen.queryByTestId('mock-evidence-export-modal')).not.toBeInTheDocument();
    });

    it('allows INVESTIGATOR to investigate vehicle and renders evidence export actions', async () => {
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

      render(<VehicleDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
      });

      // 1. Header Export button IS rendered
      const headerBtn = screen.getByText('Export Evidence Package');
      expect(headerBtn).toBeInTheDocument();

      // Clicking header export button opens EvidenceExportModal
      fireEvent.click(headerBtn);
      expect(screen.getByTestId('mock-evidence-export-modal')).toBeInTheDocument();

      // Close modal
      fireEvent.click(screen.getByText('Close Modal'));
      expect(screen.queryByTestId('mock-evidence-export-modal')).not.toBeInTheDocument();

      // 2. Switch to Timeline tab
      fireEvent.click(document.getElementById('vehicle-tab-timeline')!);

      await waitFor(() => {
        expect(screen.getByText('CAM-AHM-01: SG Highway')).toBeInTheDocument();
      });

      // 3. Timeline Verify & Export button IS rendered
      const timelineBtns = screen.getAllByText(/Verify & Export Evidence Package/i);
      expect(timelineBtns.length).toBeGreaterThanOrEqual(1);

      // Clicking timeline export opens modal
      fireEvent.click(timelineBtns[0]);
      expect(screen.getByTestId('mock-evidence-export-modal')).toBeInTheDocument();
    });

    it('allows SUPER_ADMIN to investigate vehicle and renders evidence export actions', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'usr-admin-1',
          email: 'admin.demo@gujcamera.local',
          role: 'SUPER_ADMIN',
          department_id: 'dept-dgp-1',
          department_name: 'DGP Headquarters',
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        clearError: vi.fn(),
        error: null,
      });

      render(<VehicleDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
      });

      expect(screen.getByText('Export Evidence Package')).toBeInTheDocument();
    });

    it('restricts OPERATOR from accessing vehicle deep-dive entirely', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'usr-op-1',
          email: 'operator.demo@gujcamera.local',
          role: 'OPERATOR',
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

      render(<VehicleDetailPage />);

      expect(screen.getByText('Investigation Access Restricted')).toBeInTheDocument();
      expect(vehiclesApi.getVehicleByPlate).not.toHaveBeenCalled();
      expect(screen.queryByText('Export Evidence Package')).not.toBeInTheDocument();
    });
  });
});
