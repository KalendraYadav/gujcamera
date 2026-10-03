import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SightingQueryDto } from './dto/sighting-query.dto';
import { TimelineQueryDto } from './dto/timeline-query.dto';

describe('VehiclesService Multi-City Investigation (Phase 6)', () => {
  let service: VehiclesService;
  let prisma: any;

  const mockUser: AuthenticatedUser = {
    id: 'user-investigator-01',
    email: 'investigator@police.gujarat.gov.in',
    role: 'INVESTIGATOR',
    departmentId: 'dept-01',
  };

  const mockSightings = [
    {
      id: 'sighting-ahm-01',
      vehicleId: 'veh-01',
      cameraId: 'cam-ahm-01',
      plateNormalized: 'GJ01AB1234',
      confidence: 0.96,
      consensusOf: 5,
      frameRef: 'evidence/sighting-ahm-01.jpg',
      ts: new Date('2026-10-03T10:00:00Z'),
      bbox: [100, 150, 400, 350],
      camera: {
        id: 'cam-ahm-01',
        name: 'CAM-AHM-01',
        departmentId: 'dept-ahm',
        department: { name: 'Ahmedabad City Police' },
        lat: 23.0225,
        long: 72.5714,
        sourceType: 'SYNTHETIC_STREAM',
        location: {
          address: 'SG Highway Junction, Ahmedabad',
          zone: 'West Zone',
          district: 'Ahmedabad',
        },
      },
      evidence: [
        {
          id: 'ev-01',
          s3Key: 'evidence/sighting-ahm-01.jpg',
          sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ],
    },
    {
      id: 'sighting-ahm-02',
      vehicleId: 'veh-01',
      cameraId: 'cam-ahm-02',
      plateNormalized: 'GJ01AB1234',
      confidence: 0.94,
      consensusOf: 4,
      frameRef: 'evidence/sighting-ahm-02.jpg',
      ts: new Date('2026-10-03T10:10:00Z'),
      bbox: [110, 160, 410, 360],
      camera: {
        id: 'cam-ahm-02',
        name: 'CAM-AHM-02',
        departmentId: 'dept-ahm',
        department: { name: 'Ahmedabad City Police' },
        lat: 23.0734,
        long: 72.5262,
        sourceType: 'SYNTHETIC_STREAM',
        location: {
          address: 'Pakwan Cross Road, SG Highway',
          zone: 'West Zone',
          district: 'Ahmedabad',
        },
      },
      evidence: [],
    },
    {
      id: 'sighting-gnd-02',
      vehicleId: 'veh-01',
      cameraId: 'cam-gnd-02',
      plateNormalized: 'GJ01AB1234',
      confidence: 0.92,
      consensusOf: 6,
      frameRef: 'evidence/sighting-gnd-02.jpg',
      ts: new Date('2026-10-03T10:25:00Z'),
      bbox: [120, 170, 420, 370],
      camera: {
        id: 'cam-gnd-02',
        name: 'CAM-GND-02',
        departmentId: 'dept-gnd',
        department: { name: 'Gandhinagar Police' },
        lat: 23.2384,
        long: 72.6391,
        sourceType: 'SYNTHETIC_STREAM',
        location: {
          address: 'Infocity Circle, Gandhinagar',
          zone: 'Infocity',
          district: 'Gandhinagar',
        },
      },
      evidence: [
        {
          id: 'ev-03',
          s3Key: 'evidence/sighting-gnd-02.jpg',
          sha256Hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        },
      ],
    },
  ];

  beforeEach(async () => {
    prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'veh-01',
          plateNormalized: 'GJ01AB1234',
          make: 'Toyota',
          model: 'Innova',
          color: 'White',
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-01',
          plateNormalized: 'GJ01AB1234',
        }),
      },
      vehicleSighting: {
        findMany: jest.fn().mockImplementation((args) => {
          let list = [...mockSightings];
          const distFilter = args?.where?.camera?.location?.district?.equals || args?.where?.camera?.location?.district?.contains;
          if (distFilter) {
            list = list.filter(
              (s) => s.camera.location.district.toLowerCase() === distFilter.toLowerCase(),
            );
          }
          return Promise.resolve(list);
        }),
        count: jest.fn().mockImplementation((args) => {
          let list = [...mockSightings];
          const distFilter = args?.where?.camera?.location?.district?.equals || args?.where?.camera?.location?.district?.contains;
          if (distFilter) {
            list = list.filter(
              (s) => s.camera.location.district.toLowerCase() === distFilter.toLowerCase(),
            );
          }
          return Promise.resolve(list.length);
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ distance_meters: 15400 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
  });

  it('should return cross-city sightings with city populated on sightings', async () => {
    const query = new SightingQueryDto();
    const result = await service.getVehicleSightings('GJ01AB1234', query, mockUser);

    expect(result.data).toHaveLength(3);
    expect(result.data[0].city).toBe('Ahmedabad');
    expect(result.data[0].camera_name).toBe('CAM-AHM-01');
    expect(result.data[2].city).toBe('Gandhinagar');
    expect(result.data[2].camera_name).toBe('CAM-GND-02');
  });

  it('should filter sightings by city parameter', async () => {
    const query = Object.assign(new SightingQueryDto(), { city: 'Gandhinagar' });
    const result = await service.getVehicleSightings('GJ01AB1234', query, mockUser);

    expect(prisma.vehicleSighting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          camera: { location: { district: { contains: 'Gandhinagar', mode: 'insensitive' } } },
        }),
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].city).toBe('Gandhinagar');
    expect(result.data[0].camera_name).toBe('CAM-GND-02');
  });

  it('should produce chronological spatio-temporal route timeline across cities', async () => {
    const query = new TimelineQueryDto();
    const timeline = await service.getVehicleTimeline('GJ01AB1234', query, mockUser);

    expect(timeline.plate_normalized).toBe('GJ01AB1234');
    expect(timeline.total_sightings).toBe(3);
    expect(timeline.sightings).toHaveLength(3);

    // Sighting 1: Ahmedabad
    expect(timeline.sightings[0].city).toBe('Ahmedabad');
    expect(timeline.sightings[0].camera_name).toBe('CAM-AHM-01');

    // Sighting 3: Gandhinagar
    expect(timeline.sightings[2].city).toBe('Gandhinagar');
    expect(timeline.sightings[2].camera_name).toBe('CAM-GND-02');

    // Cross-city trajectory transitions (route_segments)
    expect(timeline.route_segments).toBeDefined();
    expect(timeline.route_segments.length).toBe(2);
  });
});
