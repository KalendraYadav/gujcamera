// ==============================================================================
// Route Intelligence Engine & Provider Unit Test Suite (Phase 7)
// NETRAVAHA Unified CCTV Intelligence Platform
// ==============================================================================

import {
  RouteIntelligenceEngine,
  PostGisGeodesicDistanceProvider,
  BoundedDistanceCache,
  RawSightingInput,
  IRouteDistanceProvider,
} from './index';

describe('Route Intelligence Engine & Spatio-Temporal Correlation (Phase 7)', () => {
  let engine: RouteIntelligenceEngine;
  let mockDistanceProvider: IRouteDistanceProvider;

  beforeEach(() => {
    engine = new RouteIntelligenceEngine();
    mockDistanceProvider = {
      providerName: 'MockDistanceProvider',
      distanceType: 'GEODESIC',
      getDistance: jest.fn().mockImplementation(async (origin, destination) => {
        // Return 0 if same camera or same coordinates
        if (origin.cameraId === destination.cameraId) {
          return { distanceMeters: 0, distanceType: 'GEODESIC', provider: 'MockDistanceProvider' };
        }
        // Known test distances
        if (origin.cameraId === 'CAM-AHM-01' && destination.cameraId === 'CAM-AHM-02') {
          return { distanceMeters: 5800, distanceType: 'GEODESIC', provider: 'MockDistanceProvider' };
        }
        if (origin.cameraId === 'CAM-AHM-02' && destination.cameraId === 'CAM-GND-01') {
          return { distanceMeters: 19400, distanceType: 'GEODESIC', provider: 'MockDistanceProvider' };
        }
        if (origin.cameraId === 'CAM-A' && destination.cameraId === 'CAM-B') {
          return { distanceMeters: 10000, distanceType: 'GEODESIC', provider: 'MockDistanceProvider' };
        }
        return { distanceMeters: 5000, distanceType: 'GEODESIC', provider: 'MockDistanceProvider' };
      }),
    };
  });

  // Scenario A: Plausible Multi-Camera Urban & Inter-City Route
  it('Scenario A: should construct plausible two-camera and cross-city segments', async () => {
    const sightings: RawSightingInput[] = [
      {
        id: 's1',
        timestamp: new Date('2026-10-03T10:00:00Z'),
        cameraId: 'CAM-AHM-01',
        cameraName: 'CAM-AHM-01',
        city: 'Ahmedabad',
        coordinates: { lat: 23.0225, long: 72.5714 },
        confidence: 0.95,
        consensusFrames: 5,
      },
      {
        id: 's2',
        timestamp: new Date('2026-10-03T10:10:00Z'), // +10 mins (600s), 5.8 km -> 34.8 km/h
        cameraId: 'CAM-AHM-02',
        cameraName: 'CAM-AHM-02',
        city: 'Ahmedabad',
        coordinates: { lat: 23.0734, long: 72.5262 },
        confidence: 0.92,
        consensusFrames: 5,
      },
      {
        id: 's3',
        timestamp: new Date('2026-10-03T10:25:00Z'), // +15 mins (900s), 19.4 km -> 77.6 km/h
        cameraId: 'CAM-GND-01',
        cameraName: 'CAM-GND-01',
        city: 'Gandhinagar',
        coordinates: { lat: 23.2384, long: 72.6391 },
        confidence: 0.94,
        consensusFrames: 5,
      },
    ];

    const result = await engine.computeRouteIntelligence('GJ01AB1234', sightings, mockDistanceProvider);

    expect(result.plate_normalized).toBe('GJ01AB1234');
    expect(result.total_sightings).toBe(3);
    expect(result.cities).toEqual(expect.arrayContaining(['Ahmedabad', 'Gandhinagar']));
    expect(result.route_segments).toHaveLength(2);

    // Segment 1: Ahmedabad urban transit
    const seg1 = result.route_segments[0];
    expect(seg1.from_camera_name).toBe('CAM-AHM-01');
    expect(seg1.to_camera_name).toBe('CAM-AHM-02');
    expect(seg1.distance_meters).toBe(5800);
    expect(seg1.elapsed_seconds).toBe(600);
    expect(seg1.estimated_speed_kmh).toBe(34.8);
    expect(seg1.status).toBe('PLAUSIBLE');
    expect(seg1.is_plausible).toBe(true);

    // Segment 2: Ahmedabad -> Gandhinagar highway transit
    const seg2 = result.route_segments[1];
    expect(seg2.from_city).toBe('Ahmedabad');
    expect(seg2.to_city).toBe('Gandhinagar');
    expect(seg2.distance_meters).toBe(19400);
    expect(seg2.elapsed_seconds).toBe(900);
    expect(seg2.estimated_speed_kmh).toBe(77.6);
    expect(seg2.status).toBe('PLAUSIBLE');

    expect(result.route_plausibility_score).toBe(1.0);
    expect(result.anomalies).toHaveLength(0);
    expect(result.disclaimer).toContain('Observed camera-to-camera movement');
  });

  // Scenario B: Impossible Speed / Transit Time
  it('Scenario B: should flag physically impossible transit speed as IMPOSSIBLE', async () => {
    const sightings: RawSightingInput[] = [
      {
        id: 's1',
        timestamp: new Date('2026-10-03T10:00:00Z'),
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.95,
        consensusFrames: 5,
      },
      {
        id: 's2',
        timestamp: new Date('2026-10-03T10:01:00Z'), // 1 min (60s) for 10 km -> 600 km/h
        cameraId: 'CAM-B',
        cameraName: 'CAM-B',
        coordinates: { lat: 23.1, long: 72.1 },
        confidence: 0.95,
        consensusFrames: 5,
      },
    ];

    const result = await engine.computeRouteIntelligence('GJ01AB1234', sightings, mockDistanceProvider);

    expect(result.route_segments).toHaveLength(1);
    const seg = result.route_segments[0];
    expect(seg.status).toBe('IMPOSSIBLE');
    expect(seg.is_plausible).toBe(false);
    expect(seg.estimated_speed_kmh).toBe(600);
    expect(seg.reason).toContain('UNREALISTIC_HIGH_VELOCITY');

    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].status).toBe('IMPOSSIBLE');
    expect(result.anomalies[0].reason).toContain('UNREALISTIC_HIGH_VELOCITY');
    expect(result.route_plausibility_score).toBe(0.0);
  });

  // Scenario C: Same Camera Multiple Observations (Grouping)
  it('Scenario C: should group consecutive observations at same camera within grouping window', async () => {
    const sightings: RawSightingInput[] = [
      {
        id: 's1',
        timestamp: new Date('2026-10-03T10:00:01Z'),
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.90,
        consensusFrames: 3,
      },
      {
        id: 's2',
        timestamp: new Date('2026-10-03T10:00:04Z'), // 3s later at same camera
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.95,
        consensusFrames: 5,
      },
      {
        id: 's3',
        timestamp: new Date('2026-10-03T10:00:08Z'), // 4s later at same camera
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.93,
        consensusFrames: 4,
      },
    ];

    const result = await engine.computeRouteIntelligence('GJ01AB1234', sightings, mockDistanceProvider);

    // Raw sightings count is preserved for evidence audit
    expect(result.total_sightings).toBe(3);
    // Grouped observations count collapsed to 1 camera observation
    expect(result.grouped_observations_count).toBe(1);
    // No false 0-distance movement segments generated
    expect(result.route_segments).toHaveLength(0);
    expect(result.anomalies).toHaveLength(0);
  });

  // Scenario D: Out-of-Order Event Arrival
  it('Scenario D: should chronologically reconstruct out-of-order sightings by capture timestamp', async () => {
    const sightings: RawSightingInput[] = [
      {
        id: 's3',
        timestamp: new Date('2026-10-03T10:25:00Z'), // Arrived first in Redis
        cameraId: 'CAM-GND-01',
        cameraName: 'CAM-GND-01',
        coordinates: { lat: 23.2384, long: 72.6391 },
        confidence: 0.94,
        consensusFrames: 5,
      },
      {
        id: 's1',
        timestamp: new Date('2026-10-03T10:00:00Z'), // Arrived second in Redis
        cameraId: 'CAM-AHM-01',
        cameraName: 'CAM-AHM-01',
        coordinates: { lat: 23.0225, long: 72.5714 },
        confidence: 0.95,
        consensusFrames: 5,
      },
      {
        id: 's2',
        timestamp: new Date('2026-10-03T10:10:00Z'), // Arrived third in Redis
        cameraId: 'CAM-AHM-02',
        cameraName: 'CAM-AHM-02',
        coordinates: { lat: 23.0734, long: 72.5262 },
        confidence: 0.92,
        consensusFrames: 5,
      },
    ];

    const result = await engine.computeRouteIntelligence('GJ01AB1234', sightings, mockDistanceProvider);

    expect(result.route_segments).toHaveLength(2);
    // Verified proper chronological order: AHM-01 -> AHM-02 -> GND-01
    expect(result.route_segments[0].from_camera_name).toBe('CAM-AHM-01');
    expect(result.route_segments[0].to_camera_name).toBe('CAM-AHM-02');
    expect(result.route_segments[1].from_camera_name).toBe('CAM-AHM-02');
    expect(result.route_segments[1].to_camera_name).toBe('CAM-GND-01');
  });

  // Scenario E: Missing Coordinates
  it('Scenario E: should mark segment as INSUFFICIENT_DATA when camera coordinates are missing', async () => {
    const sightings: RawSightingInput[] = [
      {
        id: 's1',
        timestamp: new Date('2026-10-03T10:00:00Z'),
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: null, // Missing coordinates
        confidence: 0.90,
        consensusFrames: 3,
      },
      {
        id: 's2',
        timestamp: new Date('2026-10-03T10:10:00Z'),
        cameraId: 'CAM-B',
        cameraName: 'CAM-B',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.90,
        consensusFrames: 3,
      },
    ];

    const result = await engine.computeRouteIntelligence('GJ01AB1234', sightings, mockDistanceProvider);

    expect(result.route_segments).toHaveLength(1);
    expect(result.route_segments[0].status).toBe('INSUFFICIENT_DATA');
    expect(result.route_segments[0].reason).toContain('MISSING_COORDINATES');
    expect(result.anomalies[0].status).toBe('INSUFFICIENT_DATA');
  });

  // Scenario F: Duplicate Sighting Delivery
  it('Scenario F: should deduplicate rapid identical deliveries from message retries', async () => {
    const sightings: RawSightingInput[] = [
      {
        id: 's1-dup1',
        timestamp: new Date('2026-10-03T10:00:00Z'),
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.88,
        consensusFrames: 3,
      },
      {
        id: 's1-dup2', // Duplicate delivery of same frame
        timestamp: new Date('2026-10-03T10:00:00Z'),
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.96, // Higher confidence delivery
        consensusFrames: 5,
      },
    ];

    const result = await engine.computeRouteIntelligence('GJ01AB1234', sightings, mockDistanceProvider);

    expect(result.grouped_observations_count).toBe(1);
    expect(result.route_segments).toHaveLength(0);
  });

  // Suspicious Velocity Detection
  it('should flag unusually high highway velocity as SUSPICIOUS', async () => {
    const sightings: RawSightingInput[] = [
      {
        id: 's1',
        timestamp: new Date('2026-10-03T10:00:00Z'),
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.95,
        consensusFrames: 5,
      },
      {
        id: 's2',
        timestamp: new Date('2026-10-03T10:03:30Z'), // 210s for 10 km -> 171.4 km/h
        cameraId: 'CAM-B',
        cameraName: 'CAM-B',
        coordinates: { lat: 23.1, long: 72.1 },
        confidence: 0.95,
        consensusFrames: 5,
      },
    ];

    const result = await engine.computeRouteIntelligence('GJ01AB1234', sightings, mockDistanceProvider);

    expect(result.route_segments).toHaveLength(1);
    const seg = result.route_segments[0];
    expect(seg.status).toBe('SUSPICIOUS');
    expect(seg.estimated_speed_kmh).toBeCloseTo(171.4, 0);
    expect(seg.reason).toContain('UNUSUALLY_HIGH_VELOCITY');
    expect(result.summary.suspicious_hops_count).toBe(1);
  });

  // Zero Elapsed Time Between Distant Cameras
  it('should flag simultaneous sightings across distant cameras as IMPOSSIBLE', async () => {
    const sightings: RawSightingInput[] = [
      {
        id: 's1',
        timestamp: new Date('2026-10-03T10:00:00Z'),
        cameraId: 'CAM-A',
        cameraName: 'CAM-A',
        coordinates: { lat: 23.0, long: 72.0 },
        confidence: 0.95,
        consensusFrames: 5,
      },
      {
        id: 's2',
        timestamp: new Date('2026-10-03T10:00:00Z'), // Identical timestamp across different cameras
        cameraId: 'CAM-B',
        cameraName: 'CAM-B',
        coordinates: { lat: 23.1, long: 72.1 },
        confidence: 0.95,
        consensusFrames: 5,
      },
    ];

    const result = await engine.computeRouteIntelligence('GJ01AB1234', sightings, mockDistanceProvider);

    expect(result.route_segments).toHaveLength(1);
    expect(result.route_segments[0].status).toBe('IMPOSSIBLE');
    expect(result.route_segments[0].reason).toContain('SIMULTANEOUS_DISTANT_OBSERVATIONS');
  });

  // Bounded Distance Cache Validation
  describe('BoundedDistanceCache', () => {
    it('should manage symmetric keys and evict oldest entry on overflow (FIFO)', () => {
      const cache = new BoundedDistanceCache(2); // Max capacity of 2

      cache.set(cache.generateKey('CAM-1', 'CAM-2'), 5000);
      cache.set(cache.generateKey('CAM-2', 'CAM-3'), 8000);

      // Verify symmetric lookup: (CAM-2, CAM-1) accesses (CAM-1, CAM-2)
      const distSym = cache.get(cache.generateKey('CAM-2', 'CAM-1'));
      expect(distSym).toBe(5000);

      // Add third entry to force FIFO eviction of first
      cache.set(cache.generateKey('CAM-3', 'CAM-4'), 12000);

      expect(cache.size).toBe(2);
      expect(cache.stats.maxEntries).toBe(2);
      expect(cache.get(cache.generateKey('CAM-1', 'CAM-2'))).toBeUndefined(); // Evicted
      expect(cache.get(cache.generateKey('CAM-3', 'CAM-4'))).toBe(12000); // Present
    });
  });

  // PostGisGeodesicDistanceProvider Haversine Fallback
  describe('PostGisGeodesicDistanceProvider', () => {
    it('should calculate geodesic distance accurately via Haversine fallback', async () => {
      const mockPrisma: any = { $queryRaw: jest.fn().mockRejectedValue(new Error('Connection offline')) };
      const provider = new PostGisGeodesicDistanceProvider(mockPrisma, 100);

      // Coordinates ~5.8 km apart in Ahmedabad
      const origin = { lat: 23.0225, long: 72.5714, cameraId: 'CAM-AHM-01' };
      const dest = { lat: 23.0734, long: 72.5262, cameraId: 'CAM-AHM-02' };

      const res = await provider.getDistance(origin, dest);

      expect(res).not.toBeNull();
      expect(res?.distanceType).toBe('GEODESIC');
      // Haversine calculation between these coordinates is ~7.3 km
      expect(res?.distanceMeters).toBeGreaterThan(6000);
      expect(res?.distanceMeters).toBeLessThan(8000);

      // Cache stats should record 1 miss and 1 set
      expect(provider.getCacheStats().size).toBe(1);

      // Second call should hit the bounded cache
      const cachedRes = await provider.getDistance(dest, origin); // Symmetric
      expect(cachedRes?.distanceMeters).toBe(res?.distanceMeters);
      expect(provider.getCacheStats().hits).toBe(1);
    });
  });
});
