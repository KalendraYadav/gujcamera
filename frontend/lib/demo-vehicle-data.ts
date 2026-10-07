// ==============================================================================
// Canonical Demonstration Vehicle Datasets & Fallback Generators
// Gujarat Police Innovation Challenge 2026 — NETRAVA
//
// Purpose:
// Provides high-fidelity demonstration intelligence for Vehicle Tracking &
// Investigation Command Center when connected to unseeded or fresh environments,
// without altering or disturbing the production database models or APIs.
//
// Primary Demo Target:
//   Plate: GJ01AB1234
//   Model: White Hyundai Creta (SUV)
//   Alert: STOLEN_VEHICLE (CRITICAL) — FIR #102/2026 Vastrapur PS
//   Sightings: 3 cameras across Ahmedabad -> Gandhinagar corridor
// ==============================================================================

import {
  VehicleSearchResult,
  VehicleDetail,
  VehicleTimelineResponse,
  VehicleSighting,
  TimelineSighting,
  RouteSegment,
  VehicleAuditRecord,
} from '@/types/vehicle';
import { AlertItem } from '@/types/alert';

export const CANONICAL_DEMO_VEHICLES: VehicleSearchResult[] = [
  {
    plate_normalized: 'GJ01AB1234',
    attributes: {
      color: 'White',
      make: 'Hyundai',
      model: 'Creta',
      type: 'SUV',
    },
    total_sightings: 3,
    first_seen: '2026-10-06T14:30:00.000Z',
    last_seen: '2026-10-06T15:15:00.000Z',
    is_watchlisted: true,
    watchlist_category: 'STOLEN_VEHICLE',
    watchlist_priority: 'CRITICAL',
  },
  {
    plate_normalized: 'GJ05CD5678',
    attributes: {
      color: 'Silver',
      make: 'Maruti Suzuki',
      model: 'Swift',
      type: 'HATCHBACK',
    },
    total_sightings: 2,
    first_seen: '2026-10-06T13:30:00.000Z',
    last_seen: '2026-10-06T14:15:00.000Z',
    is_watchlisted: true,
    watchlist_category: 'HIT_AND_RUN',
    watchlist_priority: 'HIGH',
  },
  {
    plate_normalized: 'GJ27EF9012',
    attributes: {
      color: 'Black',
      make: 'Mahindra',
      model: 'Scorpio',
      type: 'SUV',
    },
    total_sightings: 1,
    first_seen: '2026-10-06T11:00:00.000Z',
    last_seen: '2026-10-06T11:00:00.000Z',
    is_watchlisted: true,
    watchlist_category: 'CONTRABAND_TRAFFICKING',
    watchlist_priority: 'HIGH',
  },
];

export function findMatchingDemoVehicles(query?: string): VehicleSearchResult[] {
  if (!query) return CANONICAL_DEMO_VEHICLES;
  const clean = query.trim().toUpperCase().replace(/[\s\-]/g, '');
  if (!clean) return CANONICAL_DEMO_VEHICLES;

  return CANONICAL_DEMO_VEHICLES.filter((v) => {
    return (
      v.plate_normalized.includes(clean) ||
      clean.includes(v.plate_normalized) ||
      clean === 'DEMO' ||
      clean === 'CRETA' ||
      clean === 'STOLEN' ||
      clean === 'GJ' ||
      clean === 'ALL' ||
      clean.startsWith('GJ01') ||
      clean.includes('1234') ||
      v.attributes?.make?.toUpperCase().includes(clean) ||
      v.attributes?.model?.toUpperCase().includes(clean)
    );
  });
}

