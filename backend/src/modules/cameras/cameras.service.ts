import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
  OnModuleInit,
  Optional,
  Inject,
} from '@nestjs/common';
import { Prisma, CameraProtocol, OperationalStatus, CredentialType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { CameraQueryDto } from './dto/camera-query.dto';
import { NearbyCameraQueryDto } from './dto/nearby-camera-query.dto';
import { ProtocolAdapterRegistry } from './adapters/protocol-adapter.registry';
import { TestConnectionDto } from './dto/test-connection.dto';
import { ConnectionProbeResult, AdapterConnectionStatus } from './adapters/camera-protocol-adapter.interface';
import { MediaGatewayService } from './media-gateway.service';
import { RedisStreamClient } from '../../common/events/redis/redis-stream.client';
import { LocalEncryptedCredentialProvider } from './credentials/local-encrypted-credential.provider';
import { CredentialPayload } from './credentials/credential-store.interface';
import { CameraHealthPollerService } from './health/camera-health-poller.service';
import {
  sanitizeStreamUrl,
  stripCredentialsFromUrl,
  extractCredentialsFromUrl,
} from '../../common/utils/url-sanitizer.util';

@Injectable()
export class CamerasService implements OnModuleInit {
  private readonly logger = new Logger(CamerasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly protocolRegistry: ProtocolAdapterRegistry,
    @Optional() @Inject(MediaGatewayService) private readonly mediaGatewayService?: MediaGatewayService,
    @Optional() @Inject(RedisStreamClient) private readonly redisClient?: RedisStreamClient,
    @Optional() @Inject(LocalEncryptedCredentialProvider) private readonly credentialStore?: LocalEncryptedCredentialProvider,
    @Optional() @Inject(CameraHealthPollerService) private readonly healthPoller?: CameraHealthPollerService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      if (this.mediaGatewayService) {
        const health = await this.mediaGatewayService.checkHealth(1500);
        this.logger.log(`MediaMTX Gateway status on init: ${health.isHealthy ? 'ONLINE' : 'OFFLINE'}`);
      }

      if (this.redisClient) {
        // Synchronize active cameras from DB into Redis active-streams registry hash
        const activeCameras = await this.prisma.camera.findMany({
          where: { isActive: true },
          include: { streams: true },
        });

        for (const cam of activeCameras) {
          const stream = cam.streams?.[0];
          if (stream?.urlOrHandle) {
            const pathName = this.mediaGatewayService
              ? this.mediaGatewayService.normalizePathName(cam.name, cam.id)
              : 'cam';
            await this.redisClient.hset(
              'gujcamera:registry:active-streams',
              cam.id,
              JSON.stringify({
                id: cam.id,
                name: cam.name,
                internal_url: sanitizeStreamUrl(stream.urlOrHandle),
                path_name: pathName,
                status: cam.operationalStatus,
              }),
            );
          }
        }
        this.logger.log(`[MediaGatewaySync] Synced ${activeCameras.length} active camera streams to Redis`);
      }
    } catch (err: any) {
      this.logger.warn(`Startup camera stream sync deferred: ${err.message}`);
    }
  }


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

    // Extract credentials if provided inline or via explicit credentials payload
    const rawStreamHandle = dto.stream?.url_or_handle || dto.stream?.urlOrHandle;
    const extractedCreds = extractCredentialsFromUrl(rawStreamHandle);
    const cleanStreamHandle = extractedCreds.cleanUrl;

    const credentialUsername = dto.credentials?.username || extractedCreds.username;
    const credentialPassword = dto.credentials?.password || extractedCreds.password;
    const credentialToken = dto.credentials?.token;
    const hasCredentialsToStore = Boolean(credentialPassword || credentialToken);

    // Validate duplicate stream URL if provided (checking clean endpoint to avoid false negatives)
    if (cleanStreamHandle) {
      const existingStream = await this.prisma.cameraStream.findFirst({
        where: { urlOrHandle: cleanStreamHandle },
        include: {
          camera: {
            select: { id: true, name: true },
          },
        },
      });
      if (existingStream) {
        throw new ConflictException({
          error_code: 'DUPLICATE_STREAM_ENDPOINT',
          message: `Stream endpoint '${cleanStreamHandle}' is already registered to another camera`,
          existing_camera: existingStream.camera
            ? {
                id: existingStream.camera.id,
                name: existingStream.camera.name,
              }
            : undefined,
        });
      }
    }

    let initialStatus = dto.operational_status || dto.operationalStatus || OperationalStatus.OFFLINE;
    let finalStreamHandle = cleanStreamHandle || 'rtsp://pending-configuration';
    let pathName = 'cam-stream';

    if (this.mediaGatewayService && cleanStreamHandle) {
      pathName = this.mediaGatewayService.normalizePathName(dto.name, 'pending');
      const isPullable = this.mediaGatewayService.isPullableExternalSource(cleanStreamHandle);
      const isPlaceholder = this.mediaGatewayService.isPlaceholderStream(cleanStreamHandle);

      if (isPullable) {
        // Construct authenticated source URL in memory ONLY for MediaMTX registration
        let mediaMtxSourceUrl = cleanStreamHandle;
        if (credentialUsername && credentialPassword) {
          try {
            const parsed = new URL(cleanStreamHandle);
            parsed.username = encodeURIComponent(credentialUsername);
            parsed.password = encodeURIComponent(credentialPassword);
            mediaMtxSourceUrl = parsed.toString();
          } catch {
            mediaMtxSourceUrl = rawStreamHandle || cleanStreamHandle;
          }
        } else if (rawStreamHandle) {
          mediaMtxSourceUrl = rawStreamHandle;
        }

        const gatewayRes = await this.mediaGatewayService.registerPath(pathName, mediaMtxSourceUrl);
        if (gatewayRes.success) {
          finalStreamHandle = gatewayRes.internalRtspUrl;
          initialStatus = dto.operational_status || dto.operationalStatus || OperationalStatus.ONLINE;
        } else {
          this.logger.warn(`Media gateway registration failed for '${pathName}': ${gatewayRes.error}`);
          initialStatus = OperationalStatus.ERROR;
        }
      } else if (isPlaceholder) {
        // Placeholder / mock stream: do NOT register into MediaMTX
        finalStreamHandle = cleanStreamHandle;
        initialStatus = dto.operational_status || dto.operationalStatus || OperationalStatus.OFFLINE;
      } else {
        // Internal/simulator stream: preserve clean stream handle
        finalStreamHandle = cleanStreamHandle;
        initialStatus = dto.operational_status || dto.operationalStatus || OperationalStatus.ONLINE;
      }
    }

    // Create camera, location, stream, health, and credentials in a single transaction
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
                  urlOrHandle: stripCredentialsFromUrl(finalStreamHandle),
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
          credential: { select: { id: true, credentialType: true } },
        },
      });

      // Secure Credential Vault Storage (AES-256-GCM authenticated encryption)
      if (this.credentialStore && hasCredentialsToStore) {
        await this.credentialStore.storeCredential(
          camera.id,
          {
            username: credentialUsername,
            password: credentialPassword,
            token: credentialToken,
          },
          dto.protocol === CameraProtocol.ONVIF ? CredentialType.ONVIF_TOKEN : CredentialType.BASIC_AUTH,
        );

        // Audit Log for credential configuration (never logging secrets)
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'CREDENTIAL_CONFIGURED',
            resource: 'CameraCredential',
            before: null,
            after: {
              cameraId: camera.id,
              credentialType: dto.protocol === CameraProtocol.ONVIF ? 'ONVIF_TOKEN' : 'BASIC_AUTH',
              configured: true,
            },
            correlationId: requestId && requestId.length === 36 ? requestId : null,
          },
        });
      }

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

    // Synchronize newly activated stream to Redis Registry and notify downstream AI Worker
    if (this.redisClient && createdCamera.isActive && initialStatus !== OperationalStatus.ERROR) {
      try {
        const safeInternalUrl = sanitizeStreamUrl(finalStreamHandle);
        const streamData = JSON.stringify({
          id: createdCamera.id,
          name: createdCamera.name,
          internal_url: safeInternalUrl,
          path_name: pathName,
          status: createdCamera.operationalStatus,
        });
        await this.redisClient.hset('gujcamera:registry:active-streams', createdCamera.id, streamData);
        await this.redisClient.pubsubPublish(
          'gujcamera:control:camera-events',
          JSON.stringify({
            action: 'ACTIVATE',
            camera_id: createdCamera.id,
            internal_url: safeInternalUrl,
            path_name: pathName,
          }),
        );
        this.logger.log(`[DynamicStream] Activated stream '${pathName}' for camera ${createdCamera.id}`);
      } catch (redisErr: any) {
        this.logger.warn(`Could not publish dynamic stream activation to Redis: ${redisErr.message}`);
      }
    }

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
          credential: { select: { id: true, credentialType: true } },
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
      ...(query.city && {
        location: {
          district: { contains: query.city, mode: 'insensitive' },
        },
      }),
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
        credential: { select: { id: true, credentialType: true } },
      },
    });

    const totalCount = await this.prisma.camera.count({ where: whereClause });
    let sanitized = cameras.map((c) => this.sanitizeCamera(c));

    if (query.source_type) {
      sanitized = sanitized.filter((c) => c.source_type === query.source_type);
    }

    return {
      data: sanitized,
      pagination: {
        limit,
        total: query.source_type ? sanitized.length : totalCount,
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
        credential: { select: { id: true, credentialType: true } },
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
        credential: { select: { id: true, credentialType: true } },
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
          credential: { select: { id: true, credentialType: true } },
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

    // MediaMTX and Redis Dynamic Stream Sync on camera update
    if (updatedCamera) {
      const streamObj = updatedCamera.streams?.[0];
      const streamUrl = streamObj?.urlOrHandle;
      const pathName = this.mediaGatewayService
        ? this.mediaGatewayService.normalizePathName(updatedCamera.name, updatedCamera.id)
        : '';

      if (updatedCamera.isActive && streamUrl) {
        // Camera is active: ensure MediaMTX path & Redis activation
        if (this.mediaGatewayService && this.mediaGatewayService.isPullableExternalSource(streamUrl)) {
          try {
            await this.mediaGatewayService.registerPath(pathName, streamUrl);
          } catch (gwErr: any) {
            this.logger.warn(`Media gateway registration error for '${pathName}': ${gwErr.message}`);
          }
        }
        if (this.redisClient) {
          try {
            const safeStreamUrl = sanitizeStreamUrl(streamUrl);
            await this.redisClient.hset(
              'gujcamera:registry:active-streams',
              updatedCamera.id,
              JSON.stringify({
                id: updatedCamera.id,
                name: updatedCamera.name,
                internal_url: safeStreamUrl,
                path_name: pathName,
                status: updatedCamera.operationalStatus,
              }),
            );
            await this.redisClient.pubsubPublish(
              'gujcamera:control:camera-events',
              JSON.stringify({
                action: 'ACTIVATE',
                camera_id: updatedCamera.id,
                internal_url: safeStreamUrl,
                path_name: pathName,
              }),
            );
          } catch {}
        }
      } else if (!updatedCamera.isActive) {
        // Camera deactivated: remove MediaMTX path & publish DEACTIVATE
        if (this.mediaGatewayService) {
          try {
            await this.mediaGatewayService.removePath(pathName);
          } catch {}
        }
        if (this.redisClient) {
          try {
            await this.redisClient.hdel('gujcamera:registry:active-streams', updatedCamera.id);
            await this.redisClient.pubsubPublish(
              'gujcamera:control:camera-events',
              JSON.stringify({
                action: 'DEACTIVATE',
                camera_id: updatedCamera.id,
                path_name: pathName,
              }),
            );
          } catch {}
        }
      }
    }

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

    // Remove path from MediaMTX and notify AI Worker
    if (this.mediaGatewayService && existing) {
      try {
        const pathName = this.mediaGatewayService.normalizePathName(existing.name, existing.id);
        await this.mediaGatewayService.removePath(pathName);
      } catch (gwErr: any) {
        this.logger.warn(`Media gateway path removal deferred for camera ${id}: ${gwErr.message}`);
      }
    }

    // Decommission safety: explicitly notify health poller to drop camera from monitoring
    if (this.healthPoller) {
      this.healthPoller.forgetCamera(id);
    }

    if (this.redisClient && existing) {
      try {
        const pathName = this.mediaGatewayService
          ? this.mediaGatewayService.normalizePathName(existing.name, existing.id)
          : '';
        await this.redisClient.hdel('gujcamera:registry:active-streams', id);
        await this.redisClient.pubsubPublish(
          'gujcamera:control:camera-events',
          JSON.stringify({
            action: 'DEACTIVATE',
            camera_id: id,
            path_name: pathName,
          }),
        );
      } catch (redisErr: any) {
        this.logger.warn(`Redis deactivation publish deferred for camera ${id}: ${redisErr.message}`);
      }
    }

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

    const runtimeState = this.healthPoller?.getRuntimeState(id);
    let gatewayStatus: any = null;
    if (this.mediaGatewayService && camera.name) {
      const pathName = this.mediaGatewayService.normalizePathName(camera.name, camera.id);
      const stateRes = await this.mediaGatewayService.getPathState(pathName, 1500);
      gatewayStatus = {
        exists: stateRes.exists,
        ready: stateRes.ready,
        path_name: pathName,
        readers_count: stateRes.state?.readersCount || 0,
        bytes_received: stateRes.state?.bytesReceived,
      };
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
            reconnect_attempts: runtimeState?.reconnectAttempts || 0,
            failure_reason: runtimeState?.failureReason || null,
            last_transition: runtimeState?.lastTransitionAt || null,
            recovery_at: runtimeState?.recoveryAt || null,
            gateway_status: gatewayStatus,
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
      metrics: this.healthPoller ? this.healthPoller.getMetrics() : null,
      note: 'Camera operational health derived from registered camera telemetry and heartbeats, independent of API/database infrastructure health',
    };
  }

  /**
   * Remove internal secrets, sanitize database fields, and normalize Decimals to numbers
   */
  private sanitizeCamera(camera: any) {
    const streamUrl = camera.streams?.[0]?.urlOrHandle || camera.streams?.[0]?.url_or_handle || '';
    let sourceType = camera.source_type || camera.sourceType || 'SYNTHETIC_STREAM';
    if (!camera.source_type && !camera.sourceType) {
      if (streamUrl.includes('demo-traffic') || camera.name?.includes('RESEARCH') || camera.name?.includes('Expressway') || camera.name?.includes('SUR') || camera.name?.includes('VAD') || camera.name?.includes('RJK')) {
        sourceType = 'RESEARCH_VIDEO';
      } else if (streamUrl.includes('mock://')) {
        sourceType = 'DEMO_FILE';
      } else if (camera.protocol === 'ONVIF' && !streamUrl.includes('simulator') && !streamUrl.includes('video-gateway')) {
        sourceType = 'REAL_ONVIF';
      } else if (camera.protocol === 'RTSP' && !streamUrl.includes('simulator') && !streamUrl.includes('video-gateway')) {
        sourceType = 'REAL_RTSP';
      }
    }

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
      source_type: sourceType,
      created_at: camera.createdAt,
      updated_at: camera.updatedAt,
      credential_configured: Boolean(camera.credential),
      location: camera.location
        ? {
            address: camera.location.address,
            zone: camera.location.zone,
            district: camera.location.district,
            city: camera.location.district,
          }
        : null,
      streams: camera.streams
        ? camera.streams.map((s: any) => ({
            id: s.id,
            codec: s.codec,
            resolution: s.resolution,
            fps: s.fps,
            url_or_handle: sanitizeStreamUrl(s.urlOrHandle),
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
   * Securely store or rotate camera credentials in AES-256-GCM vault with audit logging
   */
  async configureCredentials(
    cameraId: string,
    payload: CredentialPayload,
    user: AuthenticatedUser,
    type: CredentialType = CredentialType.BASIC_AUTH,
    requestId?: string,
  ): Promise<{ configured: boolean; cameraId: string; credentialType: CredentialType }> {
    if (!this.isValidUUID(cameraId)) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid camera UUID format',
      });
    }

    if (!this.credentialStore) {
      throw new BadRequestException({
        error_code: 'CREDENTIAL_STORE_UNAVAILABLE',
        message: 'Encrypted credential storage is not initialized on this instance',
      });
    }

    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      include: {
        streams: true,
        health: true,
      },
    });
    if (!camera) {
      throw new NotFoundException({
        error_code: 'CAMERA_NOT_FOUND',
        message: `Camera with ID '${cameraId}' not found`,
      });
    }

    // RBAC: Department Admins can only configure credentials for their assigned department
    if (user.role === 'DEPARTMENT_ADMIN' && camera.departmentId !== user.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only configure credentials for their assigned department',
      });
    }

    const hadExisting = await this.credentialStore.hasCredential(cameraId);
    await this.credentialStore.storeCredential(cameraId, payload, type);

    // If camera is currently active and stream is registered via MediaMTX, update active path in gateway
    if (this.mediaGatewayService && camera.isActive && camera.streams && camera.streams.length > 0) {
      const stream = camera.streams[0];
      const cleanUrl = stripCredentialsFromUrl(stream.urlOrHandle);

      if (cleanUrl && this.mediaGatewayService.isPullableExternalSource(cleanUrl)) {
        const pathName = this.mediaGatewayService.normalizePathName(camera.name, camera.id);

        // Construct authenticated source in memory ONLY for MediaMTX registration
        let mediaMtxSourceUrl = cleanUrl;
        if (payload.username && payload.password) {
          try {
            const parsed = new URL(cleanUrl);
            parsed.username = encodeURIComponent(payload.username);
            parsed.password = encodeURIComponent(payload.password);
            mediaMtxSourceUrl = parsed.toString();
          } catch {
            mediaMtxSourceUrl = cleanUrl;
          }
        }

        const gatewayRes = await this.mediaGatewayService.registerPath(pathName, mediaMtxSourceUrl);
        if (!gatewayRes.success) {
          this.logger.warn(`MediaMTX path update failed during credential rotation for camera '${camera.id}': ${gatewayRes.error}`);
          await this.prisma.camera.update({
            where: { id: cameraId },
            data: { operationalStatus: OperationalStatus.ERROR },
          });
          await this.prisma.cameraHealth.upsert({
            where: { cameraId },
            create: {
              cameraId,
              status: OperationalStatus.ERROR,
              lastHeartbeat: new Date(),
              fpsActual: 0,
              packetLoss: 100.0,
            },
            update: {
              status: OperationalStatus.ERROR,
              packetLoss: 100.0,
            },
          });
          throw new BadRequestException({
            error_code: 'GATEWAY_STREAM_UPDATE_FAILED',
            message: `Credential rotated in vault, but media gateway failed to update stream source: ${gatewayRes.error}`,
            camera_id: cameraId,
            status: OperationalStatus.ERROR,
          });
        }
      }
    }

    // Audit log (strictly never logging secret material)
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: hadExisting ? 'CREDENTIAL_UPDATED' : 'CREDENTIAL_CONFIGURED',
        resource: 'CameraCredential',
        before: hadExisting ? { configured: true } : null,
        after: {
          cameraId,
          credentialType: type,
          configured: true,
        },
        correlationId: requestId && requestId.length === 36 ? requestId : null,
      },
    });

    // Notify health poller to reset retry state for immediate reconciliation with new credentials
    if (this.healthPoller) {
      this.healthPoller.notifyCredentialRotated(cameraId);
    }

    return {
      configured: true,
      cameraId,
      credentialType: type,
    };
  }

  /**
   * Safely remove camera credentials with audit logging and active MediaMTX source cleanup
   */
  async removeCredentials(
    cameraId: string,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<{ removed: boolean; cameraId: string }> {
    if (!this.isValidUUID(cameraId)) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid camera UUID format',
      });
    }

    if (!this.credentialStore) {
      throw new BadRequestException({
        error_code: 'CREDENTIAL_STORE_UNAVAILABLE',
        message: 'Encrypted credential storage is not initialized on this instance',
      });
    }

    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      include: {
        streams: true,
      },
    });
    if (!camera) {
      throw new NotFoundException({
        error_code: 'CAMERA_NOT_FOUND',
        message: `Camera with ID '${cameraId}' not found`,
      });
    }

    if (user.role === 'DEPARTMENT_ADMIN' && camera.departmentId !== user.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only remove credentials for their assigned department',
      });
    }

    const removed = await this.credentialStore.removeCredential(cameraId);

    // If camera stream was registered in MediaMTX with credentials, reset source to clean URL
    if (this.mediaGatewayService && camera.isActive && camera.streams && camera.streams.length > 0) {
      const stream = camera.streams[0];
      const cleanUrl = stripCredentialsFromUrl(stream.urlOrHandle);
      if (cleanUrl && this.mediaGatewayService.isPullableExternalSource(cleanUrl)) {
        const pathName = this.mediaGatewayService.normalizePathName(camera.name, camera.id);
        await this.mediaGatewayService.registerPath(pathName, cleanUrl);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'CREDENTIAL_REMOVED',
        resource: 'CameraCredential',
        before: { configured: true },
        after: { configured: false, cameraId },
        correlationId: requestId && requestId.length === 36 ? requestId : null,
      },
    });

    if (this.healthPoller) {
      this.healthPoller.notifyCredentialRotated(cameraId);
    }

    return { removed, cameraId };
  }

  /**
   * Check whether a camera has configured credentials
   */
  async hasCredentials(cameraId: string): Promise<boolean> {
    if (!this.credentialStore) return false;
    return this.credentialStore.hasCredential(cameraId);
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
