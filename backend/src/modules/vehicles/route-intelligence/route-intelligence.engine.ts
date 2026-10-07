// ==============================================================================
// Route Intelligence Engine (Phase 7)
// NETRAVA Unified CCTV Intelligence Platform
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  RouteStatus,
  RoutePlausibilityConfig,
  DEFAULT_ROUTE_PLAUSIBILITY_CONFIG,
  RawSightingInput,
  RouteSegmentIntelligence,
  RouteAnomaly,
  RouteIntelligenceSummary,
  RouteIntelligenceResult,
} from './route-intelligence.types';
import { IRouteDistanceProvider } from './route-distance-provider.interface';

@Injectable()
export class RouteIntelligenceEngine {
  private readonly logger = new Logger(RouteIntelligenceEngine.name);

  /**
   * Reconstruct observed camera-to-camera movement from discrete sightings.
   * Enforces strict chronological ordering, same-camera temporal grouping,
   * bounded distance calculations, and deterministic velocity plausibility.
   */
  async computeRouteIntelligence(
    plateNormalized: string,
    rawSightings: RawSightingInput[],
    distanceProvider: IRouteDistanceProvider,
    customConfig?: Partial<RoutePlausibilityConfig>,
  ): Promise<RouteIntelligenceResult> {
    const config: RoutePlausibilityConfig = {
      ...DEFAULT_ROUTE_PLAUSIBILITY_CONFIG,
      ...customConfig,
    };

    if (!rawSightings || rawSightings.length === 0) {
      return this.emptyResult(plateNormalized);
    }

    // 1. Strict Chronological Ordering & Timestamp Normalization
    const sortedSightings = this.sortAndNormalizeSightings(rawSightings);

    // 2. Duplicate Delivery Deduplication & Same-Camera Observation Grouping
    const groupedObservations = this.groupSameCameraObservations(
      sortedSightings,
      config.sameCameraGroupingWindowSeconds,
    );

    // Extract all distinct cities observed across all sightings
    const citiesSet = new Set<string>();
    for (const s of sortedSightings) {
      if (s.city) citiesSet.add(s.city);
    }
    const cities = Array.from(citiesSet);

    // 3. Multi-Sighting Route Segment Construction
    const routeSegments: RouteSegmentIntelligence[] = [];
    const anomalies: RouteAnomaly[] = [];

    let totalDistanceMeters = 0;
    let totalElapsedSeconds = 0;
    let plausibleHopsCount = 0;
    let suspiciousHopsCount = 0;
    let impossibleHopsCount = 0;
    let insufficientDataHopsCount = 0;

    for (let i = 1; i < groupedObservations.length; i++) {
      const origin = groupedObservations[i - 1];
      const destination = groupedObservations[i];

      const segment = await this.evaluateSegment(
        i,
        origin,
        destination,
        distanceProvider,
        config,
      );

      routeSegments.push(segment);

      if (segment.status === 'PLAUSIBLE') {
        plausibleHopsCount++;
      } else if (segment.status === 'SUSPICIOUS') {
        suspiciousHopsCount++;
        anomalies.push({
          segment_index: segment.segment_index,
          from_camera: segment.from_camera_name,
          to_camera: segment.to_camera_name,
          status: segment.status,
          reason: segment.reason,
          estimated_speed_kmh: segment.estimated_speed_kmh,
          elapsed_seconds: segment.elapsed_seconds,
          distance_meters: segment.distance_meters,
        });
      } else if (segment.status === 'IMPOSSIBLE') {
        impossibleHopsCount++;
        anomalies.push({
          segment_index: segment.segment_index,
          from_camera: segment.from_camera_name,
          to_camera: segment.to_camera_name,
          status: segment.status,
          reason: segment.reason,
          estimated_speed_kmh: segment.estimated_speed_kmh,
          elapsed_seconds: segment.elapsed_seconds,
          distance_meters: segment.distance_meters,
        });
      } else if (segment.status === 'INSUFFICIENT_DATA') {
        insufficientDataHopsCount++;
        anomalies.push({
          segment_index: segment.segment_index,
          from_camera: segment.from_camera_name,
          to_camera: segment.to_camera_name,
          status: segment.status,
          reason: segment.reason,
        });
      }

      totalDistanceMeters += segment.distance_meters;
      totalElapsedSeconds += Math.max(0, segment.elapsed_seconds);
    }

    const hopsCount = routeSegments.length;
    const routePlausibilityScore =
      hopsCount > 0
        ? Number(((plausibleHopsCount + suspiciousHopsCount * 0.5) / hopsCount).toFixed(4))
        : 1.0;

    // Average speed over non-zero elapsed segments
    const averageSpeedKmh =
      totalElapsedSeconds > 0 && totalDistanceMeters > 0
        ? Math.round(((totalDistanceMeters / 1000) / (totalElapsedSeconds / 3600)) * 100) / 100
        : 0.0;

    // Deterministic route confidence score based on segment confidences and data sufficiency
    const routeConfidence =
      hopsCount > 0
        ? Number(
            (
              routeSegments.reduce((sum, s) => sum + s.confidence, 0) /
              hopsCount
            ).toFixed(4),
          )
        : 1.0;

    const summary: RouteIntelligenceSummary = {
      total_distance_meters: Math.round(totalDistanceMeters * 100) / 100,
      total_elapsed_seconds: totalElapsedSeconds,
      average_speed_kmh: averageSpeedKmh,
      hops_count: hopsCount,
      plausible_hops_count: plausibleHopsCount,
      suspicious_hops_count: suspiciousHopsCount,
      impossible_hops_count: impossibleHopsCount,
      insufficient_data_hops_count: insufficientDataHopsCount,
      route_plausibility_score: routePlausibilityScore,
      route_confidence: routeConfidence,
    };

    return {
      plate_normalized: plateNormalized,
      total_sightings: rawSightings.length,
      grouped_observations_count: groupedObservations.length,
      cities,
      route_plausibility_score: routePlausibilityScore,
      route_confidence: routeConfidence,
      route_segments: routeSegments,
      summary,
      anomalies,
      disclaimer:
        'Observed camera-to-camera movement based on geodesic distance between discrete sightings. Does not represent continuous GPS tracking or exact road driving trajectories.',
    };
  }

