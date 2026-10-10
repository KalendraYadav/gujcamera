import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CameraProtocol, OperationalStatus } from '@prisma/client';
import { CamerasService } from './cameras.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProtocolAdapterRegistry } from './adapters/protocol-adapter.registry';
import { MediaGatewayService } from './media-gateway.service';
import { RedisStreamClient } from '../../common/events/redis/redis-stream.client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('CamerasService Dynamic Stream Lifecycle', () => {
  let service: CamerasService;
  let prisma: any;
  let mediaGateway: any;
  let redisClient: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-uuid',
    email: 'admin@gujcamera.local',
    role: 'SUPER_ADMIN',
    departmentId: 'dept-01',
  };

  beforeEach(async () => {
    prisma = {
      department: {
        findUnique: jest.fn().mockResolvedValue({ id: 'dept-01', name: 'Ahmedabad Police' }),
      },
      connector: {
        findUnique: jest.fn().mockResolvedValue({ id: 'conn-01', adapterType: 'RTSP' }),
      },
      cameraStream: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      camera: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      cameraHealth: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    mediaGateway = {
      normalizePathName: jest.fn((name: string) => {
        if (name.includes('CAM-SUR-01')) return 'cam-sur-01';
        return 'cam-test-01';
      }),
      isInternalGatewayStream: jest.fn((url: string) => {
        return url.includes('video-gateway:8554') || url.includes('simulator:8554');
      }),
      isPullableExternalSource: jest.fn((url: string) => {
        return !url.includes('video-gateway') && !url.includes('simulator') && !url.startsWith('mock://') && !url.startsWith('placeholder://');
      }),
      isPlaceholderStream: jest.fn((url: string) => {
        return url.startsWith('mock://') || url.startsWith('placeholder://');
      }),
      registerPath: jest.fn().mockResolvedValue({
        success: true,
        pathName: 'cam-sur-01',
        internalRtspUrl: 'rtsp://video-gateway:8554/cam-sur-01',
        internalHlsUrl: 'http://localhost:8888/cam-sur-01/index.m3u8',
        isExternalSource: true,
      }),
      removePath: jest.fn().mockResolvedValue({ success: true }),
      checkHealth: jest.fn().mockResolvedValue({ isHealthy: true, activePathsCount: 2 }),
    };

    redisClient = {
      hset: jest.fn().mockResolvedValue(1),
      hdel: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn().mockResolvedValue({}),
      pubsubPublish: jest.fn().mockResolvedValue(1),
    };

    const credentialStore = {
      storeCredential: jest.fn().mockResolvedValue({ id: 'cred-1' }),
      removeCredential: jest.fn().mockResolvedValue(true),
      hasCredential: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CamerasService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProtocolAdapterRegistry, useValue: { getAdapter: jest.fn() } },
        { provide: MediaGatewayService, useValue: mediaGateway },
        { provide: RedisStreamClient, useValue: redisClient },
        { provide: require('./credentials/local-encrypted-credential.provider').LocalEncryptedCredentialProvider, useValue: credentialStore },
      ],
    }).compile();

    service = module.get<CamerasService>(CamerasService);
  });

  describe('createCamera with dynamic external RTSP source', () => {
    it('registers path in MediaMTX and publishes ACTIVATE to Redis', async () => {
      const mockCreated = {
        id: 'cam-uuid-001',
        name: 'CAM-SUR-01: Surat Ring Road Junction',
        departmentId: 'dept-01',
        lat: 21.1702,
        long: 72.8311,
        protocol: CameraProtocol.RTSP,
        connectorTypeId: 'conn-01',
        operationalStatus: OperationalStatus.ONLINE,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        streams: [
          {
            id: 'stream-01',
            codec: 'h264',
            resolution: '1920x1080',
            fps: 25,
            urlOrHandle: 'rtsp://video-gateway:8554/cam-sur-01',
          },
        ],
        health: { status: OperationalStatus.ONLINE },
      };

      prisma.camera.create.mockResolvedValue(mockCreated);

      const result = await service.createCamera(
        {
          name: 'CAM-SUR-01: Surat Ring Road Junction',
          department_id: 'dept-01',
          lat: 21.1702,
          long: 72.8311,
          protocol: CameraProtocol.RTSP,
          connector_type_id: 'conn-01',
          stream: {
            url_or_handle: 'rtsp://10.20.4.15:554/Streaming/Channels/102',
            codec: 'h264',
            resolution: '1920x1080',
            fps: 25,
          },
        } as any,
        mockAdminUser,
      );

      // Verify MediaMTX registration called with normalized path
      expect(mediaGateway.normalizePathName).toHaveBeenCalledWith(
        'CAM-SUR-01: Surat Ring Road Junction',
        'pending',
      );
      expect(mediaGateway.registerPath).toHaveBeenCalledWith(
        'cam-sur-01',
        'rtsp://10.20.4.15:554/Streaming/Channels/102',
      );

      // Verify internal RTSP URL stored in DB
      expect(prisma.camera.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            streams: {
              create: expect.objectContaining({
                urlOrHandle: 'rtsp://video-gateway:8554/cam-sur-01',
              }),
            },
          }),
        }),
      );

      // Verify Redis Hash sync and PubSub ACTIVATE event published
      expect(redisClient.hset).toHaveBeenCalledWith(
        'gujcamera:registry:active-streams',
        'cam-uuid-001',
        expect.stringContaining('rtsp://video-gateway:8554/cam-sur-01'),
      );
      expect(redisClient.pubsubPublish).toHaveBeenCalledWith(
        'gujcamera:control:camera-events',
        JSON.stringify({
          action: 'ACTIVATE',
          camera_id: 'cam-uuid-001',
          internal_url: 'rtsp://video-gateway:8554/cam-sur-01',
          path_name: 'cam-sur-01',
        }),
      );

      expect(result.id).toBe('cam-uuid-001');
    });

    it('rejects duplicate stream endpoint', async () => {
      prisma.cameraStream.findFirst.mockResolvedValue({
        id: 'existing-stream-uuid',
        camera: { id: 'cam-other', name: 'Other Camera' },
      });

      await expect(
        service.createCamera(
          {
            name: 'CAM-SUR-01',
            department_id: 'dept-01',
            lat: 21.1702,
            long: 72.8311,
            connector_type_id: 'conn-01',
            stream: { url_or_handle: 'rtsp://duplicate-url:554/live' },
          } as any,
          mockAdminUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('sets status to ERROR when MediaMTX registration fails', async () => {
      mediaGateway.registerPath.mockResolvedValue({
        success: false,
        error: 'Connection refused',
      });

      prisma.camera.create.mockImplementation((args: any) => ({
        id: 'cam-uuid-failed',
        name: args.data.name,
        operationalStatus: args.data.operationalStatus,
        isActive: true,
        streams: [],
      }));

      await service.createCamera(
        {
          name: 'CAM-SUR-01',
          department_id: 'dept-01',
          lat: 21.1702,
          long: 72.8311,
          connector_type_id: 'conn-01',
          stream: { url_or_handle: 'rtsp://unreachable-camera:554/live' },
        } as any,
        mockAdminUser,
      );

      expect(prisma.camera.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operationalStatus: OperationalStatus.ERROR,
          }),
        }),
      );
      // When status is ERROR, it should not publish ACTIVATE to AI Worker
      expect(redisClient.pubsubPublish).not.toHaveBeenCalled();
    });
  });

  describe('decommissionCamera dynamic deactivation', () => {
    it('deactivates MediaMTX path and publishes DEACTIVATE event', async () => {
      const validCamId = 'c1111111-0000-0000-0000-000000000001';
      const existingCam = {
        id: validCamId,
        name: 'CAM-SUR-01: Surat Ring Road',
        departmentId: 'dept-01',
        isActive: true,
        operationalStatus: OperationalStatus.ONLINE,
      };

      prisma.camera.findUnique.mockResolvedValue(existingCam);
      prisma.camera.update.mockResolvedValue({ ...existingCam, isActive: false });

      const result = await service.decommissionCamera(validCamId, mockAdminUser);

      expect(result.is_active).toBe(false);
      expect(mediaGateway.removePath).toHaveBeenCalledWith('cam-sur-01');
      expect(redisClient.hdel).toHaveBeenCalledWith(
        'gujcamera:registry:active-streams',
        validCamId,
      );
      expect(redisClient.pubsubPublish).toHaveBeenCalledWith(
        'gujcamera:control:camera-events',
        JSON.stringify({
          action: 'DEACTIVATE',
          camera_id: validCamId,
          path_name: 'cam-sur-01',
        }),
      );
    });
  });

  describe('updateCamera dynamic synchronization', () => {
    it('updates Redis and MediaMTX on active camera modification', async () => {
      const validCamId = 'c1111111-0000-0000-0000-000000000001';
      const existingCam = {
        id: validCamId,
        name: 'CAM-SUR-01',
        departmentId: 'dept-01',
        isActive: true,
        operationalStatus: OperationalStatus.ONLINE,
      };

      const updatedCam = {
        ...existingCam,
        name: 'CAM-SUR-01: Renamed Junction',
        streams: [{ urlOrHandle: 'rtsp://video-gateway:8554/cam-sur-01' }],
      };

      prisma.camera.findUnique.mockResolvedValue(existingCam);
      prisma.camera.update.mockResolvedValue(updatedCam);

      await service.updateCamera(
        validCamId,
        { name: 'CAM-SUR-01: Renamed Junction' } as any,
        mockAdminUser,
      );

      expect(redisClient.hset).toHaveBeenCalledWith(
        'gujcamera:registry:active-streams',
        validCamId,
        expect.stringContaining('CAM-SUR-01: Renamed Junction'),
      );
      expect(redisClient.pubsubPublish).toHaveBeenCalledWith(
        'gujcamera:control:camera-events',
        expect.stringContaining('"action":"ACTIVATE"'),
      );
    });
  });

  describe('configureCredentials and removeCredentials lifecycle', () => {
    const validCamId = 'c1111111-0000-0000-0000-000000000001';

    it('rotates credentials, constructs authenticated URL in backend memory ONLY, and updates MediaMTX', async () => {
      const activeCam = {
        id: validCamId,
        name: 'CAM-SUR-01',
        departmentId: 'dept-01',
        isActive: true,
        operationalStatus: OperationalStatus.ONLINE,
        streams: [{ urlOrHandle: 'rtsp://10.20.4.15:554/Streaming/Channels/102' }],
      };

      prisma.camera.findUnique.mockResolvedValue(activeCam);
      mediaGateway.registerPath.mockResolvedValue({ success: true, pathName: 'cam-sur-01' });

      const result = await service.configureCredentials(
        validCamId,
        { username: 'admin', password: 'NewRotatedPass2026' },
        mockAdminUser,
      );

      expect(result.configured).toBe(true);
      expect(result.cameraId).toBe(validCamId);
      // MediaMTX receives memory-constructed authenticated source
      expect(mediaGateway.registerPath).toHaveBeenCalledWith(
        'cam-sur-01',
        'rtsp://admin:NewRotatedPass2026@10.20.4.15:554/Streaming/Channels/102',
      );
      // Response must never contain password
      expect(JSON.stringify(result)).not.toContain('NewRotatedPass2026');
      // Audit log must have recorded CREDENTIAL_UPDATED
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREDENTIAL_UPDATED',
            resource: 'CameraCredential',
          }),
        }),
      );
    });

    it('handles MediaMTX failure during rotation by marking camera status ERROR', async () => {
      const activeCam = {
        id: validCamId,
        name: 'CAM-SUR-01',
        departmentId: 'dept-01',
        isActive: true,
        operationalStatus: OperationalStatus.ONLINE,
        streams: [{ urlOrHandle: 'rtsp://10.20.4.15:554/Streaming/Channels/102' }],
      };

      prisma.camera.findUnique.mockResolvedValue(activeCam);
      mediaGateway.registerPath.mockResolvedValue({
        success: false,
        error: 'MediaMTX connection refused',
      });

      await expect(
        service.configureCredentials(
          validCamId,
          { username: 'admin', password: 'NewRotatedPass2026' },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.camera.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: validCamId },
          data: { operationalStatus: OperationalStatus.ERROR },
        }),
      );
    });

    it('removes credentials, resets MediaMTX source to clean URL, and emits CREDENTIAL_REMOVED', async () => {
      const activeCam = {
        id: validCamId,
        name: 'CAM-SUR-01',
        departmentId: 'dept-01',
        isActive: true,
        operationalStatus: OperationalStatus.ONLINE,
        streams: [{ urlOrHandle: 'rtsp://10.20.4.15:554/Streaming/Channels/102' }],
      };

      prisma.camera.findUnique.mockResolvedValue(activeCam);

      const result = await service.removeCredentials(validCamId, mockAdminUser);

      expect(result.removed).toBe(true);
      expect(result.cameraId).toBe(validCamId);
      // Resets MediaMTX source to clean uncredentialed URL
      expect(mediaGateway.registerPath).toHaveBeenCalledWith(
        'cam-sur-01',
        'rtsp://10.20.4.15:554/Streaming/Channels/102',
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREDENTIAL_REMOVED',
            resource: 'CameraCredential',
          }),
        }),
      );
    });
  });

  describe('onModuleInit startup camera fleet synchronization', () => {
    it('populates Redis registry for active cameras and publishes SYNC only after population', async () => {
      const callOrder: string[] = [];
      const activeCameras = [
        {
          id: 'cam-01',
          name: 'CAM-AHM-01: Pakwan Crossroad',
          operationalStatus: OperationalStatus.ONLINE,
          isActive: true,
          streams: [{ urlOrHandle: 'rtsp://simulator:8554/live/cam-ahm-01' }],
        },
        {
          id: 'cam-02',
          name: 'CAM-SUR-01: Ring Road',
          operationalStatus: OperationalStatus.ONLINE,
          isActive: true,
          streams: [{ urlOrHandle: 'rtsp://simulator:8554/live/cam-sur-01' }],
        },
      ];

      prisma.camera.findMany.mockResolvedValue(activeCameras);
      redisClient.hgetall.mockResolvedValue({
        'cam-01': 'existing',
        'stale-cam-03': 'stale',
      });

      redisClient.hset.mockImplementation(async () => {
        callOrder.push('hset');
        return 1;
      });
      redisClient.hdel.mockImplementation(async () => {
        callOrder.push('hdel');
        return 1;
      });
      redisClient.pubsubPublish.mockImplementation(async () => {
        callOrder.push('pubsubPublish');
        return 1;
      });

      await service.onModuleInit();

      // Verify active cameras synced to hash
      expect(redisClient.hset).toHaveBeenCalledTimes(2);
      expect(redisClient.hset).toHaveBeenCalledWith(
        'gujcamera:registry:active-streams',
        'cam-01',
        expect.stringContaining('rtsp://simulator:8554/live/cam-ahm-01'),
      );
      expect(redisClient.hset).toHaveBeenCalledWith(
        'gujcamera:registry:active-streams',
        'cam-02',
        expect.stringContaining('rtsp://simulator:8554/live/cam-sur-01'),
      );

      // Verify stale camera pruned
      expect(redisClient.hdel).toHaveBeenCalledWith(
        'gujcamera:registry:active-streams',
        'stale-cam-03',
      );

      // Verify SYNC published to existing control channel
      expect(redisClient.pubsubPublish).toHaveBeenCalledWith(
        'gujcamera:control:camera-events',
        expect.stringContaining('"action":"SYNC"'),
      );

      // Verify SYNC was published AFTER registry population
      const lastHsetIdx = callOrder.lastIndexOf('hset');
      const lastHdelIdx = callOrder.lastIndexOf('hdel');
      const pubsubIdx = callOrder.indexOf('pubsubPublish');
      expect(pubsubIdx).toBeGreaterThan(lastHsetIdx);
      expect(pubsubIdx).toBeGreaterThan(lastHdelIdx);
    });

    it('sanitizes stream credentials before writing to Redis active-streams hash', async () => {
      const cameraWithCreds = [
        {
          id: 'cam-cred-01',
          name: 'CAM-SECURE-01',
          operationalStatus: OperationalStatus.ONLINE,
          isActive: true,
          streams: [{ urlOrHandle: 'rtsp://admin:SecretPass123!@10.20.4.15:554/live' }],
        },
      ];

      prisma.camera.findMany.mockResolvedValue(cameraWithCreds);
      redisClient.hgetall.mockResolvedValue({});

      await service.onModuleInit();

      expect(redisClient.hset).toHaveBeenCalledWith(
        'gujcamera:registry:active-streams',
        'cam-cred-01',
        expect.not.stringContaining('SecretPass123!'),
      );
    });

    it('handles Redis failure gracefully during startup without throwing', async () => {
      prisma.camera.findMany.mockResolvedValue([
        {
          id: 'cam-01',
          name: 'CAM-01',
          operationalStatus: OperationalStatus.ONLINE,
          isActive: true,
          streams: [{ urlOrHandle: 'rtsp://video-gateway:8554/cam-01' }],
        },
      ]);
      redisClient.hset.mockRejectedValue(new Error('Redis connection refused'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });
});

