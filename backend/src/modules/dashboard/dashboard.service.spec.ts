import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisStreamClient } from '../../common/events/redis/redis-stream.client';
import { SightingEventConsumer } from '../../common/events/consumers/sighting-event.consumer';
import { MediaGatewayService } from '../cameras/media-gateway.service';
import { CamerasService } from '../cameras/cameras.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { OperationalStatus, AlertSeverity, AlertStatus } from '@prisma/client';

describe('DashboardService (Phase 9 Operational Command Center)', () => {
  let service: DashboardService;
  let prisma: any;
  let redisClient: any;
  let sightingConsumer: any;
  let mediaGatewayService: any;
  let camerasService: any;

  const mockUser: AuthenticatedUser = {
    id: 'user-op-1',
    email: 'operator.demo@gujcamera.local',
    role: 'OPERATOR',
    departmentId: 'dept-ahm-1',
  };

  beforeEach(async () => {
    prisma = {
      checkHealth: jest.fn().mockResolvedValue({ isHealthy: true, details: { db: 'ok' } }),
      camera: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cam-1',
            name: 'CAM-AHM-01: SG Highway',
            operationalStatus: OperationalStatus.ONLINE,
            location: { district: 'Ahmedabad', address: 'SG Highway' },
            _count: { sightings: 10 },
          },
          {
            id: 'cam-2',
            name: 'CAM-SUR-01: Dumas Road',
            operationalStatus: OperationalStatus.ONLINE,
            location: { district: 'Surat', address: 'Dumas Road' },
            _count: { sightings: 5 },
          },
          {
            id: 'cam-3',
            name: 'CAM-DEMO-01: Expressway Corridor',
            operationalStatus: OperationalStatus.ONLINE,
            location: { district: 'Ahmedabad', address: 'NE-1 Expressway' },
            _count: { sightings: 8 },
          },
        ]),
      },
      alert: {
        count: jest.fn().mockImplementation((args) => {
          if (args?.where?.severity === AlertSeverity.CRITICAL) return Promise.resolve(1);
          if (args?.where?.severity === AlertSeverity.HIGH) return Promise.resolve(2);
          if (args?.where?.severity === AlertSeverity.MEDIUM) return Promise.resolve(0);
          return Promise.resolve(3);
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'alert-001',
            severity: AlertSeverity.CRITICAL,
            status: AlertStatus.NEW,
            ts: new Date('2026-09-09T10:10:00Z'),
            sighting: {
              cameraId: 'cam-1',
              plateNormalized: 'GJ01AB1234',
              camera: {
                name: 'CAM-AHM-01: SG Highway',
                location: { district: 'Ahmedabad' },
              },
            },
            watchlistEntry: {
              plateNormalized: 'GJ01AB1234',
              category: 'STOLEN_VEHICLE',
              priority: 'CRITICAL',
              reason: 'Stolen Creta',
            },
          },
        ]),
      },
      watchlist: {
        count: jest.fn().mockResolvedValue(2),
      },
      watchlistEntry: {
        count: jest.fn().mockResolvedValue(3),
      },
      vehicleSighting: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sight-1',
            plateNormalized: 'GJ01AB1234',
            ts: new Date('2026-09-09T10:00:00Z'),
            confidence: 0.95,
            consensusOf: 6,
            frameRef: 's3://vault/sight-1.jpg',
            camera: {
              name: 'CAM-AHM-01: SG Highway',
              location: { district: 'Ahmedabad' },
            },
            alerts: [{ id: 'alert-001' }],
          },
        ]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            ts: new Date('2026-09-09T10:15:00Z'),
            action: 'VEHICLE_SEARCH',
            resource: 'Vehicle',
            actor: {
              email: 'investigator.demo@gujcamera.local',
              role: { name: 'INVESTIGATOR' },
            },
            after: { plate_normalized: 'GJ01AB1234' },
          },
        ]),
      },
    };

    redisClient = {
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    sightingConsumer = {
      totalEventsReceived: 100,
      totalSightingsPersisted: 98,
      totalProcessingErrors: 0,
    };

    mediaGatewayService = {
      checkHealth: jest.fn().mockResolvedValue({ isHealthy: true }),
    };

    camerasService = {
      getCameraHealthSummary: jest.fn().mockResolvedValue({
        total_cameras: 15,
        online: 13,
        degraded: 1,
        offline: 1,
        error: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisStreamClient, useValue: redisClient },
        { provide: SightingEventConsumer, useValue: sightingConsumer },
        { provide: MediaGatewayService, useValue: mediaGatewayService },
        { provide: CamerasService, useValue: camerasService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('aggregates complete operational command center summary', async () => {
    const summary = await service.getOperationalSummary(mockUser);

    expect(summary).toBeDefined();
    expect(summary.system.database).toBe('HEALTHY');
    expect(summary.system.postgis).toBe('HEALTHY');
    expect(summary.system.event_pipeline).toBe('HEALTHY');
    expect(summary.system.stream_gateway).toBe('HEALTHY');
    expect(summary.system.ai_pipeline).toBe('HEALTHY');
    expect(summary.system.camera_network).toBe('DEGRADED');

    expect(summary.cameras.total).toBe(15);
    expect(summary.cameras.online).toBe(13);
    expect(summary.cameras.configured_prototype_sources).toBe(15);

    expect(summary.alerts.total_active).toBe(3);
    expect(summary.alerts.critical).toBe(1);
    expect(summary.alerts.recent.length).toBe(1);
    expect(summary.alerts.recent[0].plate).toBe('GJ01AB1234');

    expect(summary.watchlists.total_watchlists).toBe(2);
    expect(summary.watchlists.active_entries).toBe(3);
    expect(summary.watchlists.recent_matches.length).toBe(1);

    expect(summary.sightings.recent_observations.length).toBe(1);
    expect(summary.sightings.recent_observations[0].has_evidence).toBe(true);

    expect(summary.jurisdictions.length).toBe(6);
    const ahm = summary.jurisdictions.find((j) => j.id === 'ahmedabad');
    expect(ahm).toBeDefined();
    expect(ahm?.total_cameras).toBe(1);

    const exp = summary.jurisdictions.find((j) => j.id === 'expressway');
    expect(exp).toBeDefined();
    expect(exp?.total_cameras).toBe(1);

    expect(summary.investigations.recent_events.length).toBe(1);
    expect(summary.investigations.recent_events[0].action).toBe('VEHICLE_SEARCH');

    expect(summary.disclaimer).toContain('NETRAVA correlates discrete CCTV sightings');
  });

  it('handles offline or degraded subsystems gracefully without 500 error', async () => {
    prisma.checkHealth.mockRejectedValue(new Error('DB Timeout'));
    redisClient.isHealthy.mockResolvedValue(false);
    mediaGatewayService.checkHealth.mockResolvedValue({ isHealthy: false });

    const summary = await service.getOperationalSummary(mockUser);

    expect(summary).toBeDefined();
    expect(summary.system.database).toBe('UNAVAILABLE');
    expect(summary.system.event_pipeline).toBe('DEGRADED');
    expect(summary.system.stream_gateway).toBe('DEGRADED');
    expect(summary.system.ai_pipeline).toBe('DEGRADED');
  });
});
