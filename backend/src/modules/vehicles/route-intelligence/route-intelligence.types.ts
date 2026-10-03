// ==============================================================================
// Route Intelligence Domain Types (Phase 7)
// NETRAVAHA Unified CCTV Intelligence Platform
// ==============================================================================

export type RouteStatus = 'PLAUSIBLE' | 'SUSPICIOUS' | 'IMPOSSIBLE' | 'INSUFFICIENT_DATA';

export interface RoutePlausibilityConfig {
  /** Minimum transit time in seconds between distinct physical cameras (default: 5s) */
  minTransitTimeSeconds: number;
  /** Maximum expected highway speed before flagging as suspicious (default: 130 km/h) */
  suspiciousSpeedThresholdKmh: number;
  /** Physically impossible speed threshold for land transit (default: 220 km/h) */
  impossibleSpeedThresholdKmh: number;
  /** Minimum camera separation in meters to qualify as physical road movement (default: 25m) */
  minCameraSeparationMeters: number;
  /** Maximum correlation window in hours before flagging excessive gap (default: 48h) */
  maxCorrelationWindowHours: number;
  /** Same-camera temporal grouping window in seconds (default: 30s) */
  sameCameraGroupingWindowSeconds: number;
}

export const DEFAULT_ROUTE_PLAUSIBILITY_CONFIG: RoutePlausibilityConfig = {
  minTransitTimeSeconds: 5,
  suspiciousSpeedThresholdKmh: 130,
  impossibleSpeedThresholdKmh: 220,
  minCameraSeparationMeters: 25,
  maxCorrelationWindowHours: 48,
  sameCameraGroupingWindowSeconds: 30,
};

export interface RouteCoordinates {
  lat: number;
  long: number;
}

export interface RawSightingInput {
  id: string;
  timestamp: Date | string;
  cameraId: string;
  cameraName: string;
  departmentName?: string;
  city?: string;
  coordinates: RouteCoordinates | null;
  confidence: number;
  consensusFrames: number;
  frameRef?: string;
}

export interface RouteSegmentIntelligence {
  segment_index: number;
  from_camera_id: string;
  from_camera_name: string;
  from_city?: string;
  from_coordinates: RouteCoordinates | null;
  from_timestamp: Date;
  to_camera_id: string;
  to_camera_name: string;
  to_city?: string;
  to_coordinates: RouteCoordinates | null;
  to_timestamp: Date;
  distance_meters: number;
  distance_type: 'GEODESIC' | 'ROAD_NETWORK';
  elapsed_seconds: number;
  estimated_speed_kmh: number | null;
  status: RouteStatus;
  reason: string;
  confidence: number;
  // Backwards compatibility with Phase 0-6 frontend expectations
  is_plausible: boolean;
  plausibility_status: 'PLAUSIBLE' | 'REQUIRES_REVIEW' | 'IMPLAUSIBLE' | 'STATIONARY_OR_REPEAT_SIGHTING';
  plausibility_reason: string;
  segment_confidence: number;
}

export interface RouteAnomaly {
  segment_index: number;
  from_camera: string;
  to_camera: string;
  status: RouteStatus;
  reason: string;
  estimated_speed_kmh?: number | null;
  elapsed_seconds?: number;
  distance_meters?: number;
}

export interface RouteIntelligenceSummary {
  total_distance_meters: number;
  total_elapsed_seconds: number;
  average_speed_kmh: number;
  hops_count: number;
  plausible_hops_count: number;
  suspicious_hops_count: number;
  impossible_hops_count: number;
  insufficient_data_hops_count: number;
  route_plausibility_score: number;
  route_confidence: number;
}

export interface RouteIntelligenceResult {
  plate_normalized: string;
  total_sightings: number;
  grouped_observations_count: number;
  cities: string[];
  route_plausibility_score: number;
  route_confidence: number;
  route_segments: RouteSegmentIntelligence[];
  summary: RouteIntelligenceSummary;
  anomalies: RouteAnomaly[];
  disclaimer: string;
}