export function getDemoVehicleDetail(plateOrId: string): VehicleDetail | null {
  const clean = plateOrId.trim().toUpperCase().replace(/[\s\-]/g, '');

  if (clean === 'GJ01AB1234' || clean.includes('1234') || clean === 'DEMO') {
    return {
      plate_normalized: 'GJ01AB1234',
      first_seen: '2026-10-06T14:30:00.000Z',
      last_seen: '2026-10-06T15:15:00.000Z',
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
        reason: 'Active Intercept Warrant — FIR #102/2026 registered at Vastrapur PS (Theft of Hyundai Creta)',
        flagged_at: '2026-10-06T10:00:00.000Z',
      },
      first_known_sighting: {
        id: 'demo-sighting-01',
        timestamp: '2026-10-06T14:30:00.000Z',
        camera_name: 'CAM-AHM-01 (Pakwan Cross Road)',
        location: 'Pakwan Cross Road, SG Highway, Thaltej',
        district: 'Ahmedabad',
      },
      last_known_sighting: {
        id: 'demo-sighting-03',
        timestamp: '2026-10-06T15:15:00.000Z',
        camera_name: 'CAM-GND-02 (CH-0 Circle)',
        location: 'CH-0 Circle, Sector 1, Gandhinagar',
        district: 'Gandhinagar',
      },
    };
  }

  if (clean === 'GJ05CD5678') {
    return {
      plate_normalized: 'GJ05CD5678',
      first_seen: '2026-10-06T13:30:00.000Z',
      last_seen: '2026-10-06T14:15:00.000Z',
      attributes: {
        color: 'Silver',
        make: 'Maruti Suzuki',
        model: 'Swift',
        type: 'HATCHBACK',
      },
      total_sightings: 2,
      is_watchlisted: true,
      watchlist_details: {
        category: 'HIT_AND_RUN',
        priority: 'HIGH',
        reason: 'Active FIR #34/2026 Surat Crime Branch (Fatal Hit & Run near Ring Road)',
        flagged_at: '2026-10-06T11:00:00.000Z',
      },
      first_known_sighting: {
        id: 'demo-sighting-04',
        timestamp: '2026-10-06T13:30:00.000Z',
        camera_name: 'CAM-SRT-01 (Athwa Gate)',
        location: 'Athwa Gate Junction, Athwalines',
        district: 'Surat',
      },
      last_known_sighting: {
        id: 'demo-sighting-05',
        timestamp: '2026-10-06T14:15:00.000Z',
        camera_name: 'CAM-SRT-04 (Varachha Main Road)',
        location: 'Varachha Main Road, Varachha',
        district: 'Surat',
      },
    };
  }

  if (clean === 'GJ27EF9012') {
    return {
      plate_normalized: 'GJ27EF9012',
      first_seen: '2026-10-06T11:00:00.000Z',
      last_seen: '2026-10-06T11:00:00.000Z',
      attributes: {
        color: 'Black',
        make: 'Mahindra',
        model: 'Scorpio',
        type: 'SUV',
      },
      total_sightings: 1,
      is_watchlisted: true,
      watchlist_details: {
        category: 'CONTRABAND_TRAFFICKING',
        priority: 'HIGH',
        reason: 'State Narcotic Taskforce Intercept Notice #88',
        flagged_at: '2026-10-06T09:00:00.000Z',
      },
      first_known_sighting: {
        id: 'demo-sighting-06',
        timestamp: '2026-10-06T11:00:00.000Z',
        camera_name: 'CAM-AHM-09 (Narol Circle)',
        location: 'Narol Cross Road, Narol',
        district: 'Ahmedabad',
      },
      last_known_sighting: {
        id: 'demo-sighting-06',
        timestamp: '2026-10-06T11:00:00.000Z',
        camera_name: 'CAM-AHM-09 (Narol Circle)',
        location: 'Narol Cross Road, Narol',
        district: 'Ahmedabad',
      },
    };
  }

  return null;
}

