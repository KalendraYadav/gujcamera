import { CameraProtocol } from '@prisma/client';

export enum AdapterConnectionStatus {
  CONNECTED = 'CONNECTED',
  DEGRADED = 'DEGRADED',
  OFFLINE = 'OFFLINE',
  ERROR = 'ERROR',
}

export interface ProtocolConnectionConfig {
  protocol: CameraProtocol;
  endpointUrl: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  profileToken?: string;
}

export interface DiscoveredDeviceInfo {
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
}

export interface StreamMetadata {
  codec?: string; // e.g., 'H264', 'H265'
  resolution?: string; // e.g., '1920x1080'
  fps?: number;
  streamUri?: string; // e.g., RTSP URL extracted from ONVIF GetStreamUri
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

export interface CameraProtocolAdapter {
  readonly protocol: CameraProtocol;

  /**
   * Validate configuration parameters prior to making network calls
   */
  validateConfig(config: ProtocolConnectionConfig): { isValid: boolean; error?: string };

  /**
   * Execute real protocol probe to determine connection state and retrieve stream metadata
   */
  probeConnection(config: ProtocolConnectionConfig): Promise<ConnectionProbeResult>;
}
