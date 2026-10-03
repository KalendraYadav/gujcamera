// ==============================================================================
// Dashboard & Operational Command Center Domain Types
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8, 14.2)
//                  Phase 9 Operational Command Center Specification
// ==============================================================================

export type SubsystemStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
export type CameraNetworkStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface SystemHealthState {
  database: SubsystemStatus;
  stream_gateway: SubsystemStatus;
  ai_pipeline: SubsystemStatus;
  event_pipeline: SubsystemStatus;
  camera_network: CameraNetworkStatus;
  postgis: SubsystemStatus;
}

export interface CameraOverviewState {
  total: number;
  online: number;
  degraded: number;
  offline: number;
  error: number;
  configured_prototype_sources: number;
}

export interface OperationalAlertItem {
  id: string;
  severity: string;
  status: string;
  category: string;
  reason: string;
  plate: string;
  camera_name: string;
  city: string;
  timestamp: string;
}

export interface OperationalWatchlistItem {
  plate: string;
  category: string;
  priority: string;
  camera_name: string;
  city: string;
  timestamp: string;
  alert_id?: string;
}

export interface RecentCCTVSighting {
  id: string;
  plate: string;
  camera_name: string;
  city: string;
  confidence: number;
  consensus_frames: number;
  has_evidence: boolean;
  timestamp: string;
  is_watchlisted: boolean;
}

export interface JurisdictionMetricItem {
  id: string;
  name: string;
  code: string;
  total_cameras: number;
  online_cameras: number;
  active_alerts: number;
  recent_sightings: number;
}

export interface RecentInvestigationEvent {
  id: string;
  timestamp: string;
  actor_email: string;
  actor_role: string;
  action: string;
  resource: string;
  target?: string;
}

export interface OperationalSummaryResponse {
  timestamp: string;
  system: SystemHealthState;
  cameras: CameraOverviewState;
  alerts: {
    total_active: number;
    critical: number;
    high: number;
    medium: number;
    recent: OperationalAlertItem[];
  };
  watchlists: {
    total_watchlists: number;
    active_entries: number;
    recent_matches: OperationalWatchlistItem[];
  };
  sightings: {
    recent_observations: RecentCCTVSighting[];
  };
  jurisdictions: JurisdictionMetricItem[];
  investigations: {
    recent_events: RecentInvestigationEvent[];
  };
  disclaimer: string;
}
