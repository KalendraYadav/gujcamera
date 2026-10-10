import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlertSeverity, AlertStatus } from '@prisma/client';
import { WatchlistBackfillService } from './watchlist-backfill.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertsGateway } from '../alerts/alerts.gateway';
import { AlertsService } from '../alerts/alerts.service';

/**
 * Phase 2 — Historical Watchlist Backfill Engine Test Suite
 * Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
 */
describe('WatchlistBackfillService', () => {
  let service: WatchlistBackfillService;
  let prismaMock: any;
  let configServiceMock: any;
  let alertsGatewayMock: any;
  let alertsServiceMock: any;

  const mockEntryId = 'entry-uuid-1111-2222-3333-4444';
  const mockPlate = 'GJ01AB1234';
  const entryCreatedAt = new Date('2026-10-09T08:00:00.000Z');

  const createMockEntry = (overrides?: any) => ({
    id: mockEntryId,
    watchlistId: 'watchlist-uuid-001',
    plateNormalized: mockPlate,
    category: 'STOLEN_VEHICLE',
    reason: 'FIR #102/2026 Vastrapur PS',
    priority: AlertSeverity.CRITICAL,
    addedBy: 'officer@police.gov.in',
    expiresAt: null,
    active: true,
    createdAt: entryCreatedAt,
    watchlist: {
      id: 'watchlist-uuid-001',
      name: 'Anti-Theft Operation Unit',
      departmentId: 'dept-001',
      department: { id: 'dept-001', name: 'Ahmedabad Crime Branch' },
    },
    ...overrides,
  });

  const createMockSighting = (id: string, plate: string, ts: Date) => ({
    id,
    plateNormalized: plate,
    cameraId: 'cam-uuid-001',
    ts,
    confidence: 0.98,
    consensusOf: 5,
    frameRef: 's3://police-evidence-vault/snap.jpg',
    vehicleClass: 'CAR',
    camera: {
      id: 'cam-uuid-001',
      name: 'CAM-AHM-01: Pakwan Cross Road',
      departmentId: 'dept-001',
      lat: 23.0734,
      long: 72.5262,
      location: {
        address: 'Pakwan Cross Road, SG Highway',
        zone: 'West Zone',
        district: 'Ahmedabad',
      },
      department: { id: 'dept-001', name: 'Ahmedabad Police' },
    },
    vehicle: {
      plateNormalized: plate,
      firstSeen: ts,
      lastSeen: ts,
      attributes: null,
    },
  });

  beforeEach(async () => {
    prismaMock = {
      watchlistEntry: {
        findUnique: jest.fn().mockResolvedValue(createMockEntry()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vehicleSighting: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      alert: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: `alert-gen-${Math.random().toString(36).substring(2, 7)}`,
            sourceSightingId: data.sourceSightingId,
            watchlistEntryId: data.watchlistEntryId,
            severity: data.severity,
            status: data.status,
            ts: data.ts,
            createdAt: new Date(),
            updatedAt: new Date(),
            sighting: createMockSighting(data.sourceSightingId, mockPlate, data.ts),
            watchlistEntry: createMockEntry({ id: data.watchlistEntryId }),
            acknowledgedBy: null,
            resolvedBy: null,
          }),
        ),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
      },
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string, defaultValue: any) => {
        const configMap: Record<string, string> = {
          WATCHLIST_BACKFILL_ENABLED: 'true',
          WATCHLIST_BACKFILL_LOOKBACK_HOURS: '72',
          WATCHLIST_BACKFILL_MAX_LOOKBACK_HOURS: '720',
          WATCHLIST_BACKFILL_BATCH_SIZE: '100',
          WATCHLIST_BACKFILL_MAX_MATCHES: '250',
        };
        return configMap[key] ?? defaultValue;
      }),
    };

    alertsGatewayMock = {
      broadcastAlert: jest.fn(),
    };

    alertsServiceMock = {
      formatAlertResponse: jest.fn().mockImplementation((alert: any) => ({
        id: alert.id,
        severity: alert.severity,
        status: alert.status,
        timestamp: alert.ts,
        match_type: 'HISTORICAL_BACKFILL',
        is_historical: true,
        processed_at: alert.createdAt,
        entry_created_at: alert.watchlistEntry?.createdAt,
        incident_time_relevance: 'UNESTABLISHED_NO_INCIDENT_TIMESTAMP',
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchlistBackfillService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: AlertsGateway, useValue: alertsGatewayMock },
        { provide: AlertsService, useValue: alertsServiceMock },
      ],
    }).compile();

    service = module.get<WatchlistBackfillService>(WatchlistBackfillService);
  });

  describe('Phase F.1 & F.2: Prior Matching Sighting Discovery', () => {
    it('1 & 2. discovers prior matching sightings and generates historical alert', async () => {
      const priorSightingTime = new Date('2026-10-08T14:30:00.000Z'); // 17.5 hours before entry
      const priorSighting = createMockSighting('sighting-prior-01', mockPlate, priorSightingTime);

      prismaMock.vehicleSighting.findMany.mockResolvedValueOnce([priorSighting]);

      const result = await service.processBackfill(mockEntryId);

      expect(result.status).toBe('COMPLETED');
      expect(result.sightingsExamined).toBe(1);
      expect(result.alertsGenerated).toBe(1);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.alertIds).toHaveLength(1);

      // Verify Prisma query bounded by lookback start and entry createdAt
      expect(prismaMock.vehicleSighting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            plateNormalized: mockPlate,
            ts: expect.objectContaining({
              lte: entryCreatedAt,
            }),
          }),
        }),
      );

      // Verify alert was created
      expect(prismaMock.alert.create).toHaveBeenCalledTimes(1);
      expect(alertsGatewayMock.broadcastAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('Phase F.3: Non-Matching Plates Ignored', () => {
    it('3. ignores sightings for other license plates', async () => {
      // Database returns empty array because query filters by plateNormalized
      prismaMock.vehicleSighting.findMany.mockResolvedValueOnce([]);

      const result = await service.processBackfill(mockEntryId);

      expect(result.status).toBe('COMPLETED');
      expect(result.sightingsExamined).toBe(0);
      expect(result.alertsGenerated).toBe(0);
      expect(prismaMock.alert.create).not.toHaveBeenCalled();
    });
  });

  describe('Phase F.4: Sightings Outside Configured Lookback Excluded', () => {
    it('4. strictly bounds historical query within configured lookback window', async () => {
      const customLookbackHours = 24;
      const expectedLookbackStart = new Date(entryCreatedAt.getTime() - customLookbackHours * 3600 * 1000);

      await service.processBackfill(mockEntryId, { lookbackHours: customLookbackHours });

      expect(prismaMock.vehicleSighting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ts: {
              gte: expectedLookbackStart,
              lte: entryCreatedAt,
            },
          }),
        }),
      );
    });
  });

  describe('Phase F.5 & F.6: Alert Classification and Timestamp Preservation', () => {
    it('5 & 6. preserves original observation timestamp and marks result as historical', async () => {
      const originalTs = new Date('2026-10-08T10:15:00.000Z');
      const priorSighting = createMockSighting('sighting-prior-02', mockPlate, originalTs);

      prismaMock.vehicleSighting.findMany.mockResolvedValueOnce([priorSighting]);

      await service.processBackfill(mockEntryId);

      expect(prismaMock.alert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ts: originalTs, // Exactly preserves sighting timestamp
            sourceSightingId: 'sighting-prior-02',
            watchlistEntryId: mockEntryId,
            severity: AlertSeverity.CRITICAL,
          }),
        }),
      );

      expect(alertsServiceMock.formatAlertResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          ts: originalTs,
        }),
      );
    });
  });

  describe('Phase F.7: Idempotency and Duplicate Suppression', () => {
    it('7. repeated execution does not create duplicate historical alerts', async () => {
      const priorSighting = createMockSighting('sighting-prior-03', mockPlate, new Date('2026-10-08T12:00:00.000Z'));
      prismaMock.vehicleSighting.findMany.mockResolvedValueOnce([priorSighting]);

      // Simulate that an alert already exists for this sighting + entry combination
      prismaMock.alert.findFirst.mockResolvedValueOnce({ id: 'existing-alert-999' });

      const result = await service.processBackfill(mockEntryId);

      expect(result.status).toBe('COMPLETED');
      expect(result.sightingsExamined).toBe(1);
      expect(result.alertsGenerated).toBe(0);
      expect(result.duplicatesSkipped).toBe(1);
      expect(prismaMock.alert.create).not.toHaveBeenCalled();
    });
  });

  describe('Phase F.8: Deactivated and Expired Entries Policy', () => {
    it('8a. aborts historical backfill if entry is currently deactivated', async () => {
      prismaMock.watchlistEntry.findUnique.mockResolvedValueOnce(
        createMockEntry({ active: false }),
      );

      const result = await service.processBackfill(mockEntryId);

      expect(result.status).toBe('SKIPPED_INACTIVE_OR_EXPIRED');
      expect(result.reason).toBe('ENTRY_INACTIVE');
      expect(result.alertsGenerated).toBe(0);
      expect(prismaMock.vehicleSighting.findMany).not.toHaveBeenCalled();
    });

    it('8b. aborts historical backfill if entry has expired', async () => {
      const expiredDate = new Date('2026-10-01T00:00:00.000Z'); // Expired in past
      prismaMock.watchlistEntry.findUnique.mockResolvedValueOnce(
        createMockEntry({ expiresAt: expiredDate }),
      );

      const result = await service.processBackfill(mockEntryId);

      expect(result.status).toBe('SKIPPED_INACTIVE_OR_EXPIRED');
      expect(result.reason).toBe('ENTRY_EXPIRED');
      expect(result.alertsGenerated).toBe(0);
      expect(prismaMock.vehicleSighting.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Phase F.9: Independence from Live Matching', () => {
    it('9. historical lookback upper bound prevents matching future live sightings', async () => {
      // The backfill lookbackEnd is strictly bound to entry.createdAt
      await service.processBackfill(mockEntryId);

      const queryArg = prismaMock.vehicleSighting.findMany.mock.calls[0][0];
      expect(queryArg.where.ts.lte.getTime()).toBeLessThanOrEqual(entryCreatedAt.getTime());
    });
  });

  describe('Phase F.10: Audit Trail Recording', () => {
    it('10. records structured audit log for historical alert generation with unestablished incident time disclaimer', async () => {
      const priorSighting = createMockSighting('sighting-audit-01', mockPlate, new Date('2026-10-08T09:00:00.000Z'));
      prismaMock.vehicleSighting.findMany.mockResolvedValueOnce([priorSighting]);

      await service.processBackfill(mockEntryId, {
        actorId: 'usr-admin-01',
        requestId: 'req-corr-1111-2222-3333-444455556666',
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'usr-admin-01',
            action: 'ALERT_CREATE_HISTORICAL',
            resource: 'Alert',
            correlationId: 'req-corr-1111-2222-3333-444455556666',
            after: expect.objectContaining({
              match_type: 'HISTORICAL_BACKFILL',
              incident_time_relevance: 'UNESTABLISHED_NO_INCIDENT_TIMESTAMP',
              plate_normalized: mockPlate,
            }),
          }),
        }),
      );
    });
  });

  describe('Phase F.11: Resilience and Error Isolation', () => {
    it('11. handles unexpected database exception safely without crashing service', async () => {
      prismaMock.vehicleSighting.findMany.mockRejectedValueOnce(
        new Error('Database connection pool timeout'),
      );

      const result = await service.processBackfill(mockEntryId);

      expect(result.status).toBe('ERROR');
      expect(result.reason).toContain('Database connection pool timeout');
    });
  });

  describe('Phase F.12: Multiple Historical Sightings', () => {
    it('12. processes multiple historical sightings across distinct cameras without overwriting', async () => {
      const s1 = createMockSighting('s1', mockPlate, new Date('2026-10-08T10:00:00.000Z'));
      const s2 = createMockSighting('s2', mockPlate, new Date('2026-10-08T11:00:00.000Z'));
      const s3 = createMockSighting('s3', mockPlate, new Date('2026-10-08T12:00:00.000Z'));

      prismaMock.vehicleSighting.findMany.mockResolvedValueOnce([s3, s2, s1]);

      const result = await service.processBackfill(mockEntryId);

      expect(result.status).toBe('COMPLETED');
      expect(result.sightingsExamined).toBe(3);
      expect(result.alertsGenerated).toBe(3);
      expect(result.alertIds).toHaveLength(3);
      expect(prismaMock.alert.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('Asynchronous Trigger Execution', () => {
    it('triggerBackfill executes in background via setImmediate without blocking', async () => {
      const processSpy = jest.spyOn(service, 'processBackfill').mockResolvedValueOnce({
        entryId: mockEntryId,
        plateNormalized: mockPlate,
        status: 'COMPLETED',
        sightingsExamined: 0,
        alertsGenerated: 0,
        duplicatesSkipped: 0,
        alertIds: [],
        durationMs: 5,
      });

      service.triggerBackfill(mockEntryId);

      // Wait for setImmediate microtask
      await new Promise((res) => setTimeout(res, 50));

      expect(processSpy).toHaveBeenCalledWith(mockEntryId, undefined);
    });
  });
});
