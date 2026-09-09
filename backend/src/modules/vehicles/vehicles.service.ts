import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { VehicleQueryDto } from './dto/vehicle-query.dto';
import { SightingQueryDto } from './dto/sighting-query.dto';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { normalizeLicensePlate } from './utils/plate-normalizer';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search vehicles by normalized plate or prefix, last-seen time range, with pagination
   */
  async searchVehicles(query: VehicleQueryDto, user: AuthenticatedUser, requestId?: string) {
    const limit = query.limit || 20;
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const rawQuery = query.resolvedSearchQuery;
    const searchNormalized = rawQuery ? normalizeLicensePlate(rawQuery) : undefined;

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid from timestamp format',
      });
    }

    if (toDate && isNaN(toDate.getTime())) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid to timestamp format',
      });
    }

    const where: Prisma.VehicleWhereInput = {};

    if (searchNormalized) {
      where.plateNormalized = {
        contains: searchNormalized,
        mode: 'insensitive',
      };
    }

    if (fromDate || toDate) {
      where.lastSeen = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }

    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        take: limit,
        skip,
        orderBy: { lastSeen: 'desc' },
        include: {
          _count: {
            select: { sightings: true },
          },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    // Check if any returned plates are currently on active watchlists
    const plates = vehicles.map((v) => v.plateNormalized);
    const activeWatchlistEntries = await this.prisma.watchlistEntry.findMany({
      where: {
        plateNormalized: { in: plates },
        active: true,
      },
      select: { plateNormalized: true, category: true, priority: true },
    });
    const watchlistMap = new Map(activeWatchlistEntries.map((w) => [w.plateNormalized, w]));

    const mappedVehicles = vehicles.map((v) => {
      const watchlistInfo = watchlistMap.get(v.plateNormalized);
      return {
        plate_normalized: v.plateNormalized,
        first_seen: v.firstSeen,
        last_seen: v.lastSeen,
        attributes: v.attributes,
        total_sightings: v._count.sightings,
        is_watchlisted: !!watchlistInfo,
        watchlist_category: watchlistInfo?.category || null,
        watchlist_priority: watchlistInfo?.priority || null,
      };
    });

    // Synchronous investigative audit record
    await this.recordAuditLog(
      user.id,
      'VEHICLE_SEARCH',
      null,
      {
        search_query: searchNormalized || '*',
        results_count: mappedVehicles.length,
        total_matches: total,
      },
      requestId,
    );

    return {
      data: mappedVehicles,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Deep-dive single vehicle record with first/last observations and watchlist status
   */
  async findVehicleByPlate(plateOrId: string, user: AuthenticatedUser, requestId?: string) {
    const plate = normalizeLicensePlate(plateOrId);

    if (!plate) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid license plate parameter',
      });
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { plateNormalized: plate },
      include: {
        _count: { select: { sightings: true } },
      },
    });

    if (!vehicle) {
      throw new NotFoundException({
        error_code: 'VEHICLE_NOT_FOUND',
        message: `Vehicle with plate '${plate}' has not been observed by the system`,
      });
    }

    // Fetch first known sighting
    const firstSighting = await this.prisma.vehicleSighting.findFirst({
      where: { plateNormalized: plate },
      orderBy: { ts: 'asc' },
      include: {
        camera: {
          select: {
            id: true,
            name: true,
            location: { select: { address: true, zone: true, district: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Fetch latest known sighting
    const lastSighting = await this.prisma.vehicleSighting.findFirst({
      where: { plateNormalized: plate },
      orderBy: { ts: 'desc' },
      include: {
        camera: {
          select: {
            id: true,
            name: true,
            location: { select: { address: true, zone: true, district: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Check active watchlists
    const watchlistEntry = await this.prisma.watchlistEntry.findFirst({
      where: { plateNormalized: plate, active: true },
      select: { category: true, priority: true, reason: true, createdAt: true },
    });

    // Synchronous investigative audit record
    await this.recordAuditLog(
      user.id,
      'VEHICLE_DETAIL_VIEW',
      null,
      { plate_normalized: plate },
      requestId,
    );

    return {
      plate_normalized: vehicle.plateNormalized,
      first_seen: vehicle.firstSeen,
      last_seen: vehicle.lastSeen,
      attributes: vehicle.attributes,
      total_sightings: vehicle._count.sightings,
      is_watchlisted: !!watchlistEntry,
      watchlist_details: watchlistEntry
        ? {
            category: watchlistEntry.category,
            priority: watchlistEntry.priority,
            reason: watchlistEntry.reason,
            flagged_at: watchlistEntry.createdAt,
          }
        : null,
      first_known_sighting: firstSighting
        ? {
            id: firstSighting.id,
            timestamp: firstSighting.ts,
            camera_name: firstSighting.camera.name,
            location: firstSighting.camera.location?.address,
            district: firstSighting.camera.location?.district,
          }
        : null,
      last_known_sighting: lastSighting
        ? {
            id: lastSighting.id,
            timestamp: lastSighting.ts,
            camera_name: lastSighting.camera.name,
            location: lastSighting.camera.location?.address,
            district: lastSighting.camera.location?.district,
          }
        : null,
    };
  }

  /**
   * Get chronological sighting history for a vehicle with time, camera, and department filtering
   */
  async getVehicleSightings(plateOrId: string, query: SightingQueryDto, user: AuthenticatedUser, requestId?: string) {
    const plate = normalizeLicensePlate(plateOrId);

    if (!plate) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid license plate parameter',
      });
    }

    const vehicleExists = await this.prisma.vehicle.findUnique({
      where: { plateNormalized: plate },
    });

    if (!vehicleExists) {
      throw new NotFoundException({
        error_code: 'VEHICLE_NOT_FOUND',
        message: `Vehicle with plate '${plate}' has not been observed by the system`,
      });
    }

    const limit = query.limit || 20;
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;
    const cameraId = query.resolvedCameraId;
    const departmentId = query.resolvedDepartmentId;

    const where: Prisma.VehicleSightingWhereInput = {
      plateNormalized: plate,
      ...(fromDate && { ts: { gte: fromDate } }),
      ...(toDate && { ts: { ...(fromDate ? { gte: fromDate } : {}), lte: toDate } }),
      ...(cameraId && { cameraId }),
      ...(departmentId && { camera: { departmentId } }),
    };

    const [sightings, total] = await Promise.all([
      this.prisma.vehicleSighting.findMany({
        where,
        take: limit,
        skip,
        orderBy: { ts: query.sort || 'asc' },
        include: {
          camera: {
            select: {
              id: true,
              name: true,
              departmentId: true,
              lat: true,
              long: true,
              operationalStatus: true,
              location: {
                select: {
                  address: true,
                  zone: true,
                  district: true,
                },
              },
              department: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.vehicleSighting.count({ where }),
    ]);

    const mappedSightings = sightings.map((s) => ({
      id: s.id,
      plate_normalized: s.plateNormalized,
      timestamp: s.ts,
      confidence: Number(s.confidence),
      consensus_frames: s.consensusOf,
      frame_ref: s.frameRef,
      camera_id: s.cameraId,
      camera_name: s.camera.name,
      department_id: s.camera.departmentId,
      department_name: s.camera.department?.name,
      coordinates: {
        lat: Number(s.camera.lat),
        long: Number(s.camera.long),
      },
      location: s.camera.location
        ? {
            address: s.camera.location.address,
            zone: s.camera.location.zone,
            district: s.camera.location.district,
          }
        : null,
    }));

    // Synchronous investigative audit record
    await this.recordAuditLog(
      user.id,
      'VEHICLE_SIGHTINGS_VIEW',
      null,
      {
        plate_normalized: plate,
        sightings_returned: mappedSightings.length,
        total_available: total,
      },
      requestId,
    );

    return {
      plate_normalized: plate,
      data: mappedSightings,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Spatio-temporal route reconstruction between consecutive camera sightings
   * Calculates real geographic distance (meters) via PostGIS geography, elapsed time (seconds),
   * implied velocity (km/h), plausibility score, and confidence.
   */
  async getVehicleTimeline(plateOrId: string, query: TimelineQueryDto, user: AuthenticatedUser, requestId?: string) {
    const plate = normalizeLicensePlate(plateOrId);

    if (!plate) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid license plate parameter',
      });
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { plateNormalized: plate },
    });

    if (!vehicle) {
      throw new NotFoundException({
        error_code: 'VEHICLE_NOT_FOUND',
        message: `Vehicle with plate '${plate}' has not been observed by the system`,
      });
    }

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;
    const maxPlausibleSpeedKmh = query.max_speed_kmh || 150;

    const sightings = await this.prisma.vehicleSighting.findMany({
      where: {
        plateNormalized: plate,
        ...(fromDate && { ts: { gte: fromDate } }),
        ...(toDate && { ts: { ...(fromDate ? { gte: fromDate } : {}), lte: toDate } }),
      },
      orderBy: { ts: 'asc' }, // Strict chronological order required for trajectory reconstruction
      include: {
        camera: {
          select: {
            id: true,
            name: true,
            lat: true,
            long: true,
            location: {
              select: {
                address: true,
                zone: true,
                district: true,
              },
            },
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (sightings.length === 0) {
      return {
        plate_normalized: plate,
        total_sightings: 0,
        route_plausibility_score: 1.0,
        sightings: [],
        route_segments: [],
        summary: {
          total_distance_meters: 0,
          total_elapsed_seconds: 0,
          average_speed_kmh: 0,
          hops_count: 0,
          implausible_hops_count: 0,
        },
        disclaimer: 'Observed movement between camera observations; does not represent an exact physical driving route or turn-by-turn navigation.',
      };
    }

    // Format individual sightings
    const formattedSightings = sightings.map((s) => ({
      id: s.id,
      timestamp: s.ts,
      camera_id: s.cameraId,
      camera_name: s.camera.name,
      department_name: s.camera.department?.name,
      coordinates: {
        lat: Number(s.camera.lat),
        long: Number(s.camera.long),
      },
      location: s.camera.location
        ? {
            address: s.camera.location.address,
            zone: s.camera.location.zone,
            district: s.camera.location.district,
          }
        : null,
      confidence: Number(s.confidence),
      consensus_frames: s.consensusOf,
      frame_ref: s.frameRef,
    }));

    // Reconstruct route segments between consecutive observations
    const routeSegments: Array<{
      from_camera_id: string;
      from_camera_name: string;
      from_coordinates: { lat: number; long: number };
      from_timestamp: Date;
      to_camera_id: string;
      to_camera_name: string;
      to_coordinates: { lat: number; long: number };
      to_timestamp: Date;
      distance_meters: number;
      elapsed_seconds: number;
      estimated_speed_kmh: number | null;
      is_plausible: boolean;
      plausibility_status: 'PLAUSIBLE' | 'REQUIRES_REVIEW' | 'IMPLAUSIBLE' | 'STATIONARY_OR_REPEAT_SIGHTING';
      plausibility_reason: string;
      segment_confidence: number;
    }> = [];

    let totalDistanceMeters = 0;
    let implausibleHopsCount = 0;
    const distanceCache = new Map<string, number>();

    for (let i = 1; i < sightings.length; i++) {
      const prev = sightings[i - 1];
      const curr = sightings[i];

      const prevLat = Number(prev.camera.lat);
      const prevLong = Number(prev.camera.long);
      const currLat = Number(curr.camera.lat);
      const currLong = Number(curr.camera.long);

      // Elapsed time in seconds
      const elapsedSeconds = Math.max(0, Math.round((curr.ts.getTime() - prev.ts.getTime()) / 1000));

      // Compute geographic distance in meters
      let distanceMeters = 0;
      if (prev.camera.id === curr.camera.id) {
        distanceMeters = 0.0;
      } else {
        const cacheKey = `${prev.camera.id}_${curr.camera.id}`;
        if (distanceCache.has(cacheKey)) {
          distanceMeters = distanceCache.get(cacheKey)!;
        } else {
          // PostGIS true geodesic geography distance calculation
          const queryRes: Array<{ distance_meters: number | string }> = await this.prisma.$queryRaw`
            SELECT ROUND(ST_Distance(
              ST_SetSRID(ST_MakePoint(${prevLong}::float, ${prevLat}::float), 4326)::geography,
              ST_SetSRID(ST_MakePoint(${currLong}::float, ${currLat}::float), 4326)::geography
            )::numeric, 2) AS distance_meters
          `;
          distanceMeters = Number(queryRes[0]?.distance_meters || 0);
          distanceCache.set(cacheKey, distanceMeters);
        }
      }

      totalDistanceMeters += distanceMeters;

      // Spatio-Temporal Plausibility Analysis
      let isPlausible = true;
      let plausibilityStatus: 'PLAUSIBLE' | 'REQUIRES_REVIEW' | 'IMPLAUSIBLE' | 'STATIONARY_OR_REPEAT_SIGHTING' = 'PLAUSIBLE';
      let plausibilityReason = '';
      let estimatedSpeedKmh: number | null = null;
      let plausibilityWeight = 1.0;

      if (elapsedSeconds === 0) {
        if (distanceMeters > 50) {
          isPlausible = false;
          plausibilityStatus = 'IMPLAUSIBLE';
          plausibilityReason = `Simultaneous observation across distinct locations (${distanceMeters}m apart with 0s elapsed)`;
          plausibilityWeight = 0.0;
          implausibleHopsCount++;
        } else {
          isPlausible = true;
          plausibilityStatus = 'STATIONARY_OR_REPEAT_SIGHTING';
          plausibilityReason = 'Repeated observation at identical camera junction';
          estimatedSpeedKmh = 0.0;
          plausibilityWeight = 1.0;
        }
      } else {
        // Velocity (km/h) = (meters / 1000) / (seconds / 3600)
        estimatedSpeedKmh = Math.round(((distanceMeters / 1000) / (elapsedSeconds / 3600)) * 100) / 100;

        if (estimatedSpeedKmh > maxPlausibleSpeedKmh) {
          isPlausible = false;
          plausibilityStatus = 'REQUIRES_REVIEW';
          plausibilityReason = `Implied speed of ${estimatedSpeedKmh} km/h over ${distanceMeters}m exceeds plausible transit threshold (${maxPlausibleSpeedKmh} km/h)`;
          plausibilityWeight = 0.2;
          implausibleHopsCount++;
        } else {
          isPlausible = true;
          plausibilityStatus = 'PLAUSIBLE';
          plausibilityReason = `Plausible observed transit of ${estimatedSpeedKmh} km/h over ${distanceMeters}m`;
          plausibilityWeight = 1.0;
        }
      }

      // Canonical confidence formula: min(sighting_A.confidence, sighting_B.confidence, plausibility_score)
      const segmentConfidence = Number(
        Math.min(Number(prev.confidence), Number(curr.confidence), plausibilityWeight).toFixed(4),
      );

      routeSegments.push({
        from_camera_id: prev.camera.id,
        from_camera_name: prev.camera.name,
        from_coordinates: { lat: prevLat, long: prevLong },
        from_timestamp: prev.ts,
        to_camera_id: curr.camera.id,
        to_camera_name: curr.camera.name,
        to_coordinates: { lat: currLat, long: currLong },
        to_timestamp: curr.ts,
        distance_meters: distanceMeters,
        elapsed_seconds: elapsedSeconds,
        estimated_speed_kmh: estimatedSpeedKmh,
        is_plausible: isPlausible,
        plausibility_status: plausibilityStatus,
        plausibility_reason: plausibilityReason,
        segment_confidence: segmentConfidence,
      });
    }

    const totalElapsedSeconds = Math.max(
      0,
      Math.round((sightings[sightings.length - 1].ts.getTime() - sightings[0].ts.getTime()) / 1000),
    );

    const averageSpeedKmh =
      totalElapsedSeconds > 0
        ? Math.round(((totalDistanceMeters / 1000) / (totalElapsedSeconds / 3600)) * 100) / 100
        : 0.0;

    // Overall route plausibility score: ratio of plausible hops to total hops
    const routePlausibilityScore =
      routeSegments.length > 0
        ? Number(((routeSegments.length - implausibleHopsCount) / routeSegments.length).toFixed(4))
        : 1.0;

    // Synchronous investigative audit record
    await this.recordAuditLog(
      user.id,
      'VEHICLE_TIMELINE_SEARCH',
      null,
      {
        plate,
        plate_normalized: plate,
        sightings_count: sightings.length,
        route_segments_count: routeSegments.length,
        plausibility_score: routePlausibilityScore,
        implausible_hops: implausibleHopsCount,
      },
      requestId,
    );

    return {
      plate_normalized: plate,
      total_sightings: sightings.length,
      route_plausibility_score: routePlausibilityScore,
      sightings: formattedSightings,
      route_segments: routeSegments,
      summary: {
        total_distance_meters: Math.round(totalDistanceMeters * 100) / 100,
        total_elapsed_seconds: totalElapsedSeconds,
        average_speed_kmh: averageSpeedKmh,
        hops_count: routeSegments.length,
        implausible_hops_count: implausibleHopsCount,
      },
      disclaimer: 'Observed movement between camera observations; does not represent an exact physical driving route or turn-by-turn navigation.',
    };
  }

  /**
   * Synchronous audit record helper for police investigation auditability
   */
  private async recordAuditLog(
    actorId: string | null,
    action: string,
    before: any,
    after: any,
    correlationId?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource: 'Vehicle',
          before: before || null,
          after: after || null,
          correlationId: correlationId && correlationId.length === 36 ? correlationId : null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to record audit log for action: ${action}`, err);
    }
  }
}
