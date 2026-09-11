// ==============================================================================
// Camera Registry & GIS REST API Service Layer
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8.2 & docs/API.md Section 3)
// ==============================================================================

import { apiClient } from './client';
import {
  Camera,
  CameraListResponse,
  CameraQuery,
  CameraHealthSummary,
} from '@/types/camera';

export const camerasApi = {
  /**
   * Fetch cameras with optional PostGIS spatial bbox, status, and department filtering
   * bbox format: minLong,minLat,maxLong,maxLat
   */
  async getCameras(query: CameraQuery = {}): Promise<CameraListResponse> {
    const params = new URLSearchParams();

    if (query.bbox) params.set('bbox', query.bbox);
    if (query.status) params.set('status', query.status);
    if (query.department_id) params.set('department_id', query.department_id);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.is_active !== undefined) params.set('is_active', String(query.is_active));

    const queryString = params.toString();
    const endpoint = queryString ? `/cameras?${queryString}` : '/cameras';
    return apiClient.get<CameraListResponse>(endpoint);
  },

  /**
   * Fetch a single camera deep-dive record by ID
   */
  async getCameraById(id: string): Promise<Camera> {
    return apiClient.get<Camera>(`/cameras/${id}`);
  },

  /**
   * Get operational telemetry summary across all registered CCTV cameras
   */
  async getCameraHealthSummary(): Promise<CameraHealthSummary> {
    return apiClient.get<CameraHealthSummary>('/cameras/health/summary');
  },

  /**
   * Get operational health telemetry for a specific camera
   */
  async getCameraHealth(id: string): Promise<any> {
    return apiClient.get(`/cameras/${id}/health`);
  },

  /**
   * Find nearby cameras using PostGIS Great-Circle distance
   */
  async getNearbyCameras(lat: number, long: number, radiusMeters: number, limit = 20): Promise<any> {
    return apiClient.get(`/cameras/nearby?lat=${lat}&long=${long}&radius_meters=${radiusMeters}&limit=${limit}`);
  },

  /**
   * Execute real-time camera stream connection probe via protocol adapter
   */
  async testConnection(payload: import('@/types/camera').TestConnectionPayload): Promise<import('@/types/camera').ConnectionProbeResult> {
    return apiClient.post<import('@/types/camera').ConnectionProbeResult>('/cameras/test-connection', payload);
  },

  /**
   * Fetch list of available camera connectors and supported protocol adapters
   */
  async getConnectors(): Promise<import('@/types/camera').ConnectorsListResponse> {
    return apiClient.get<import('@/types/camera').ConnectorsListResponse>('/cameras/connectors/list');
  },

  /**
   * Onboard a new camera into the platform
   */
  async createCamera(payload: import('@/types/camera').CreateCameraPayload): Promise<Camera> {
    return apiClient.post<Camera>('/cameras', payload);
  },

  /**
   * Fetch list of departments with canonical IDs and names for administrative fleet assignment
   */
  async getDepartments(): Promise<import('@/types/camera').DepartmentRecord[]> {
    return apiClient.get<import('@/types/camera').DepartmentRecord[]>('/cameras/departments');
  },
};
