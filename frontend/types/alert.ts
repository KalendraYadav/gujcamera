// ==============================================================================
// Alert Domain Types
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.2, 6.3, 14.2)
// ==============================================================================

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AlertStatus =
  | 'NEW'
  | 'ACKNOWLEDGED'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'DISMISSED';

export interface AlertSightingSummary {
  id: string;
  camera: {
    id: string;
    name: string;
    coordinates?: {
      lat: number;
      long: number;
    } | null;
    location?: {
      address: string;
      zone: string;
      district: string;
    } | null;
    department?: {
      id: string;
      name: string;
    } | null;
  } | null;
  vehicle?: {
    plate_normalized: string;
    first_seen?: string;
    last_seen?: string;
    attributes?: any;
  } | null;
}

export interface AlertWatchlistMatch {
  entry_id: string;
  plate_normalized: string;
  category: string;
  reason: string;
  priority: AlertSeverity;
  added_by: string;
  watchlist?: {
    id: string;
    name: string;
    department?: {
      id: string;
      name: string;
    } | null;
  } | null;
}

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  timestamp: string;
  sighting?: AlertSightingSummary | null;
  watchlist_match?: AlertWatchlistMatch | null;
  acknowledged_by?: { id: string; email: string } | null;
  resolved_by?: { id: string; email: string } | null;
  dismissal_reason?: string | null;
  created_at: string;
  updated_at: string;
  disclaimer?: string;
}

export interface AlertQueryFilter {
  status?: AlertStatus;
  severity?: AlertSeverity;
  watchlist_id?: string;
  plate?: string;
  camera_id?: string;
  limit?: number;
  page?: number;
}

export interface AlertListResponse {
  data: AlertItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export type ConnectionStatus = 'LIVE' | 'RECONNECTING' | 'POLLING FALLBACK' | 'OFFLINE';
