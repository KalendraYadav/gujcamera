import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma, CameraProtocol, OperationalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { CameraQueryDto } from './dto/camera-query.dto';
import { NearbyCameraQueryDto } from './dto/nearby-camera-query.dto';
import { ProtocolAdapterRegistry } from './adapters/protocol-adapter.registry';
import { TestConnectionDto } from './dto/test-connection.dto';
import { ConnectionProbeResult, AdapterConnectionStatus } from './adapters/camera-protocol-adapter.interface';

@Injectable()
export class CamerasService {
  private readonly logger = new Logger(CamerasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly protocolRegistry: ProtocolAdapterRegistry,
  ) {}


  /**
   * Onboard a new CCTV camera with location and stream configuration
   */
  async createCamera(dto: CreateCameraDto, user: AuthenticatedUser, requestId?: string) {
    const departmentId = dto.department_id || dto.departmentId;
    const connectorTypeId = dto.connector_type_id || dto.connectorTypeId;

    if (!departmentId) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'department_id is required',
      });
    }

    if (!connectorTypeId) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'connector_type_id is required',
      });
    }

    // RBAC: Department Admins can only onboard cameras for their own department
    if (user.role === 'DEPARTMENT_ADMIN' && user.departmentId !== departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only onboard cameras for their assigned department',
      });
    }

    // Verify department exists
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new BadRequestException({
        error_code: 'DEPARTMENT_NOT_FOUND',
        message: `Department with ID '${departmentId}' does not exist`,
      });
    }

    // Verify connector exists
    const connector = await this.prisma.connector.findUnique({
      where: { id: connectorTypeId },
    });
    if (!connector) {
      throw new BadRequestException({
        error_code: 'CONNECTOR_NOT_FOUND',
        message: `Connector with ID '${connectorTypeId}' does not exist`,
      });
    }

    // Validate duplicate stream URL if provided
    const streamHandle = dto.stream?.url_or_handle || dto.stream?.urlOrHandle;
    if (streamHandle) {
      const existingStream = await this.prisma.cameraStream.findFirst({
        where: { urlOrHandle: streamHandle },
        include: {
          camera: {
            select: { id: true, name: true },
          },
        },
      });
      if (existingStream) {
        throw new ConflictException({
          error_code: 'DUPLICATE_STREAM_ENDPOINT',
          message: `Stream endpoint '${streamHandle}' is already registered to another camera`,
          existing_camera: existingStream.camera
            ? {
                id: existingStream.camera.id,
                name: existingStream.camera.name,
              }
            : undefined,
        });
      }
    }

    const initialStatus = dto.operational_status || dto.operationalStatus || OperationalStatus.OFFLINE;

    // Create camera, location, stream, and health in a single transaction
    const createdCamera = await this.prisma.$transaction(async (tx) => {
      const camera = await tx.camera.create({
        data: {
          name: dto.name,
          departmentId,
          lat: new Prisma.Decimal(dto.lat),
          long: new Prisma.Decimal(dto.long),
          protocol: dto.protocol || CameraProtocol.RTSP,
          connectorTypeId,
          operationalStatus: initialStatus,
          isActive: true,
          location: dto.location
            ? {
                create: {
                  address: dto.location.address,
                  zone: dto.location.zone,
                  district: dto.location.district,
                },
              }
            : undefined,
          streams: dto.stream
            ? {
                create: {
                  codec: dto.stream.codec || 'h264',
                  resolution: dto.stream.resolution || '1920x1080',
                  fps: dto.stream.fps || 25,
                  urlOrHandle: streamHandle || 'rtsp://pending-configuration',
                },
              }
            : undefined,
          health: {
            create: {
              status: initialStatus,
              lastHeartbeat: new Date(),
              fpsActual: dto.stream?.fps || 0,
              packetLoss: initialStatus === OperationalStatus.ONLINE ? 0.0 : null,
            },
          },
        },
        include: {
          department: { select: { id: true, name: true } },
          location: { select: { address: true, zone: true, district: true } },
          streams: { select: { id: true, codec: true, resolution: true, fps: true, urlOrHandle: true } },
          health: { select: { status: true, lastHeartbeat: true, fpsActual: true, packetLoss: true } },
        },
      });

      // Synchronous Audit Log for camera onboarding
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CAMERA_ONBOARDED',
          resource: 'Camera',
          before: null,
          after: {
            id: camera.id,
            name: camera.name,
            departmentId: camera.departmentId,
            lat: Number(camera.lat),
            long: Number(camera.long),
            protocol: camera.protocol,
            status: camera.operationalStatus,
          },
          correlationId: requestId && requestId.length === 36 ? requestId : null,
        },
      });

      return camera;
    });

    return this.sanitizeCamera(createdCamera);
  }

  /**
   * List cameras with optional PostGIS Bounding Box filtering, status, and department scoping
   */
  async findCameras(query: CameraQueryDto) {
    const limit = query.limit || 20;
    const isActive = query.is_active !== undefined ? query.is_active : true;
    const departmentId = query.department_id || query.departmentId;

    // Check if Bounding Box query is requested
    if (query.bbox) {
      const parts = query.bbox.split(',').map((s) => Number(s.trim()));
      if (parts.length !== 4 || parts.some(isNaN)) {
        throw new BadRequestException({
          error_code: 'INVALID_BBOX',
          message: 'Bounding box must contain 4 comma-separated numeric coordinates: minLong,minLat,maxLong,maxLat',
        });
      }

      const [minLong, minLat, maxLong, maxLat] = parts;

      if (minLong < -180 || minLong > 180 || maxLong < -180 || maxLong > 180 || minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
        throw new BadRequestException({
          error_code: 'INVALID_BBOX',
          message: 'Bounding box coordinates are out of valid range (Long: [-180, 180], Lat: [-90, 90])',
        });
      }

      if (minLong > maxLong || minLat > maxLat) {
        throw new BadRequestException({
          error_code: 'INVALID_BBOX',
          message: 'Bounding box minimum coordinates cannot exceed maximum coordinates',
        });
      }

      // Execute database-side PostGIS spatial bounding box query using GiST index
      const conditions: Prisma.Sql[] = [
        Prisma.sql`c.is_active = ${isActive}`,
        Prisma.sql`ST_Within(
          ST_SetSRID(ST_MakePoint(c.long::float, c.lat::float), 4326),
          ST_MakeEnvelope(${minLong}::float, ${minLat}::float, ${maxLong}::float, ${maxLat}::float, 4326)
        )`,
      ];

      if (query.status) {
        conditions.push(Prisma.sql`c.operational_status = ${query.status}::"OperationalStatus"`);
      }

      if (departmentId) {
        conditions.push(Prisma.sql`c.department_id = ${departmentId}::uuid`);
      }

      const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

      const matchingRows: Array<{ id: string }> = await this.prisma.$queryRaw`
        SELECT c.id
        FROM cameras c
        ${whereSql}
        ORDER BY c.created_at DESC
        LIMIT ${limit}
      `;

      if (matchingRows.length === 0) {
        return {
          data: [],
          pagination: {
            limit,
            total: 0,
            next_cursor: null,
          },
        };
      }

      const cameraIds = matchingRows.map((r) => r.id);
      const cameras = await this.prisma.camera.findMany({
        where: { id: { in: cameraIds } },
        include: {
          department: { select: { id: true, name: true } },
          location: { select: { address: true, zone: true, district: true } },
          streams: { select: { id: true, codec: true, resolution: true, fps: true, urlOrHandle: true } },
          health: { select: { status: true, lastHeartbeat: true, fpsActual: true, packetLoss: true } },
        },
      });

      // Preserve spatial query order
      const cameraMap = new Map(cameras.map((c) => [c.id, c]));
      const ordered = cameraIds.map((id) => cameraMap.get(id)!).filter(Boolean);

      return {
        data: ordered.map((c) => this.sanitizeCamera(c)),
        pagination: {
          limit,
          total: ordered.length,
          next_cursor: ordered.length === limit ? ordered[ordered.length - 1].id : null,
        },
      };
    }

    // Standard non-spatial query via Prisma ORM
    const whereClause: Prisma.CameraWhereInput = {
      isActive,
      ...(query.status && { operationalStatus: query.status }),
      ...(departmentId && { departmentId }),
    };

    const cameras = await this.prisma.camera.findMany({
      where: whereClause,
      take: limit,
      ...(query.cursor && {
        skip: 1,
        cursor: { id: query.cursor },
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        department: { select: { id: true, name: true } },
        location: { select: { address: true, zone: true, district: true } },
        streams: { select: { id: true, codec: true, resolution: true, fps: true, urlOrHandle: true } },
        health: { select: { status: true, lastHeartbeat: true, fpsActual: true, packetLoss: true } },
      },
    });

    const totalCount = await this.prisma.camera.count({ where: whereClause });

    return {
      data: cameras.map((c) => this.sanitizeCamera(c)),
      pagination: {
        limit,
        total: totalCount,
        next_cursor: cameras.length === limit ? cameras[cameras.length - 1].id : null,
      },
    };
  }

  /**
   * Find nearby cameras using true PostGIS geography distance calculation (WGS-84 Great-Circle)
   * Unit of search radius: METERS
   */
  async findNearbyCameras(query: NearbyCameraQueryDto) {
    const lat = Number(query.lat);
    const rawLng = query.lng !== undefined ? query.lng : query.long;
    const lng = Number(rawLng);
    const radiusMeters = Number(query.radius);
    const limit = query.limit || 20;

    if (query.lat === undefined || isNaN(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException({
        error_code: 'INVALID_COORDINATES',
        message: 'Latitude must be a valid number between -90 and 90 degrees',
      });
    }

    if (rawLng === undefined || isNaN(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException({
        error_code: 'INVALID_COORDINATES',
        message: 'Longitude must be a valid number between -180 and 180 degrees',
      });
    }

    if (query.radius === undefined || isNaN(radiusMeters) || radiusMeters <= 0 || radiusMeters > 500000) {
      throw new BadRequestException({
        error_code: 'INVALID_RADIUS',
        message: 'Radius must be a positive number in METERS between 1 and 500,000 meters (max: 500km)',
      });
    }

    // PostGIS true geodesic geography distance calculation
    // ST_DWithin and ST_Distance using geography type ensures calculation is in METERS, not degrees.
    const nearbyRows: Array<{ id: string; distance_meters: string | number }> = await this.prisma.$queryRaw`
      SELECT 
        c.id, 
        ROUND(ST_Distance(
          ST_SetSRID(ST_MakePoint(c.long::float, c.lat::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lng}::float, ${lat}::float), 4326)::geography
        )::numeric, 2) AS distance_meters
      FROM cameras c
      WHERE c.is_active = true
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(c.long::float, c.lat::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lng}::float, ${lat}::float), 4326)::geography,
          ${radiusMeters}::float
        )
      ORDER BY distance_meters ASC
      LIMIT ${limit};
    `;

    if (nearbyRows.length === 0) {
      return {
        data: [],
        query: {
          lat,
          lng,
          radius_meters: radiusMeters,
          unit: 'meters',
        },
        total: 0,
      };
    }

    const cameraIds = nearbyRows.map((r) => r.id);
    const cameras = await this.prisma.camera.findMany({
      where: { id: { in: cameraIds } },
      include: {
        department: { select: { id: true, name: true } },
        location: { select: { address: true, zone: true, district: true } },
        streams: { select: { id: true, codec: true, resolution: true, fps: true, urlOrHandle: true } },
        health: { select: { status: true, lastHeartbeat: true, fpsActual: true, packetLoss: true } },
      },
    });

    const cameraMap = new Map(cameras.map((c) => [c.id, c]));

    const result = nearbyRows
      .map((row) => {
        const cam = cameraMap.get(row.id);
        if (!cam) return null;
        const sanitized = this.sanitizeCamera(cam);
        return {
          ...sanitized,
          distance_meters: Number(row.distance_meters),
        };
      })
      .filter(Boolean);

    return {
      data: result,
      query: {
        lat,
        lng,
        radius_meters: radiusMeters,
        unit: 'meters',
      },
      total: result.length,
    };
  }

  /**
   * Get single camera deep-dive record with location, stream, and health details
   */
  async findCameraById(id: string) {
    if (!this.isValidUUID(id)) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid camera UUID format',
      });
    }

    const camera = await this.prisma.camera.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        location: { select: { address: true, zone: true, district: true } },
        streams: { select: { id: true, codec: true, resolution: true, fps: true, urlOrHandle: true } },
        health: { select: { status: true, lastHeartbeat: true, fpsActual: true, packetLoss: true } },
      },
    });

    if (!camera) {
      throw new NotFoundException({
        error_code: 'CAMERA_NOT_FOUND',
        message: `Camera with ID '${id}' not found`,
      });
    }

    return this.sanitizeCamera(camera);
  }

  /**
   * Update camera metadata, location, and operational attributes with audit trail
   */
  async updateCamera(id: string, dto: UpdateCameraDto, user: AuthenticatedUser, requestId?: string) {
    if (!this.isValidUUID(id)) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid camera UUID format',
      });
    }

    const existing = await this.prisma.camera.findUnique({
      where: { id },
      include: {
        location: true,
        health: true,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error_code: 'CAMERA_NOT_FOUND',
        message: `Camera with ID '${id}' not found`,
      });
    }

    // RBAC: Department Admins can only modify cameras in their own department
    if (user.role === 'DEPARTMENT_ADMIN' && existing.departmentId !== user.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only modify cameras in their assigned department',
      });
    }

    const targetDeptId = dto.department_id || dto.departmentId;
    if (targetDeptId && user.role === 'DEPARTMENT_ADMIN' && targetDeptId !== user.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Cannot reassign camera to a different department',
      });
    }

    if (targetDeptId) {
      const dept = await this.prisma.department.findUnique({ where: { id: targetDeptId } });
      if (!dept) {
        throw new BadRequestException({
          error_code: 'DEPARTMENT_NOT_FOUND',
          message: `Department with ID '${targetDeptId}' does not exist`,
        });
      }
    }

    const targetConnectorId = dto.connector_type_id || dto.connectorTypeId;
    if (targetConnectorId) {
      const conn = await this.prisma.connector.findUnique({ where: { id: targetConnectorId } });
      if (!conn) {
        throw new BadRequestException({
          error_code: 'CONNECTOR_NOT_FOUND',
          message: `Connector with ID '${targetConnectorId}' does not exist`,
        });
      }
    }

    const operationalStatus = dto.operational_status || dto.operationalStatus;
    const isActive = dto.is_active !== undefined ? dto.is_active : dto.isActive;

    const updatedCamera = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.camera.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.lat !== undefined && { lat: new Prisma.Decimal(dto.lat) }),
          ...(dto.long !== undefined && { long: new Prisma.Decimal(dto.long) }),
          ...(dto.protocol !== undefined && { protocol: dto.protocol }),
          ...(operationalStatus !== undefined && { operationalStatus }),
          ...(isActive !== undefined && { isActive }),
          ...(targetDeptId && { departmentId: targetDeptId }),
          ...(targetConnectorId && { connectorTypeId: targetConnectorId }),
          ...(dto.location && {
            location: {
              upsert: {
                create: {
                  address: dto.location.address,
                  zone: dto.location.zone,
                  district: dto.location.district,
                },
                update: {
                  address: dto.location.address,
                  zone: dto.location.zone,
                  district: dto.location.district,
                },
              },
            },
          }),
        },
        include: {
          department: { select: { id: true, name: true } },
          location: { select: { address: true, zone: true, district: true } },
          streams: { select: { id: true, codec: true, resolution: true, fps: true, urlOrHandle: true } },
          health: { select: { status: true, lastHeartbeat: true, fpsActual: true, packetLoss: true } },
        },
      });

      // Synchronous Audit Log for camera update
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CAMERA_UPDATED',
          resource: 'Camera',
          before: {
            name: existing.name,
            lat: Number(existing.lat),
            long: Number(existing.long),
            protocol: existing.protocol,
            operationalStatus: existing.operationalStatus,
            isActive: existing.isActive,
            departmentId: existing.departmentId,
          },
          after: {
            name: updated.name,
            lat: Number(updated.lat),
            long: Number(updated.long),
            protocol: updated.protocol,
            operationalStatus: updated.operationalStatus,
            isActive: updated.isActive,
            departmentId: updated.departmentId,
          },
          correlationId: requestId && requestId.length === 36 ? requestId : null,
        },
      });

      return updated;
    });

    return this.sanitizeCamera(updatedCamera);
  }

  /**
   * Soft decommission a camera (preserves historical telemetry, sightings, and evidence)
   */
  async decommissionCamera(id: string, user: AuthenticatedUser, requestId?: string) {
    if (!this.isValidUUID(id)) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid camera UUID format',
      });
    }

    const existing = await this.prisma.camera.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException({
        error_code: 'CAMERA_NOT_FOUND',
        message: `Camera with ID '${id}' not found`,
      });
    }

    // RBAC: Department Admins can only decommission cameras in their own department
    if (user.role === 'DEPARTMENT_ADMIN' && existing.departmentId !== user.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only decommission cameras in their assigned department',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Soft decommission: mark inactive and offline
      await tx.camera.update({
        where: { id },
        data: {
          isActive: false,
          operationalStatus: OperationalStatus.OFFLINE,
        },
      });

      // Update camera health record to OFFLINE
      await tx.cameraHealth.upsert({
        where: { cameraId: id },
        create: {
          cameraId: id,
          status: OperationalStatus.OFFLINE,
          lastHeartbeat: new Date(),
        },
        update: {
          status: OperationalStatus.OFFLINE,
        },
      });

      // Synchronous Audit Log for camera decommission
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'CAMERA_DECOMMISSIONED',
          resource: 'Camera',
          before: {
            id: existing.id,
            name: existing.name,
            isActive: existing.isActive,
            operationalStatus: existing.operationalStatus,
          },
          after: {
            id: existing.id,
            isActive: false,
            operationalStatus: OperationalStatus.OFFLINE,
          },
          correlationId: requestId && requestId.length === 36 ? requestId : null,
        },
      });
    });

    return {
      message: 'Camera successfully decommissioned (soft deletion)',
      id,
      is_active: false,
      operational_status: 'OFFLINE',
    };
  }

  /**
   * Get telemetry and health metrics for a specific camera
   */
  async getCameraHealth(id: string) {
    if (!this.isValidUUID(id)) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid camera UUID format',
      });
    }

    const camera = await this.prisma.camera.findUnique({
      where: { id },
      include: { health: true },
    });

    if (!camera) {
      throw new NotFoundException({
        error_code: 'CAMERA_NOT_FOUND',
        message: `Camera with ID '${id}' not found`,
      });
    }

    return {
      camera_id: camera.id,
      name: camera.name,
      operational_status: camera.operationalStatus,
      is_active: camera.isActive,
      health: camera.health
        ? {
            status: camera.health.status,
            last_heartbeat: camera.health.lastHeartbeat,
            fps_actual: camera.health.fpsActual ? Number(camera.health.fpsActual) : null,
            packet_loss: camera.health.packetLoss ? Number(camera.health.packetLoss) : null,
            updated_at: camera.health.updatedAt,
          }
        : null,
    };
  }

  /**
   * Get operational summary across registered CCTV camera estate
   * Note: This represents camera equipment telemetry and is distinct from backend API/DB health.
   */
  async getCameraHealthSummary() {
    const [total, online, degraded, offline, connecting, error, decommissioned] = await Promise.all([
      this.prisma.camera.count(),
      this.prisma.camera.count({ where: { isActive: true, operationalStatus: OperationalStatus.ONLINE } }),
      this.prisma.camera.count({ where: { isActive: true, operationalStatus: OperationalStatus.DEGRADED } }),
      this.prisma.camera.count({ where: { isActive: true, operationalStatus: OperationalStatus.OFFLINE } }),
      this.prisma.camera.count({ where: { isActive: true, operationalStatus: OperationalStatus.CONNECTING } }),
      this.prisma.camera.count({ where: { isActive: true, operationalStatus: OperationalStatus.ERROR } }),
      this.prisma.camera.count({ where: { isActive: false } }),
    ]);

    return {
      total_cameras: total,
      online,
      degraded,
      offline,
      connecting,
      error,
      decommissioned,
      note: 'Camera operational health derived from registered camera telemetry and heartbeats, independent of API/database infrastructure health',
    };
  }

  /**
   * Remove internal secrets, sanitize database fields, and normalize Decimals to numbers
   */
  private sanitizeCamera(camera: any) {
    return {
      id: camera.id,
      name: camera.name,
      department_id: camera.departmentId,
      department_name: camera.department?.name,
      lat: Number(camera.lat),
      long: Number(camera.long),
      protocol: camera.protocol,
      connector_type_id: camera.connectorTypeId,
      operational_status: camera.operationalStatus,
      is_active: camera.isActive,
      created_at: camera.createdAt,
      updated_at: camera.updatedAt,
      location: camera.location
        ? {
            address: camera.location.address,
            zone: camera.location.zone,
            district: camera.location.district,
          }
        : null,
      streams: camera.streams
        ? camera.streams.map((s: any) => ({
            id: s.id,
            codec: s.codec,
            resolution: s.resolution,
            fps: s.fps,
            url_or_handle: s.urlOrHandle,
          }))
        : [],
      health: camera.health
        ? {
            status: camera.health.status,
            last_heartbeat: camera.health.lastHeartbeat,
            fps_actual: camera.health.fpsActual ? Number(camera.health.fpsActual) : null,
            packet_loss: camera.health.packetLoss ? Number(camera.health.packetLoss) : null,
          }
        : null,
    };
  }

  /**
   * Execute live protocol probe test against camera endpoint
   */
  async testConnection(dto: TestConnectionDto): Promise<ConnectionProbeResult> {
    const url = dto.resolvedUrlOrHandle;
    if (!url) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'url_or_handle is required for connection testing',
      });
    }

    const adapter = this.protocolRegistry.getAdapter(dto.protocol);
    return adapter.probeConnection({
      protocol: dto.protocol,
      endpointUrl: url,
      username: dto.username,
      password: dto.password,
      timeoutMs: dto.timeoutMs,
      profileToken: dto.profileToken,
    });
  }

  /**
   * List available camera connectors and supported protocol adapters
   */
  async getConnectors() {
    const connectors = await this.prisma.connector.findMany({
      select: {
        id: true,
        adapterType: true,
        configRef: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      connectors: connectors.map((c) => ({
        id: c.id,
        adapter_type: c.adapterType,
        config_ref: c.configRef,
        created_at: c.createdAt,
      })),
      supported_protocols: this.protocolRegistry.getSupportedProtocols(),
    };
  }

  /**
   * List departments with canonical IDs and names for administrative fleet assignment
   */
  async getDepartments() {
    const departments = await this.prisma.department.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
    }));
  }

  private isValidUUID(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }
}
