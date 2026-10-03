import { Test, TestingModule } from '@nestjs/testing';
import { CameraProtocol, OperationalStatus } from '@prisma/client';
import { CamerasService } from './cameras.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProtocolAdapterRegistry } from './adapters/protocol-adapter.registry';
import { MediaGatewayService } from './media-gateway.service';
import { RedisStreamClient } from '../../common/events/redis/redis-stream.client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CameraQueryDto } from './dto/camera-query.dto';

describe('CamerasService Multi-City & Source Provenance (Phase 6)', () => {
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

  const sampleCameras = [
    {
      id: 'c1111111-1111-1111-1111-111111111111',
      name: 'CAM-AHM-01',
      protocol: CameraProtocol.RTSP,
      operational_status: OperationalStatus.ONLINE,
      is_active: true,
      source_type: 'SYNTHETIC_STREAM',
      department_id: 'dept-ahm',
      department: { name: 'Ahmedabad City Police' },
      location: {
        address: 'SG Highway Junction',
        zone: 'West Zone',
        district: 'Ahmedabad',
        latitude: 23.0225,
        longitude: 72.5714,
      },
      streams: [{ id: 's1', codec: 'H264', resolution: '1920x1080', fps: 30, url_or_handle: 'rtsp://video-gateway:8554/cam-ahm-01' }],
      health: { status: OperationalStatus.ONLINE, last_heartbeat: new Date() },
    },
    {
      id: 'c2222222-2222-2222-2222-222222222222',
      name: 'CAM-SUR-01',
      protocol: CameraProtocol.RTSP,
      operational_status: OperationalStatus.ONLINE,
      is_active: true,
      source_type: 'RESEARCH_VIDEO',
      department_id: 'dept-sur',
      department: { name: 'Surat City Police' },
      location: {
        address: 'Ring Road Chowk',
        zone: 'South Zone',
        district: 'Surat',
        latitude: 21.1702,
        longitude: 72.8311,
      },
      streams: [{ id: 's2', codec: 'H264', resolution: '1920x1080', fps: 25, url_or_handle: 'rtsp://video-gateway:8554/cam-sur-01' }],
      health: { status: OperationalStatus.ONLINE, last_heartbeat: new Date() },
    },
    {
      id: 'c3333333-3333-3333-3333-333333333333',
      name: 'CAM-VAD-01',
      protocol: CameraProtocol.RTSP,
      operational_status: OperationalStatus.ONLINE,
      is_active: true,
      source_type: 'RESEARCH_VIDEO',
      department_id: 'dept-vad',
      department: { name: 'Vadodara City Police' },
      location: {
        address: 'Sayajigunj Circle',
        zone: 'Central Zone',
        district: 'Vadodara',
        latitude: 22.3072,
        longitude: 73.1812,
      },
      streams: [{ id: 's3', codec: 'H264', resolution: '1920x1080', fps: 25, url_or_handle: 'rtsp://video-gateway:8554/cam-vad-01' }],
      health: { status: OperationalStatus.ONLINE, last_heartbeat: new Date() },
    },
  ];

  beforeEach(async () => {
    prisma = {
      camera: {
        findMany: jest.fn().mockImplementation((args) => {
          let list = [...sampleCameras];
          const districtFilter = args?.where?.location?.district?.contains || args?.where?.location?.district?.equals;
          if (districtFilter) {
            list = list.filter((c) => c.location.district.toLowerCase().includes(districtFilter.toLowerCase()));
          }
          if (args?.where?.source_type) {
            list = list.filter((c) => c.source_type === args.where.source_type);
          }
          return Promise.resolve(list);
        }),
        count: jest.fn().mockResolvedValue(sampleCameras.length),
        findUnique: jest.fn(),
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
      normalizePathName: jest.fn((name: string) => name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')),
      removePath: jest.fn().mockResolvedValue({ success: true, pathName: 'cam-sur-01' }),
    };

    redisClient = {
      hdel: jest.fn().mockResolvedValue(1),
      pubsubPublish: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CamerasService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProtocolAdapterRegistry, useValue: {} },
        { provide: MediaGatewayService, useValue: mediaGateway },
        { provide: RedisStreamClient, useValue: redisClient },
      ],
    }).compile();

    service = module.get<CamerasService>(CamerasService);
  });

  describe('Multi-City Camera Filtering', () => {
    it('should filter cameras by city (district)', async () => {
      const query = Object.assign(new CameraQueryDto(), { city: 'Surat' });
      const result = await service.findCameras(query);

      expect(prisma.camera.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            location: { district: { contains: 'Surat', mode: 'insensitive' } },
          }),
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('CAM-SUR-01');
      expect(result.data[0].location?.district).toBe('Surat');
    });

    it('should filter cameras by source_type (e.g. RESEARCH_VIDEO)', async () => {
      const query = Object.assign(new CameraQueryDto(), { source_type: 'RESEARCH_VIDEO' });
      const result = await service.findCameras(query);

      expect(result.data).toHaveLength(2);
      expect(result.data.every((c) => c.source_type === 'RESEARCH_VIDEO')).toBe(true);
    });

    it('should preserve source_type and city on sanitized camera models', async () => {
      const query = new CameraQueryDto();
      const result = await service.findCameras(query);

      expect(result.data).toHaveLength(3);
      const ahmCam = result.data.find((c) => c.id === 'c1111111-1111-1111-1111-111111111111');
      expect(ahmCam).toBeDefined();
      expect(ahmCam?.source_type).toBe('SYNTHETIC_STREAM');
      expect((ahmCam?.location as any)?.city).toBe('Ahmedabad');

      const surCam = result.data.find((c) => c.id === 'c2222222-2222-2222-2222-222222222222');
      expect(surCam?.source_type).toBe('RESEARCH_VIDEO');
      expect((surCam?.location as any)?.city).toBe('Surat');
    });
  });

  describe('Camera Decommission Isolation', () => {
    it('should decommission target camera without modifying or disrupting sibling cameras', async () => {
      prisma.camera.findUnique.mockResolvedValue(sampleCameras[1]); // cam-sur-01
      prisma.camera.update.mockResolvedValue({
        ...sampleCameras[1],
        isActive: false,
        operationalStatus: OperationalStatus.OFFLINE,
      });

      const response = await service.decommissionCamera('c2222222-2222-2222-2222-222222222222', mockAdminUser);

      expect(response.id).toBe('c2222222-2222-2222-2222-222222222222');
      expect(response.is_active).toBe(false);
      expect(response.operational_status).toBe('OFFLINE');

      // Verify media gateway unregisters ONLY the target path
      expect(mediaGateway.removePath).toHaveBeenCalledWith('cam-sur-01');
      expect(mediaGateway.removePath).toHaveBeenCalledTimes(1);

      // Verify Redis stream removal was sent for the target camera
      expect(redisClient.hdel).toHaveBeenCalledWith('gujcamera:registry:active-streams', 'c2222222-2222-2222-2222-222222222222');
      expect(redisClient.pubsubPublish).toHaveBeenCalledWith(
        'gujcamera:control:camera-events',
        JSON.stringify({
          action: 'DEACTIVATE',
          camera_id: 'c2222222-2222-2222-2222-222222222222',
          path_name: 'cam-sur-01',
        }),
      );
    });
  });
});
