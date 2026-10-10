// ==============================================================================
// Incident-Time Sighting Classifier Unit Tests
// Project: NETRAVA — Unified CCTV Intelligence Platform
// Phase 3: Incident-Time Awareness for Historical Vehicle Sightings
// ==============================================================================

import {
  classifySightingIncidentRelation,
  IncidentSightingClassification,
} from './incident-classifier.util';

describe('classifySightingIncidentRelation (Unit Tests)', () => {
  const windowStart = new Date('2026-10-08T10:00:00.000Z');
  const windowEnd = new Date('2026-10-08T12:00:00.000Z');

  describe('1. Explicit Incident Time Window (Start and End defined)', () => {
    it('classifies sighting BEFORE incident start as BEFORE_REPORTED_INCIDENT', () => {
      const sightingTs = new Date('2026-10-08T09:59:59.000Z');
      const result = classifySightingIncidentRelation(sightingTs, windowStart, windowEnd);
      expect(result).toBe<IncidentSightingClassification>('BEFORE_REPORTED_INCIDENT');
    });

    it('classifies sighting exactly at incident start as WITHIN_REPORTED_INCIDENT_WINDOW', () => {
      const sightingTs = new Date('2026-10-08T10:00:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, windowStart, windowEnd);
      expect(result).toBe<IncidentSightingClassification>('WITHIN_REPORTED_INCIDENT_WINDOW');
    });

    it('classifies sighting strictly inside incident window as WITHIN_REPORTED_INCIDENT_WINDOW', () => {
      const sightingTs = new Date('2026-10-08T11:15:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, windowStart, windowEnd);
      expect(result).toBe<IncidentSightingClassification>('WITHIN_REPORTED_INCIDENT_WINDOW');
    });

    it('classifies sighting exactly at incident end as WITHIN_REPORTED_INCIDENT_WINDOW', () => {
      const sightingTs = new Date('2026-10-08T12:00:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, windowStart, windowEnd);
      expect(result).toBe<IncidentSightingClassification>('WITHIN_REPORTED_INCIDENT_WINDOW');
    });

    it('classifies sighting AFTER incident end as AFTER_REPORTED_INCIDENT', () => {
      const sightingTs = new Date('2026-10-08T12:00:01.000Z');
      const result = classifySightingIncidentRelation(sightingTs, windowStart, windowEnd);
      expect(result).toBe<IncidentSightingClassification>('AFTER_REPORTED_INCIDENT');
    });
  });

  describe('2. Incomplete Incident Window: Start Only', () => {
    it('classifies sighting before known start as BEFORE_REPORTED_INCIDENT', () => {
      const sightingTs = new Date('2026-10-08T09:00:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, windowStart, null);
      expect(result).toBe<IncidentSightingClassification>('BEFORE_REPORTED_INCIDENT');
    });

    it('classifies sighting at or after known start as AFTER_REPORTED_INCIDENT', () => {
      const sightingTs = new Date('2026-10-08T10:30:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, windowStart, null);
      expect(result).toBe<IncidentSightingClassification>('AFTER_REPORTED_INCIDENT');
    });
  });

  describe('3. Incomplete Incident Window: End Only', () => {
    it('classifies sighting after known end/discovery as AFTER_REPORTED_INCIDENT', () => {
      const sightingTs = new Date('2026-10-08T14:00:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, null, windowEnd);
      expect(result).toBe<IncidentSightingClassification>('AFTER_REPORTED_INCIDENT');
    });

    it('classifies sighting before known end/discovery as INCIDENT_TIME_UNKNOWN (indeterminate start)', () => {
      const sightingTs = new Date('2026-10-08T11:00:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, null, windowEnd);
      expect(result).toBe<IncidentSightingClassification>('INCIDENT_TIME_UNKNOWN');
    });
  });

  describe('4. Unknown or Missing Incident Window', () => {
    it('classifies missing timestamps as INCIDENT_TIME_UNKNOWN', () => {
      const sightingTs = new Date('2026-10-08T11:00:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, null, null);
      expect(result).toBe<IncidentSightingClassification>('INCIDENT_TIME_UNKNOWN');
    });

    it('handles undefined parameters safely as INCIDENT_TIME_UNKNOWN', () => {
      const sightingTs = new Date('2026-10-08T11:00:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs);
      expect(result).toBe<IncidentSightingClassification>('INCIDENT_TIME_UNKNOWN');
    });

    it('handles invalid sighting timestamp safely as INCIDENT_TIME_UNKNOWN', () => {
      const result = classifySightingIncidentRelation('invalid-date', windowStart, windowEnd);
      expect(result).toBe<IncidentSightingClassification>('INCIDENT_TIME_UNKNOWN');
    });

    it('handles invalid incident timestamps safely as INCIDENT_TIME_UNKNOWN', () => {
      const sightingTs = new Date('2026-10-08T11:00:00.000Z');
      const result = classifySightingIncidentRelation(sightingTs, 'invalid-start', windowEnd);
      expect(result).toBe<IncidentSightingClassification>('INCIDENT_TIME_UNKNOWN');
    });
  });

  describe('5. Explicit Timezone Offsets and Boundary Normalization (+05:30, -04:00)', () => {
    // 2026-10-08T15:30:00+05:30 normalized to UTC is 2026-10-08T10:00:00.000Z
    const offsetStartIST = '2026-10-08T15:30:00+05:30';
    // 2026-10-08T08:00:00-04:00 normalized to UTC is 2026-10-08T12:00:00.000Z
    const offsetEndEDT = '2026-10-08T08:00:00-04:00';

    it('1. classifies sighting in UTC against incident start with +05:30 offset', () => {
      // 10:30 UTC is strictly within normalized window [10:00 UTC, 12:00 UTC]
      const sightingTs = '2026-10-08T10:30:00.000Z';
      const result = classifySightingIncidentRelation(sightingTs, offsetStartIST, offsetEndEDT);
      expect(result).toBe<IncidentSightingClassification>('WITHIN_REPORTED_INCIDENT_WINDOW');
    });

    it('2. classifies sighting in UTC against incident end with -04:00 offset', () => {
      // 11:45 UTC is strictly within normalized window [10:00 UTC, 12:00 UTC]
      const sightingTs = '2026-10-08T11:45:00.000Z';
      const result = classifySightingIncidentRelation(sightingTs, offsetStartIST, offsetEndEDT);
      expect(result).toBe<IncidentSightingClassification>('WITHIN_REPORTED_INCIDENT_WINDOW');
    });

    it('3. classifies sighting exactly at the normalized incident start (10:00:00.000Z)', () => {
      const sightingTs = '2026-10-08T10:00:00.000Z';
      const result = classifySightingIncidentRelation(sightingTs, offsetStartIST, offsetEndEDT);
      expect(result).toBe<IncidentSightingClassification>('WITHIN_REPORTED_INCIDENT_WINDOW');
    });

    it('4. classifies sighting exactly at the normalized incident end (12:00:00.000Z)', () => {
      const sightingTs = '2026-10-08T12:00:00.000Z';
      const result = classifySightingIncidentRelation(sightingTs, offsetStartIST, offsetEndEDT);
      expect(result).toBe<IncidentSightingClassification>('WITHIN_REPORTED_INCIDENT_WINDOW');
    });

    it('5. classifies sighting immediately before normalized start (09:59:59.999Z)', () => {
      const sightingTs = '2026-10-08T09:59:59.999Z';
      const result = classifySightingIncidentRelation(sightingTs, offsetStartIST, offsetEndEDT);
      expect(result).toBe<IncidentSightingClassification>('BEFORE_REPORTED_INCIDENT');
    });

    it('6. classifies sighting immediately after normalized end (12:00:00.001Z)', () => {
      const sightingTs = '2026-10-08T12:00:00.001Z';
      const result = classifySightingIncidentRelation(sightingTs, offsetStartIST, offsetEndEDT);
      expect(result).toBe<IncidentSightingClassification>('AFTER_REPORTED_INCIDENT');
    });

    it('7. handles single-bound start with +05:30 offset', () => {
      // Start is 10:00:00Z
      expect(classifySightingIncidentRelation('2026-10-08T09:59:59Z', offsetStartIST, null))
        .toBe<IncidentSightingClassification>('BEFORE_REPORTED_INCIDENT');
      expect(classifySightingIncidentRelation('2026-10-08T10:00:00Z', offsetStartIST, null))
        .toBe<IncidentSightingClassification>('AFTER_REPORTED_INCIDENT');
    });

    it('8. handles single-bound end with -04:00 offset', () => {
      // End is 12:00:00Z
      expect(classifySightingIncidentRelation('2026-10-08T12:00:01Z', null, offsetEndEDT))
        .toBe<IncidentSightingClassification>('AFTER_REPORTED_INCIDENT');
      expect(classifySightingIncidentRelation('2026-10-08T11:59:59Z', null, offsetEndEDT))
        .toBe<IncidentSightingClassification>('INCIDENT_TIME_UNKNOWN');
    });
  });
});

