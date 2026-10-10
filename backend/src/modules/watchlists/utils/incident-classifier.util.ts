// ==============================================================================
// Incident-Time Sighting Classifier Utility
// Project: NETRAVA — Unified CCTV Intelligence Platform
// Phase 3: Incident-Time Awareness for Historical Vehicle Sightings
// ==============================================================================

export type IncidentSightingClassification =
  | 'BEFORE_REPORTED_INCIDENT'
  | 'WITHIN_REPORTED_INCIDENT_WINDOW'
  | 'AFTER_REPORTED_INCIDENT'
  | 'INCIDENT_TIME_UNKNOWN';

/**
 * Classifies a vehicle sighting's temporal relationship with a reported incident window.
 *
 * Rules:
 * 1. Both start and end defined:
 *    - sighting < start  -> BEFORE_REPORTED_INCIDENT
 *    - start <= sighting <= end -> WITHIN_REPORTED_INCIDENT_WINDOW
 *    - sighting > end    -> AFTER_REPORTED_INCIDENT
 * 2. Only start defined:
 *    - sighting < start  -> BEFORE_REPORTED_INCIDENT
 *    - sighting >= start -> AFTER_REPORTED_INCIDENT
 * 3. Only end defined:
 *    - sighting > end    -> AFTER_REPORTED_INCIDENT
 *    - sighting <= end   -> INCIDENT_TIME_UNKNOWN (insufficient data: unknown start time)
 * 4. Neither defined:
 *    - INCIDENT_TIME_UNKNOWN
 *
 * Note: Classification is investigative context only; it does not prove guilt or theft.
 */
export function classifySightingIncidentRelation(
  sightingTs: Date | string | number,
  incidentStart?: Date | string | number | null,
  incidentEnd?: Date | string | number | null,
): IncidentSightingClassification {
  if (!incidentStart && !incidentEnd) {
    return 'INCIDENT_TIME_UNKNOWN';
  }

  const sTs = new Date(sightingTs).getTime();
  if (isNaN(sTs)) {
    return 'INCIDENT_TIME_UNKNOWN';
  }

  const startTs = incidentStart ? new Date(incidentStart).getTime() : null;
  const endTs = incidentEnd ? new Date(incidentEnd).getTime() : null;

  if (startTs !== null && isNaN(startTs)) {
    return 'INCIDENT_TIME_UNKNOWN';
  }
  if (endTs !== null && isNaN(endTs)) {
    return 'INCIDENT_TIME_UNKNOWN';
  }

  // Case 1: Bounded window (both start and end known)
  if (startTs !== null && endTs !== null) {
    if (sTs < startTs) {
      return 'BEFORE_REPORTED_INCIDENT';
    }
    if (sTs >= startTs && sTs <= endTs) {
      return 'WITHIN_REPORTED_INCIDENT_WINDOW';
    }
    return 'AFTER_REPORTED_INCIDENT';
  }

  // Case 2: Only start is known (point-in-time incident or known start)
  if (startTs !== null && endTs === null) {
    if (sTs < startTs) {
      return 'BEFORE_REPORTED_INCIDENT';
    }
    return 'AFTER_REPORTED_INCIDENT';
  }

  // Case 3: Only end is known (discovery / report time, occurrence window start unknown)
  if (startTs === null && endTs !== null) {
    if (sTs > endTs) {
      return 'AFTER_REPORTED_INCIDENT';
    }
    // Sighting occurred prior to discovery time, but missing start makes occurrence window indeterminate
    return 'INCIDENT_TIME_UNKNOWN';
  }

  return 'INCIDENT_TIME_UNKNOWN';
}
