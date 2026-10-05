// ==============================================================================
// Camera Registry & GIS Domain Types
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.2 & Section 8.2)
// ==============================================================================

export type OperationalStatus = 'ONLINE' | 'CONNECTING' | 'DEGRADED' | 'OFFLINE' | 'ERROR';

export type CameraProtocol = 'RTSP' | 'ONVIF' | 'MOCK_VENDOR' | 'VENDOR_API';

export type VideoSourceType =
  | 'DEMO_FILE'
  | 'RESEARCH_VIDEO'
  | 'SYNTHETIC_STREAM'
  | 'REAL_RTSP'
  | 'REAL_ONVIF'
  | 'VMS_GATEWAY';

export interface CameraLocation {
  address: string;
  zone: string;
  district: string;
  city?: string;
  state?: string;
}

export interface CameraStream {
  id: string;
  codec: string;
  resolution: string;
  fps: number;
  url_or_handle: string;
}

export interface CameraHealth {
  status: OperationalStatus;
  last_heartbeat: string;
  fps_actual: number | null;
  packet_loss: number | null;
  reconnect_attempts?: number;
  failure_reason?: string | null;
  last_transition?: string | null;
  recovery_at?: string | null;
}

export interface Camera {
  id: string;
  name: string;
  department_id: string;
  department_name?: string;
  lat: number;
  long: number;
  protocol: CameraProtocol;
  connector_type_id: string;
  operational_status: OperationalStatus;
  is_active: boolean;
  credential_configured?: boolean;
  source_type?: VideoSourceType;
  created_at: string;
  updated_at: string;
  location: CameraLocation | null;
  streams: CameraStream[];
  health: CameraHealth | null;
}

export interface CameraHealthSummary {
  total_cameras: number;
  online: number;
  degraded: number;
  offline: number;
  connecting: number;
  error: number;
  decommissioned: number;
  note: string;
}

export interface CameraQuery {
  bbox?: string; // minLong,minLat,maxLong,maxLat
  status?: OperationalStatus;
  department_id?: string;
  limit?: number;
  cursor?: string;
  is_active?: boolean;
}

export interface CameraListResponse {
  data: Camera[];
  pagination: {
    limit: number;
    total: number;
    next_cursor: string | null;
  };
}

export type AdapterConnectionStatus = 'CONNECTED' | 'DEGRADED' | 'OFFLINE' | 'ERROR';

export interface DiscoveredDeviceInfo {
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
}

export interface StreamMetadata {
  codec?: string;
  resolution?: string;
  fps?: number;
  streamUri?: string;
  deviceInfo?: DiscoveredDeviceInfo;
  rawDetails?: Record<string, any>;
}

export interface ConnectionProbeResult {
  status: AdapterConnectionStatus;
  protocol: CameraProtocol;
  reachable: boolean;
  latencyMs: number;
  streamMetadata?: StreamMetadata;
  errorMessage?: string;
  testedAt: string;
}

export interface TestConnectionPayload {
  protocol: CameraProtocol;
  url_or_handle: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  profileToken?: string;
}

export interface ConnectorRecord {
  id: string;
  adapter_type: string;
  config_ref: string;
  created_at: string;
}

export interface ConnectorsListResponse {
  connectors: ConnectorRecord[];
  supported_protocols: CameraProtocol[];
}

export interface CreateCameraPayload {
  name: string;
  department_id: string;
  lat: number;
  long: number;
  protocol: CameraProtocol;
  connector_type_id: string;
  operational_status?: OperationalStatus;
  location?: {
    address: string;
    zone: string;
    district: string;
  };
  stream?: {
    codec?: string;
    resolution?: string;
    fps?: number;
    url_or_handle?: string;
  };
  credentials?: {
    username?: string;
    password?: string;
    token?: string;
  };
}

export interface ConfigureCredentialsPayload {
  credential_type?: string;
  username?: string;
  password?: string;
  token?: string;
}

export interface ConfigureCredentialsResponse {
  configured: boolean;
  cameraId: string;
  credentialType: string;
}

export interface DepartmentRecord {
  id: string;
  name: string;
}

