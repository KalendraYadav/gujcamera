// ==============================================================================
// NETRAVA — Dataset Manifest & Demonstration Stream Contracts
// Gujarat Police Innovation Challenge 2026
// Source of Truth: docs/PHASE_12_DATASET_READINESS_AUDIT.md & master_architecture.md
// ==============================================================================

export type ManifestSourceType =
  | 'SYNTHETIC_STREAM'
  | 'RESEARCH_VIDEO'
  | 'DEMO_FILE'
  | 'REAL_RTSP'
  | 'REAL_ONVIF'
  | 'VMS_GATEWAY';

export type ManifestProvenance =
  | 'IN_HOUSE_SYNTHETIC'
  | 'PUBLIC_RESEARCH_VIDEO'
  | 'GOVERNMENT_CCTV_RECORDING'
  | 'ACADEMIC_DATASET';

export type ManifestLicenseStatus =
  | 'VERIFIED_SYNTHETIC'
  | 'VERIFIED_OPEN_ACCESS'
  | 'LICENSE_VERIFICATION_REQUIRED'
  | 'RESTRICTED_RESEARCH';

export interface ManifestTargetVehicle {
  plate: string;
  vehicleClass: string;
  color: string;
  make: string;
  model: string;
  firReference?: string;
  notes?: string;
}

export interface ManifestCameraEntry {
  cameraId: string;
  sourceId: string;
  sourceType: ManifestSourceType;
  displayName: string;
  jurisdiction: string;
  location: string;
  latitude: number;
  longitude: number;
  videoPath: string;
  sha256: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  rtspPath: string;
  loop: boolean;
  playbackSpeed: number;
  provenance: ManifestProvenance;
  licenseStatus: ManifestLicenseStatus;
  attribution: string;
  targetVehicles: ManifestTargetVehicle[];
  notes?: string;
}

export interface DemonstrationManifest {
  $schema?: string;
  manifestVersion: string;
  title: string;
  challenge: string;
  classification: string;
  updatedAt: string;
  disclaimer: string;
  cameras: ManifestCameraEntry[];
}

export interface SourceValidationResult {
  valid: boolean;
  cameraId: string;
  sourceId: string;
  videoPath: string;
  resolvedAbsolutePath: string;
  fileExists: boolean;
  hashMatched: boolean;
  computedHash?: string;
  expectedHash: string;
  metadataValid: boolean;
  licenseStatus: ManifestLicenseStatus;
  errors: string[];
  warnings: string[];
}

export interface ManifestValidationReport {
  valid: boolean;
  manifestVersion: string;
  totalCameras: number;
  validCameras: number;
  invalidCameras: number;
  results: SourceValidationResult[];
  unverifiedLicenseCount: number;
  timestamp: string;
}

export type ReplayState = 'IDLE' | 'STARTING' | 'STREAMING' | 'RECONNECTING' | 'STOPPED' | 'ERROR';

export interface CameraReplayStatus {
  cameraId: string;
  rtspPath: string;
  targetRtspUrl: string;
  hlsUrl: string;
  sourceType: ManifestSourceType;
  licenseStatus: ManifestLicenseStatus;
  isSimulatedLive: boolean;
  state: ReplayState;
  pid?: number;
  startedAt?: Date;
  uptimeSeconds?: number;
  restartCount: number;
  lastError?: string;
  mediaMtxReady?: boolean;
}

export interface IDatasetSource {
  getManifest(): Promise<DemonstrationManifest>;
  validateAllSources(): Promise<ManifestValidationReport>;
  getSourceByCameraId(cameraId: string): Promise<ManifestCameraEntry | null>;
  getAllSources(): Promise<ManifestCameraEntry[]>;
}
