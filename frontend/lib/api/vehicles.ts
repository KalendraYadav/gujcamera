// ==============================================================================
// Vehicle Investigation REST API Service Layer
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8, 10, 14.2)
//                  docs/API.md (Section 5: Vehicle Search & Investigation)
//
// Authorization: Endpoints require INVESTIGATOR, DEPARTMENT_ADMIN, or SUPER_ADMIN.
// Audit: Every call triggers a backend synchronous audit log entry.
// Plate normalization: Backend automatically normalizes plates (strips spaces/hyphens/casing).
// ==============================================================================

import { apiClient } from './client';
import {
  VehicleSearchQuery,
  VehicleSearchResponse,
  VehicleDetail,
  VehicleSightingsResponse,
  VehicleTimelineResponse,
} from '@/types/vehicle';

export const vehiclesApi = {
  /**
   * Search vehicles by license plate prefix or exact plate string.
   * Normalized server-side. Supports optional time range and pagination.
   * Requires INVESTIGATOR+ role. Triggers VEHICLE_SEARCH audit record.
   */
  async searchVehicles(query: VehicleSearchQuery = {}): Promise<VehicleSearchResponse> {
    const params = new URLSearchParams();

    if (query.q) params.set('q', query.q);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.page) params.set('page', String(query.page));

    const queryString = params.toString();
    const endpoint = queryString ? `/vehicles?${queryString}` : '/vehicles';
    return apiClient.get<VehicleSearchResponse>(endpoint);
  },

  /**
   * Fetch the deep-dive record for a single vehicle plate.
   * Returns attributes, watchlist status, first/last sighting summaries.
   * Requires INVESTIGATOR+ role. Triggers VEHICLE_DETAIL_VIEW audit record.
   */
  async getVehicleByPlate(plate: string): Promise<VehicleDetail> {
    // Normalize plate for URL encoding safety (trim whitespace)
    const normalizedPlate = plate.trim().toUpperCase().replace(/[\s\-]/g, '');
    return apiClient.get<VehicleDetail>(`/vehicles/${encodeURIComponent(normalizedPlate)}`);
  },

  /**
   * Fetch paginated chronological sightings for a vehicle plate.
   * Each sighting includes camera name, coordinates, confidence, consensus frames.
   * Requires INVESTIGATOR+ role. Triggers VEHICLE_SIGHTINGS_VIEW audit record.
   */
  async getVehicleSightings(
    plate: string,
    params: {
      from?: string;
      to?: string;
      camera_id?: string;
      department_id?: string;
      sort?: 'asc' | 'desc';
      limit?: number;
      page?: number;
    } = {}
  ): Promise<VehicleSightingsResponse> {
    const qp = new URLSearchParams();

    if (params.from) qp.set('from', params.from);
    if (params.to) qp.set('to', params.to);
    if (params.camera_id) qp.set('camera_id', params.camera_id);
    if (params.department_id) qp.set('department_id', params.department_id);
    if (params.sort) qp.set('sort', params.sort);
    if (params.limit) qp.set('limit', String(params.limit));
    if (params.page) qp.set('page', String(params.page));

    const qs = qp.toString();
    const normalizedPlate = plate.trim().toUpperCase().replace(/[\s\-]/g, '');
    const endpoint = qs
      ? `/vehicles/${encodeURIComponent(normalizedPlate)}/sightings?${qs}`
      : `/vehicles/${encodeURIComponent(normalizedPlate)}/sightings`;
    return apiClient.get<VehicleSightingsResponse>(endpoint);
  },

  /**
   * Reconstruct the spatio-temporal route trajectory for a vehicle.
   * Returns chronological sightings, route segments with PostGIS geodesic
   * distances (meters), travel time (seconds), implied speed (km/h),
   * and plausibility scores.
   *
   * IMPORTANT: This endpoint uses /route alias but returns /timeline shape.
   * The disclaimer field must be displayed to prevent misrepresentation.
   * Requires INVESTIGATOR+ role. Triggers VEHICLE_TIMELINE_SEARCH audit record.
   */
  async getVehicleTimeline(
    plate: string,
    params: {
      from?: string;
      to?: string;
      max_speed_kmh?: number;
    } = {}
  ): Promise<VehicleTimelineResponse> {
    const qp = new URLSearchParams();

    if (params.from) qp.set('from', params.from);
    if (params.to) qp.set('to', params.to);
    if (params.max_speed_kmh) qp.set('max_speed_kmh', String(params.max_speed_kmh));

    const qs = qp.toString();
    const normalizedPlate = plate.trim().toUpperCase().replace(/[\s\-]/g, '');
    const endpoint = qs
      ? `/vehicles/${encodeURIComponent(normalizedPlate)}/route?${qs}`
      : `/vehicles/${encodeURIComponent(normalizedPlate)}/route`;
    return apiClient.get<VehicleTimelineResponse>(endpoint);
  },
};