  /**
   * Sorts sightings chronologically by event capture timestamp.
   * Normalizes timestamps to Date objects.
   */
  private sortAndNormalizeSightings(sightings: RawSightingInput[]): RawSightingInput[] {
    return [...sightings].sort((a, b) => {
      const tA = new Date(a.timestamp).getTime();
      const tB = new Date(b.timestamp).getTime();
      return tA - tB;
    });
  }

  /**
   * Deduplicates rapid deliveries and groups observations occurring at the same camera
   * within `windowSeconds` to prevent false zero-distance movement artifacts.
   */
  private groupSameCameraObservations(
    sightings: RawSightingInput[],
    windowSeconds: number,
  ): RawSightingInput[] {
    if (sightings.length <= 1) return sightings;

    const grouped: RawSightingInput[] = [];

    for (const sighting of sightings) {
      if (grouped.length === 0) {
        grouped.push(sighting);
        continue;
      }

      const prev = grouped[grouped.length - 1];
      const prevTime = new Date(prev.timestamp).getTime();
      const currTime = new Date(sighting.timestamp).getTime();
      const deltaSec = (currTime - prevTime) / 1000;

      // Duplicate delivery check (same camera, identical timestamp within 1s)
      if (prev.cameraId === sighting.cameraId && Math.abs(deltaSec) < 1) {
        // Keep the observation with higher OCR confidence/consensus
        if (sighting.confidence > prev.confidence) {
          grouped[grouped.length - 1] = sighting;
        }
        continue;
      }

      // Same-camera temporal grouping (vehicle observed repeatedly at same junction)
      if (prev.cameraId === sighting.cameraId && deltaSec <= windowSeconds) {
        // Update latest sighting timestamp and merge confidence
        grouped[grouped.length - 1] = {
          ...prev,
          timestamp: sighting.timestamp,
          confidence: Math.max(prev.confidence, sighting.confidence),
          consensusFrames: Math.max(prev.consensusFrames, sighting.consensusFrames),
        };
        continue;
      }

      grouped.push(sighting);
    }

    return grouped;
  }

