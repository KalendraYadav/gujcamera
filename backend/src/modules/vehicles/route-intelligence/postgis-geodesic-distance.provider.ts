// ==============================================================================
// PostGIS Geodesic Distance Provider & Bounded Cache (Phase 7)
// NETRAVA Unified CCTV Intelligence Platform
// ==============================================================================

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RouteCoordinates } from './route-intelligence.types';
import {
  IRouteDistanceProvider,
  DistanceResult,
} from './route-distance-provider.interface';

/**
 * Injection token for the optional PostGIS cache size configuration.
 * When not provided via DI, the provider defaults to 10,000 entries.
 */
export const POSTGIS_CACHE_MAX_ENTRIES_TOKEN = 'POSTGIS_CACHE_MAX_ENTRIES';

/**
 * Bounded Pairwise Distance Cache with FIFO eviction policy.
 * Normalizes camera pairs symmetrically (A-B == B-A) to maximize cache hit rates.
 */
export class BoundedDistanceCache {
  private readonly cache = new Map<string, number>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxEntries: number = 10000) {}

  generateKey(idA: string, idB: string): string {
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  }

  generateCoordKey(c1: RouteCoordinates, c2: RouteCoordinates): string {
    const k1 = `${c1.lat.toFixed(5)},${c1.long.toFixed(5)}`;
    const k2 = `${c2.lat.toFixed(5)},${c2.long.toFixed(5)}`;
    return k1 < k2 ? `${k1}:${k2}` : `${k2}:${k1}`;
  }

  get(key: string): number | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      this.hits++;
    } else {
      this.misses++;
    }
    return val;
  }

  set(key: string, distanceMeters: number): void {
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      // Evict oldest entry (FIFO)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, distanceMeters);
  }

  get size(): number {
    return this.cache.size;
  }

  get stats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Number((this.hits / total).toFixed(4)) : 0.0,
    };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

@Injectable()
export class PostGisGeodesicDistanceProvider implements IRouteDistanceProvider {
  private readonly logger = new Logger(PostGisGeodesicDistanceProvider.name);
  readonly providerName = 'PostGisGeodesicDistanceProvider';
  readonly distanceType = 'GEODESIC';

  private readonly cache: BoundedDistanceCache;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(POSTGIS_CACHE_MAX_ENTRIES_TOKEN) maxCacheEntries?: number,
  ) {
    this.cache = new BoundedDistanceCache(maxCacheEntries ?? 10000);
  }

  /**
   * Access cache telemetry for diagnostics and performance audits
   */
  getCacheStats() {
    return this.cache.stats;
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Calculates geodesic distance between two camera coordinates using PostGIS geography.
   * Leverages bounded symmetric cache to avoid duplicate spatial queries.
   */
  async getDistance(
    origin: RouteCoordinates & { cameraId?: string },
    destination: RouteCoordinates & { cameraId?: string },
  ): Promise<DistanceResult | null> {
    if (!this.isValidCoordinate(origin) || !this.isValidCoordinate(destination)) {
      return null;
    }

    // Zero distance check for identical coordinates or same camera
    if (
      (origin.cameraId && destination.cameraId && origin.cameraId === destination.cameraId) ||
      (origin.lat === destination.lat && origin.long === destination.long)
    ) {
      return {
        distanceMeters: 0.0,
        distanceType: this.distanceType,
        provider: this.providerName,
      };
    }

    // Check bounded symmetric cache
    const cacheKey =
      origin.cameraId && destination.cameraId
        ? this.cache.generateKey(origin.cameraId, destination.cameraId)
        : this.cache.generateCoordKey(origin, destination);

    const cachedDistance = this.cache.get(cacheKey);
    if (cachedDistance !== undefined) {
      return {
        distanceMeters: cachedDistance,
        distanceType: this.distanceType,
        provider: this.providerName,
      };
    }

    let calculatedDistance: number;

    try {
      if (this.prisma && typeof (this.prisma as any).$queryRaw === 'function') {
        const queryRes: Array<{ distance_meters: number | string }> = await this.prisma.$queryRaw`
          SELECT ROUND(ST_Distance(
            ST_SetSRID(ST_MakePoint(${origin.long}::float, ${origin.lat}::float), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${destination.long}::float, ${destination.lat}::float), 4326)::geography
          )::numeric, 2) AS distance_meters
        `;

        if (queryRes && queryRes.length > 0 && queryRes[0].distance_meters !== null) {
          calculatedDistance = Number(queryRes[0].distance_meters);
        } else {
          calculatedDistance = this.calculateHaversineMeters(origin, destination);
        }
      } else {
        calculatedDistance = this.calculateHaversineMeters(origin, destination);
      }
    } catch (err: any) {
      this.logger.warn(`PostGIS ST_Distance query failed, falling back to Haversine: ${err.message}`);
      calculatedDistance = this.calculateHaversineMeters(origin, destination);
    }

    this.cache.set(cacheKey, calculatedDistance);

    return {
      distanceMeters: calculatedDistance,
      distanceType: this.distanceType,
      provider: this.providerName,
    };
  }

  private isValidCoordinate(coord: RouteCoordinates | null | undefined): boolean {
    if (!coord) return false;
    const lat = Number(coord.lat);
    const long = Number(coord.long);
    return (
      !isNaN(lat) &&
      !isNaN(long) &&
      lat >= -90 &&
      lat <= 90 &&
      long >= -180 &&
      long <= 180 &&
      !(lat === 0 && long === 0)
    );
  }

  /**
   * High-precision Haversine formula fallback
   */
  private calculateHaversineMeters(c1: RouteCoordinates, c2: RouteCoordinates): number {
    const R = 6371000; // Earth's mean radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(c2.lat - c1.lat);
    const dLong = toRad(c2.long - c1.long);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(c1.lat)) * Math.cos(toRad(c2.lat)) * Math.sin(dLong / 2) * Math.sin(dLong / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }
}
