// ==============================================================================
// IRouteDistanceProvider Abstraction (Phase 7)
// NETRAVA Unified CCTV Intelligence Platform
// ==============================================================================

import { RouteCoordinates } from './route-intelligence.types';

export interface DistanceResult {
  distanceMeters: number;
  distanceType: 'GEODESIC' | 'ROAD_NETWORK';
  provider: string;
}

export interface IRouteDistanceProvider {
  readonly providerName: string;
  readonly distanceType: 'GEODESIC' | 'ROAD_NETWORK';

  /**
   * Calculate distance in meters between two geographic coordinates.
   * Returns null if coordinates are invalid or cannot be resolved.
   */
  getDistance(
    origin: RouteCoordinates & { cameraId?: string },
    destination: RouteCoordinates & { cameraId?: string },
  ): Promise<DistanceResult | null>;
}
