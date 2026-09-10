// ==============================================================================
// Vehicle Investigation Domain Types
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.2, 10, 14.2)
//                  docs/API.md (Section 5: Vehicle Search & Investigation)
//
// Tracking Governance:
//   ONLY plate-based cross-camera correlation is implemented.
//   Visual re-identification is NOT implemented.
//   Same-camera temporal tracking is NOT implemented.
//   These distinctions must be preserved in all UI labels.
// ==============================================================================

export interface VehicleAttributes {
  color?: string;
  make?: string;
  model?: string;
  type?: string;
}

export interface VehicleSearchResult {
  plate_normalized: string;
  first_seen: string;
  last_seen: string;
  attributes: VehicleAttributes | null;
  total_sightings: number;
  is_watchlisted: boolean;
  watchlist_category: string | null;
  watchlist_priority: string | null;
}

export interface VehicleSightingSummary {
  id: string;
  timestamp: string;
  camera_name: string;
  location: string;
  district: string;
}

export interface WatchlistDetails {
  category: string;
  priority: string;
  reason: string;
  flagged_at: string;
}

export interface VehicleDetail {
  plate_normalized: string;
  first_seen: string;
  last_seen: string;
  attributes: VehicleAttributes | null;
  total_sightings: number;
  is_watchlisted: boolean;
  watchlist_details: WatchlistDetails | null;
  first_known_sighting: VehicleSightingSummary | null;
  last_known_sighting: VehicleSightingSummary | null;
}

export interface SightingCoordinates {
  lat: number;
  long: number;
}

export interface SightingLocation {
  address: string;
  zone: string;
  district: string;
}

export interface VehicleSighting {
  id: string;
  plate_normalized: string;
  timestamp: string;
  confidence: number;
  consensus_frames: number;
  frame_ref: string;
  camera_id: string;
  camera_name: string;
  department_id: string;
  department_name: string;
  coordinates: SightingCoordinates;
  location: SightingLocation | null;
}

export interface SightingPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface VehicleSightingsResponse {
  plate_normalized: string;
  data: VehicleSighting[];
  pagination: SightingPagination;
}

export interface RouteSegment {
  from_camera_id: string;
  from_camera_name: string;
  from_coordinates: SightingCoordinates;
  from_timestamp: string;
  to_camera_id: string;
  to_camera_name: string;
  to_coordinates: SightingCoordinates;
  to_timestamp: string;
  distance_meters: number;
  elapsed_seconds: number;
  estimated_speed_kmh: number;
  is_plausible: boolean;
  plausibility_status: 'PLAUSIBLE' | 'REQUIRES_REVIEW';
  plausibility_reason: string;
  segment_confidence: number;
}

export interface TimelineSighting {
  id: string;
  timestamp: string;
  camera_id: string;
  camera_name: string;
  department_name?: string;
  coordinates: SightingCoordinates;
  location: SightingLocation | null;
  confidence: number;
  consensus_frames: number;
  frame_ref: string;
}

export interface RouteSummary {
  total_distance_meters: number;
  total_elapsed_seconds: number;
  average_speed_kmh: number;
  hops_count: number;
  implausible_hops_count: number;
}

export interface VehicleTimelineResponse {
  plate_normalized: string;
  total_sightings: number;
  route_plausibility_score: number;
  sightings: TimelineSighting[];
  route_segments: RouteSegment[];
  summary: RouteSummary;
  disclaimer: string;
}

export interface VehicleSearchQuery {
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
}

export interface VehicleSearchResponse {
  data: VehicleSearchResult[];
  pagination: SightingPagination;
}

export type WatchlistPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type WatchlistCategory =
  | 'STOLEN_VEHICLE'
  | 'WANTED_SUSPECT'
  | 'CONTRABAND_TRAFFICKING'
  | 'TERRORISM'
  | 'OTHER';