  /**
   * Evaluates a single pairwise segment between two consecutive grouped camera observations.
   */
  private async evaluateSegment(
    index: number,
    origin: RawSightingInput,
    destination: RawSightingInput,
    distanceProvider: IRouteDistanceProvider,
    config: RoutePlausibilityConfig,
  ): Promise<RouteSegmentIntelligence> {
    const originTs = new Date(origin.timestamp);
    const destTs = new Date(destination.timestamp);

    // 1. Missing timestamp check
    if (isNaN(originTs.getTime()) || isNaN(destTs.getTime())) {
      return this.buildSegment(
        index,
        origin,
        destination,
        originTs,
        destTs,
        0,
        distanceProvider.distanceType,
        0,
        null,
        'INSUFFICIENT_DATA',
        'MISSING_TIMESTAMP: One or both sighting timestamps could not be parsed',
        0.1,
      );
    }

    const elapsedSeconds = Math.round((destTs.getTime() - originTs.getTime()) / 1000);

    // 2. Missing coordinates check
    if (!origin.coordinates || !destination.coordinates) {
      return this.buildSegment(
        index,
        origin,
        destination,
        originTs,
        destTs,
        0,
        distanceProvider.distanceType,
        elapsedSeconds,
        null,
        'INSUFFICIENT_DATA',
        'MISSING_COORDINATES: Geographic coordinates missing on camera',
        0.1,
      );
    }

    // 3. Chronology check
    if (elapsedSeconds < 0) {
      return this.buildSegment(
        index,
        origin,
        destination,
        originTs,
        destTs,
        0,
        distanceProvider.distanceType,
        elapsedSeconds,
        null,
        'IMPOSSIBLE',
        `CHRONOLOGY_REVERSAL: Destination observation occurred before origin (${elapsedSeconds}s delta)`,
        0.0,
      );
    }

    // 4. Calculate Distance via Provider
    const distanceResult = await distanceProvider.getDistance(
      { ...origin.coordinates, cameraId: origin.cameraId },
      { ...destination.coordinates, cameraId: destination.cameraId },
    );

    if (!distanceResult) {
      return this.buildSegment(
        index,
        origin,
        destination,
        originTs,
        destTs,
        0,
        distanceProvider.distanceType,
        elapsedSeconds,
        null,
        'INSUFFICIENT_DATA',
        'UNRESOLVABLE_DISTANCE: Distance provider unable to compute spatial separation',
        0.1,
      );
    }

    const distanceMeters = distanceResult.distanceMeters;

    // 5. Zero elapsed time handling
    if (elapsedSeconds === 0) {
      if (distanceMeters > config.minCameraSeparationMeters) {
        return this.buildSegment(
          index,
          origin,
          destination,
          originTs,
          destTs,
          distanceMeters,
          distanceResult.distanceType,
          0,
          null,
          'IMPOSSIBLE',
          `SIMULTANEOUS_DISTANT_OBSERVATIONS: Observed simultaneously across distant junctions (${distanceMeters}m apart with 0s elapsed)`,
          0.0,
        );
      } else {
        return this.buildSegment(
          index,
          origin,
          destination,
          originTs,
          destTs,
          distanceMeters,
          distanceResult.distanceType,
          0,
          0.0,
          'PLAUSIBLE',
          'SAME_JUNCTION_OBSERVATION: Repeated observation at identical camera junction',
          0.9,
        );
      }
    }

    // 6. Velocity Calculation (km/h)
    // distance_km / time_hours = (meters / 1000) / (seconds / 3600)
    const estimatedSpeedKmh =
      Math.round(((distanceMeters / 1000) / (elapsedSeconds / 3600)) * 100) / 100;

    // 7. Plausibility Evaluation Rules
    let status: RouteStatus = 'PLAUSIBLE';
    let reason = '';
    let plausibilityWeight = 1.0;

    if (
      distanceMeters > config.minCameraSeparationMeters &&
      elapsedSeconds < config.minTransitTimeSeconds
    ) {
      status = 'IMPOSSIBLE';
      reason = `TRANSIT_TIME_TOO_SHORT: Observed transit time of ${elapsedSeconds}s over ${distanceMeters}m is below minimum physical threshold (${config.minTransitTimeSeconds}s)`;
      plausibilityWeight = 0.0;
    } else if (estimatedSpeedKmh > config.impossibleSpeedThresholdKmh) {
      status = 'IMPOSSIBLE';
      reason = `UNREALISTIC_HIGH_VELOCITY: Implied average speed of ${estimatedSpeedKmh} km/h exceeds maximum physical land transit threshold (${config.impossibleSpeedThresholdKmh} km/h)`;
      plausibilityWeight = 0.0;
    } else if (estimatedSpeedKmh > config.suspiciousSpeedThresholdKmh) {
      status = 'SUSPICIOUS';
      reason = `UNUSUALLY_HIGH_VELOCITY: Implied average speed of ${estimatedSpeedKmh} km/h exceeds expected road transit threshold (${config.suspiciousSpeedThresholdKmh} km/h)`;
      plausibilityWeight = 0.5;
    } else if (elapsedSeconds > config.maxCorrelationWindowHours * 3600) {
      status = 'PLAUSIBLE';
      reason = `EXCESSIVE_TIME_GAP: Observed transit elapsed time (${Math.round(elapsedSeconds / 3600)}h) exceeds standard correlation window (${config.maxCorrelationWindowHours}h)`;
      plausibilityWeight = 0.8;
    } else {
      status = 'PLAUSIBLE';
      reason = `EXPECTED_TRANSIT_VELOCITY: Plausible average speed of ${estimatedSpeedKmh} km/h over ${distanceMeters}m (${elapsedSeconds}s elapsed)`;
      plausibilityWeight = 1.0;
    }

    // Deterministic segment confidence
    const segmentConfidence = Number(
      Math.min(
        Number(origin.confidence) || 0.9,
        Number(destination.confidence) || 0.9,
        plausibilityWeight,
      ).toFixed(4),
    );

    return this.buildSegment(
      index,
      origin,
      destination,
      originTs,
      destTs,
      distanceMeters,
      distanceResult.distanceType,
      elapsedSeconds,
      estimatedSpeedKmh,
      status,
      reason,
      segmentConfidence,
    );
  }

