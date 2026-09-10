/**
 * Canonical Domain Event Contract: vehicle.sighting_created (Phase 3F)
 * Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
 * Source of Truth: master_architecture.md Section 7.1 & Section 7.3
 */

export const SCHEMA_VERSION = '1.0';
export const EVENT_TYPE_SIGHTING_CREATED = 'vehicle.sighting_created';

export interface VehicleSightingCreatedPayload {
  event_id: string;
  event_type: string;
  schema_version: string;
  occurred_at: string;
  producer: string;
  sighting_id: string;
  evidence_id: string;
  camera_id: string;
  plate_normalized: string;
  confidence: number;
  consensus_of: number;
  total_observations: number;
  storage_ref: string;
  evidence_hash: string;
  captured_at: string;
  correlation_id: string;
}

/**
 * Strongly validate incoming vehicle.sighting_created event payload.
 * Rejects unsupported schema versions, invalid hashes, empty plate strings,
 * or out-of-range confidence scores.
 */
export function validateVehicleSightingCreatedPayload(data: any): VehicleSightingCreatedPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('Event payload must be a non-null object');
  }

  const {
    event_id,
    event_type,
    schema_version,
    occurred_at,
    producer,
    sighting_id,
    evidence_id,
    camera_id,
    plate_normalized,
    confidence,
    consensus_of,
    total_observations,
    storage_ref,
    evidence_hash,
    captured_at,
    correlation_id,
  } = data;

  if (schema_version !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version '${schema_version}'. Expected '${SCHEMA_VERSION}'`,
    );
  }

  if (event_type !== EVENT_TYPE_SIGHTING_CREATED) {
    throw new Error(
      `Invalid event type '${event_type}'. Expected '${EVENT_TYPE_SIGHTING_CREATED}'`,
    );
  }

  if (!event_id || typeof event_id !== 'string') {
    throw new Error('event_id is required');
  }

  if (!sighting_id || typeof sighting_id !== 'string') {
    throw new Error('sighting_id is required');
  }

  if (!evidence_id || typeof evidence_id !== 'string') {
    throw new Error('evidence_id is required');
  }

  if (!camera_id || typeof camera_id !== 'string') {
    throw new Error('camera_id is required');
  }

  if (!plate_normalized || typeof plate_normalized !== 'string') {
    throw new Error('plate_normalized cannot be empty');
  }

  const confNum = Number(confidence);
  if (isNaN(confNum) || confNum < 0.0 || confNum > 1.0) {
    throw new Error(`confidence must be between 0.0 and 1.0, got ${confidence}`);
  }

  const consOfNum = Number(consensus_of);
  const totalObsNum = Number(total_observations);
  if (isNaN(consOfNum) || consOfNum < 1 || isNaN(totalObsNum) || totalObsNum < 1) {
    throw new Error('consensus counts must be at least 1');
  }

  if (
    !storage_ref ||
    typeof storage_ref !== 'string' ||
    (!storage_ref.startsWith('s3://') && !storage_ref.startsWith('urn:'))
  ) {
    throw new Error(`Invalid evidence storage reference: '${storage_ref}'`);
  }

  if (
    !evidence_hash ||
    typeof evidence_hash !== 'string' ||
    evidence_hash.length !== 64 ||
    !/^[0-9a-fA-F]{64}$/.test(evidence_hash)
  ) {
    throw new Error(
      `evidence_hash must be a 64-character SHA-256 hexadecimal string, got '${evidence_hash}'`,
    );
  }

  return {
    event_id: String(event_id),
    event_type: String(event_type),
    schema_version: String(schema_version),
    occurred_at: String(occurred_at || new Date().toISOString()),
    producer: String(producer || 'ai-worker'),
    sighting_id: String(sighting_id),
    evidence_id: String(evidence_id),
    camera_id: String(camera_id),
    plate_normalized: String(plate_normalized).trim().toUpperCase(),
    confidence: confNum,
    consensus_of: consOfNum,
    total_observations: totalObsNum,
    storage_ref: String(storage_ref),
    evidence_hash: String(evidence_hash).toLowerCase(),
    captured_at: String(captured_at || new Date().toISOString()),
    correlation_id: String(correlation_id || event_id),
  };
}
