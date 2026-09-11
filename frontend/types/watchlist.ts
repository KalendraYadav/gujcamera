// ==============================================================================
// Watchlist Domain Types
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.2, 14.2)
// ==============================================================================

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface WatchlistEntry {
  id: string;
  watchlist_id: string;
  plate_normalized: string;
  category: string;
  reason: string;
  priority: AlertSeverity;
  added_by: string;
  expires_at: string | null;
  active: boolean;
  sightings_count?: number;
  created_at: string;
}

export interface Watchlist {
  id: string;
  name: string;
  department_id: string;
  department?: {
    id: string;
    name: string;
  } | null;
  department_name?: string;
  owner: string;
  created_at: string;
  entries_count?: number;
  entry_count?: number;
  entries?: WatchlistEntry[];
}

export interface CreateWatchlistPayload {
  name: string;
  department_id: string;
  owner: string;
}

export interface CreateWatchlistEntryPayload {
  plate: string;
  category: string;
  reason: string;
  priority?: AlertSeverity;
  expires_at?: string;
}

export interface UpdateWatchlistEntryPayload {
  category?: string;
  reason?: string;
  priority?: AlertSeverity;
  active?: boolean;
  expires_at?: string;
}