export function getDemoVehicleTimeline(plateOrId: string): VehicleTimelineResponse | null {
  const clean = plateOrId.trim().toUpperCase().replace(/[\s\-]/g, '');

  if (clean === 'GJ01AB1234' || clean.includes('1234') || clean === 'DEMO') {
    const sightings: TimelineSighting[] = [
      {
        id: 'demo-sighting-01',
        timestamp: '2026-10-06T14:30:00.000Z',
        camera_id: 'cam-ahm-01',
        camera_name: 'CAM-AHM-01 (Pakwan Cross Road)',
        department_name: 'Ahmedabad City Police',
        city: 'Ahmedabad',
        coordinates: { lat: 23.0734, long: 72.5262 },
        location: {
          address: 'Pakwan Cross Road, SG Highway, Thaltej',
          zone: 'West Zone',
          district: 'Ahmedabad',
        },
        confidence: 0.98,
        consensus_frames: 5,
        frame_ref: 'evidence/demo-sighting-01.jpg',
      },
      {
        id: 'demo-sighting-02',
        timestamp: '2026-10-06T14:45:00.000Z',
        camera_id: 'cam-ahm-02',
        camera_name: 'CAM-AHM-02 (C.G. Road Swastik)',
        department_name: 'Ahmedabad City Police',
        city: 'Ahmedabad',
        coordinates: { lat: 23.0372, long: 72.5623 },
        location: {
          address: 'C.G. Road, Swastik Cross Road, Navrangpura',
          zone: 'Central Zone',
          district: 'Ahmedabad',
        },
        confidence: 0.96,
        consensus_frames: 4,
        frame_ref: 'evidence/demo-sighting-02.jpg',
      },
      {
        id: 'demo-sighting-03',
        timestamp: '2026-10-06T15:15:00.000Z',
        camera_id: 'cam-gnd-02',
        camera_name: 'CAM-GND-02 (CH-0 Circle)',
        department_name: 'Gandhinagar Police',
        city: 'Gandhinagar',
        coordinates: { lat: 23.2384, long: 72.6391 },
        location: {
          address: 'CH-0 Circle, Sector 1, Gandhinagar',
          zone: 'Infocity Zone',
          district: 'Gandhinagar',
        },
        confidence: 0.94,
        consensus_frames: 6,
        frame_ref: 'evidence/demo-sighting-03.jpg',
      },
    ];

    const route_segments: RouteSegment[] = [
      {
        from_camera_id: 'cam-ahm-01',
        from_camera_name: 'CAM-AHM-01 (Pakwan Cross Road)',
        from_city: 'Ahmedabad',
        from_coordinates: { lat: 23.0734, long: 72.5262 },
        from_timestamp: '2026-10-06T14:30:00.000Z',
        to_camera_id: 'cam-ahm-02',
        to_camera_name: 'CAM-AHM-02 (C.G. Road Swastik)',
        to_city: 'Ahmedabad',
        to_coordinates: { lat: 23.0372, long: 72.5623 },
        to_timestamp: '2026-10-06T14:45:00.000Z',
        distance_meters: 5200,
        distance_type: 'GEODESIC',
        elapsed_seconds: 900,
        estimated_speed_kmh: 20.8,
        status: 'PLAUSIBLE',
        reason: 'Transit velocity (20.8 km/h) consistent with arterial urban traffic flow',
        confidence: 0.97,
        is_plausible: true,
        plausibility_status: 'PLAUSIBLE',
        plausibility_reason: 'Urban transit speed within expected corridor limit',
        segment_confidence: 0.97,
      },
      {
        from_camera_id: 'cam-ahm-02',
        from_camera_name: 'CAM-AHM-02 (C.G. Road Swastik)',
        from_city: 'Ahmedabad',
        from_coordinates: { lat: 23.0372, long: 72.5623 },
        from_timestamp: '2026-10-06T14:45:00.000Z',
        to_camera_id: 'cam-gnd-02',
        to_camera_name: 'CAM-GND-02 (CH-0 Circle)',
        to_city: 'Gandhinagar',
        to_coordinates: { lat: 23.2384, long: 72.6391 },
        to_timestamp: '2026-10-06T15:15:00.000Z',
        distance_meters: 22400,
        distance_type: 'GEODESIC',
        elapsed_seconds: 1800,
        estimated_speed_kmh: 44.8,
        status: 'PLAUSIBLE',
        reason: 'Transit velocity (44.8 km/h) consistent with SG Highway expressway corridor',
        confidence: 0.98,
        is_plausible: true,
        plausibility_status: 'PLAUSIBLE',
        plausibility_reason: 'Expressway transit velocity within legal and physical tolerances',
        segment_confidence: 0.98,
      },
    ];

    return {
      plate_normalized: 'GJ01AB1234',
      total_sightings: 3,
      cities: ['Ahmedabad', 'Gandhinagar'],
      route_plausibility_score: 0.98,
      route_confidence: 0.97,
      sightings,
      route_segments,
      summary: {
        total_distance_meters: 27600,
        total_elapsed_seconds: 2700,
        average_speed_kmh: 36.8,
        hops_count: 2,
        implausible_hops_count: 0,
        plausible_hops_count: 2,
        suspicious_hops_count: 0,
        impossible_hops_count: 0,
        insufficient_data_hops_count: 0,
        route_confidence: 0.97,
      },
      anomalies: [],
      disclaimer:
        'SPATIO-TEMPORAL SIGHTING CORRELATION: Correlated across fixed ANPR CCTV installations. Distances are geodesic measurements between sensor coordinates. Does not represent continuous GPS tracking.',
    };
  }

  return null;
}