  private buildSegment(
    index: number,
    origin: RawSightingInput,
    destination: RawSightingInput,
    originTs: Date,
    destTs: Date,
    distanceMeters: number,
    distanceType: 'GEODESIC' | 'ROAD_NETWORK',
    elapsedSeconds: number,
    estimatedSpeedKmh: number | null,
    status: RouteStatus,
    reason: string,
    confidence: number,
  ): RouteSegmentIntelligence {
    // Legacy compatibility mapping
    const isPlausible = status === 'PLAUSIBLE';
    const legacyPlausibilityStatus =
      status === 'PLAUSIBLE'
        ? elapsedSeconds === 0 || distanceMeters === 0
          ? 'STATIONARY_OR_REPEAT_SIGHTING'
          : 'PLAUSIBLE'
        : status === 'SUSPICIOUS'
        ? 'REQUIRES_REVIEW'
        : status === 'IMPOSSIBLE'
        ? 'IMPLAUSIBLE'
        : 'REQUIRES_REVIEW';

    return {
      segment_index: index,
      from_camera_id: origin.cameraId,
      from_camera_name: origin.cameraName,
      from_city: origin.city,
      from_coordinates: origin.coordinates,
      from_timestamp: originTs,
      to_camera_id: destination.cameraId,
      to_camera_name: destination.cameraName,
      to_city: destination.city,
      to_coordinates: destination.coordinates,
      to_timestamp: destTs,
      distance_meters: distanceMeters,
      distance_type: distanceType,
      elapsed_seconds: elapsedSeconds,
      estimated_speed_kmh: estimatedSpeedKmh,
      status,
      reason,
      confidence,
      // Legacy backwards-compatibility
      is_plausible: isPlausible,
      plausibility_status: legacyPlausibilityStatus,
      plausibility_reason: reason,
      segment_confidence: confidence,
    };
  }

  private emptyResult(plateNormalized: string): RouteIntelligenceResult {
    return {
      plate_normalized: plateNormalized,
      total_sightings: 0,
      grouped_observations_count: 0,
      cities: [],
      route_plausibility_score: 1.0,
      route_confidence: 1.0,
      route_segments: [],
      summary: {
        total_distance_meters: 0,
        total_elapsed_seconds: 0,
        average_speed_kmh: 0,
        hops_count: 0,
        plausible_hops_count: 0,
        suspicious_hops_count: 0,
        impossible_hops_count: 0,
        insufficient_data_hops_count: 0,
        route_plausibility_score: 1.0,
        route_confidence: 1.0,
      },
      anomalies: [],
      disclaimer:
        'Observed camera-to-camera movement based on geodesic distance between discrete sightings. Does not represent continuous GPS tracking or exact road driving trajectories.',
    };
  }
}
