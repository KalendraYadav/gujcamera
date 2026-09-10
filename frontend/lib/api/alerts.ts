// ==============================================================================
// Alerts Management API Client
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.3, 8.2, 14.2)
// ==============================================================================

import { apiClient } from './client';
import { AlertItem, AlertListResponse, AlertQueryFilter } from '@/types/alert';

export const alertsApi = {
  /**
   * List and filter alerts with pagination and indexed ordering
   */
  async listAlerts(filter?: AlertQueryFilter): Promise<AlertListResponse> {
    const query = new URLSearchParams();
    if (filter?.status) query.set('status', filter.status);
    if (filter?.severity) query.set('severity', filter.severity);
    if (filter?.watchlist_id) query.set('watchlist_id', filter.watchlist_id);
    if (filter?.plate) query.set('plate', filter.plate);
    if (filter?.camera_id) query.set('camera_id', filter.camera_id);
    if (filter?.limit) query.set('limit', String(filter.limit));
    if (filter?.page) query.set('page', String(filter.page));

    const qs = query.toString();
    return apiClient.get<AlertListResponse>(qs ? `/alerts?${qs}` : '/alerts');
  },

  /**
   * Get single alert deep-dive with linked sighting and camera evidence
   */
  async getAlert(id: string): Promise<AlertItem> {
    return apiClient.get<AlertItem>(`/alerts/${id}`);
  },

  /**
   * Acknowledge a NEW alert (Operator triage action)
   */
  async acknowledgeAlert(id: string): Promise<AlertItem> {
    return apiClient.post<AlertItem>(`/alerts/${id}/acknowledge`, {});
  },

  /**
   * Open formal investigation on an ACKNOWLEDGED alert (Investigator triage action)
   */
  async investigateAlert(id: string): Promise<AlertItem> {
    return apiClient.post<AlertItem>(`/alerts/${id}/investigate`, {});
  },

  /**
   * Resolve an alert under investigation
   */
  async resolveAlert(id: string, reason?: string): Promise<AlertItem> {
    return apiClient.post<AlertItem>(`/alerts/${id}/resolve`, { reason });
  },

  /**
   * Dismiss an alert (false positive or non-actionable, requires reason)
   */
  async dismissAlert(id: string, reason: string): Promise<AlertItem> {
    return apiClient.post<AlertItem>(`/alerts/${id}/dismiss`, { reason });
  },
};