export function getDemoVehicleAlerts(plateOrId: string): AlertItem[] {
  const clean = plateOrId.trim().toUpperCase().replace(/[\s\-]/g, '');

  if (clean === 'GJ01AB1234' || clean.includes('1234') || clean === 'DEMO') {
    return [
      {
        id: 'demo-alert-01',
        camera_id: 'cam-gnd-02',
        camera_name: 'CAM-GND-02 (CH-0 Circle)',
        watchlist_entry_id: 'wl-entry-101',
        severity: 'CRITICAL',
        status: 'NEW',
        acknowledged_by: null,
        acknowledged_at: null,
        resolved_by: null,
        resolved_at: null,
        notes: null,
        created_at: '2026-10-06T15:15:00.000Z',
        watchlist_match: {
          entry_id: 'wl-entry-101',
          plate_normalized: 'GJ01AB1234',
          category: 'STOLEN_VEHICLE',
          reason: 'Active Intercept Warrant — FIR #102/2026 Vastrapur PS',
          priority: 'CRITICAL',
          added_by: 'Inspector R. Patel',
        },
        sighting: {
          id: 'demo-sighting-03',
          confidence: 0.94,
          camera: {
            id: 'cam-gnd-02',
            name: 'CAM-GND-02 (CH-0 Circle)',
            coordinates: { lat: 23.2384, long: 72.6391 },
            location: {
              address: 'CH-0 Circle, Sector 1, Gandhinagar',
              zone: 'Infocity Zone',
              district: 'Gandhinagar',
            },
          },
        },
      },
    ];
  }

  return [];
}

export function getDemoVehicleAudit(plateOrId: string): VehicleAuditRecord[] {
  const clean = plateOrId.trim().toUpperCase().replace(/[\s\-]/g, '');

  return [
    {
      id: 'demo-audit-01',
      actor_id: 'usr-investigator-01',
      actor_email: 'investigator.demo@police.gov.in',
      actor_role: 'INVESTIGATOR',
      actor_department: 'Crime Branch Ahmedabad',
      action: 'VEHICLE_DETAIL_VIEW',
      resource: 'Vehicle',
      ts: '2026-10-06T15:20:00.000Z',
      correlation_id: 'req-inv-demo-01',
      details: {
        plate_normalized: clean || 'GJ01AB1234',
        mode: 'DEMONSTRATION_INSPECTION',
      },
    },
    {
      id: 'demo-audit-02',
      actor_id: 'sys-anpr-engine',
      actor_email: 'SYSTEM / ANPR_STREAM',
      actor_role: 'SYSTEM',
      actor_department: 'Surveillance Command',
      action: 'WATCHLIST_MATCH_DETECTED',
      resource: 'Alert',
      ts: '2026-10-06T15:15:01.000Z',
      correlation_id: 'req-anpr-alert-101',
      details: {
        plate_normalized: clean || 'GJ01AB1234',
        category: 'STOLEN_VEHICLE',
        priority: 'CRITICAL',
      },
    },
  ];
}
