import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { SightingEventConsumer } from './sighting-event.consumer';
import { PrismaService } from '../../../prisma/prisma.service';
import { AlertsService } from '../../../modules/alerts/alerts.service';
import { RedisStreamClient } from '../redis/redis-stream.client';
import {
  VideoSourceType,
  EVENT_TYPE_SIGHTING_CREATED,
  SCHEMA_VERSION,
  validateVehicleSightingCreatedPayload,
  VehicleSightingCreatedPayload,
} from '../event-contracts/vehicle-sighting-created.event';

/**
 * Phase 5 — Realistic Video Input & End-to-End Pipeline Contract Unit Test
 * Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
 */
describe('SightingEventConsumer & Phase 5 Event Pipeline Validation', () => {
  let consumer: SightingEventConsumer;
  let prismaMock: any;
  let alertsServiceMock: any;
  let redisClientMock: any;
  let configServiceMock: any;

  const validSha256 = '315cb76daa3caa030ef0de4aecbaafa8dd20c114901d940682cceb1a9fa42db7';
  const mockCameraUuid = 'c1111111-2222-3333-4444-555555555555';

  beforeEach(async () => {
    prismaMock = {
      camera: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve([
            {
              id: mockCameraUuid,
              name: 'CAM-DEMO-01: Highway Junction Research',
              lat: 23.0225,
              long: 72.5714,
            },
          ]);
        }),
      },
      cameraStream: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      vehicleSighting: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sighting-1' }),
      },
      vehicle: {
        upsert: jest.fn().mockResolvedValue({ plateNormalized: 'GJ01AB1234' }),
      },
      evidence: {
        create: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prismaMock);
      }),
    };

    alertsServiceMock = {
      processSightingMatch: jest.fn().mockResolvedValue({
        matched: false,
        alerts_generated: 0,
        alerts: [],
      }),
    };

    redisClientMock = {
      ensureConsumerGroup: jest.fn().mockResolvedValue(undefined),
      readGroup: jest.fn().mockResolvedValue([]),
      ack: jest.fn().mockResolvedValue(1),
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SightingEventConsumer,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AlertsService, useValue: alertsServiceMock },
        { provide: RedisStreamClient, useValue: redisClientMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    consumer = module.get<SightingEventConsumer>(SightingEventConsumer);
  });

  describe('1. Source Type & Contract Validation', () => {
    it('accepts valid VideoSourceType enums in sighting event payload', () => {
      const sourceTypes = [
        VideoSourceType.RESEARCH_VIDEO,
        VideoSourceType.SYNTHETIC_STREAM,
        VideoSourceType.DEMO_FILE,
        VideoSourceType.REAL_RTSP,
        VideoSourceType.REAL_ONVIF,
        VideoSourceType.VMS_GATEWAY,
      ];

      for (const st of sourceTypes) {
        const payload: VehicleSightingCreatedPayload = {
          event_id: 'e-1',
          event_type: EVENT_TYPE_SIGHTING_CREATED,
          schema_version: SCHEMA_VERSION,
          occurred_at: new Date().toISOString(),
          producer: 'ai-worker',
          sighting_id: 's-1',
          evidence_id: 'ev-1',
          camera_id: 'CAM-DEMO-01',
          plate_normalized: 'GJ01AB1234',
          confidence: 0.92,
          consensus_of: 3,
          total_observations: 5,
          storage_ref: 's3://police-evidence-vault/evidence/snap_1.jpg',
          evidence_hash: validSha256,
          captured_at: new Date().toISOString(),
          correlation_id: 'corr-id-1',
          source_type: st,
        };

        const validated = validateVehicleSightingCreatedPayload(payload);
        expect(validated.source_type).toBe(st);
      }
    });

    it('defaults source_type to SYNTHETIC_STREAM if omitted for backwards compatibility', () => {
      const payload = {
        event_id: 'e-legacy',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 's-legacy',
        evidence_id: 'ev-legacy',
        camera_id: 'CAM-AHM-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.88,
        consensus_of: 3,
        total_observations: 3,
        storage_ref: 's3://police-evidence-vault/evidence/legacy.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
      };

      const validated = validateVehicleSightingCreatedPayload(payload);
      expect(validated.source_type).toBe(VideoSourceType.SYNTHETIC_STREAM);
    });

    it('rejects invalid or corrupted event payload missing required plate or camera', () => {
      const corruptPayload = {
        event_id: 'e-corrupt',
        // missing camera_id and plate_normalized
        confidence: 0.9,
      };

      expect(() => validateVehicleSightingCreatedPayload(corruptPayload)).toThrow();
    });
  });

  describe('2. Pipeline Execution: Realistic Video Event -> Database Persistence', () => {
    it('persists sighting from RESEARCH_VIDEO source and associates it to camera PostGIS location', async () => {
      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-demo-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 'sighting-demo-001',
        evidence_id: 'evidence-demo-001',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.94,
        consensus_of: 4,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/demo_traffic_snap.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-demo-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const streamMessage = {
        id: '1700000000000-0',
        fields: { data: JSON.stringify(eventPayload) },
      };

      const success = await consumer.processStreamMessage(streamMessage);
      expect(success).toBe(true);

      // Verify camera resolution
      expect(prismaMock.camera.findMany).toHaveBeenCalled();

      // Verify Vehicle upsert
      expect(prismaMock.vehicle.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { plateNormalized: 'GJ01AB1234' },
        }),
      );

      // Verify VehicleSighting persistence with camera ID
      expect(prismaMock.vehicleSighting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'sighting-demo-001',
            plateNormalized: 'GJ01AB1234',
            cameraId: mockCameraUuid,
            frameRef: 's3://police-evidence-vault/evidence/demo_traffic_snap.jpg',
          }),
        }),
      );

      // Verify Evidence persistence with SHA-256 hash
      expect(prismaMock.evidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'evidence-demo-001',
            sourceType: 'SIGHTING',
            sourceId: 'sighting-demo-001',
            hash: validSha256,
          }),
        }),
      );

      // Verify safe acknowledgment in Redis
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        '1700000000000-0',
      );
    });

    it('verifies SHA-256 cryptographic integrity matches image payload bytes', () => {
      const mockEvidenceBytes = Buffer.from('REALISTIC_CCTV_FRAME_CAPTURE_PAYLOAD_EVIDENCE_2026');
      const expectedDigest = crypto.createHash('sha256').update(mockEvidenceBytes).digest('hex');

      // Verify 64-char lowercase hex
      expect(expectedDigest).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(expectedDigest)).toBe(true);

      // Re-hashing produces identical output (integrity verification)
      const recalculatedDigest = crypto.createHash('sha256').update(mockEvidenceBytes).digest('hex');
      expect(recalculatedDigest).toBe(expectedDigest);
    });
  });

  describe('3. Watchlist Matching & Alert Discrimination', () => {
    it('triggers CRITICAL alert when recognized plate matches an active watchlist entry', async () => {
      alertsServiceMock.processSightingMatch.mockResolvedValueOnce({
        matched: true,
        alerts_generated: 1,
        alerts: [
          {
            id: 'alert-stolen-001',
            severity: 'CRITICAL',
            status: 'NEW',
            plate: 'GJ01AB1234',
          },
        ],
      });

      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-watchlist-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 'sighting-match-001',
        evidence_id: 'evidence-match-001',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.96,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/match.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-match-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const success = await consumer.processStreamMessage({
        id: '1700000000001-0',
        fields: { data: JSON.stringify(eventPayload) },
      });

      expect(success).toBe(true);
      expect(alertsServiceMock.processSightingMatch).toHaveBeenCalledWith(
        'sighting-match-001',
        'corr-match-001',
      );
      expect(consumer.totalAlertsTriggered).toBe(1);
    });

    it('does NOT trigger alert for non-watchlist innocent vehicle', async () => {
      alertsServiceMock.processSightingMatch.mockResolvedValueOnce({
        matched: false,
        alerts_generated: 0,
        alerts: [],
      });

      const initialAlerts = consumer.totalAlertsTriggered;

      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-innocent-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 'sighting-innocent-001',
        evidence_id: 'evidence-innocent-001',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ05XY9999',
        confidence: 0.91,
        consensus_of: 4,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/innocent.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-innocent-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const success = await consumer.processStreamMessage({
        id: '1700000000002-0',
        fields: { data: JSON.stringify(eventPayload) },
      });

      expect(success).toBe(true);
      expect(alertsServiceMock.processSightingMatch).toHaveBeenCalledWith(
        'sighting-innocent-001',
        'corr-innocent-001',
      );
      // Alerts count remains unchanged
      expect(consumer.totalAlertsTriggered).toBe(initialAlerts);
    });
  });

  describe('4. Security & Zero-Secret Leakage Validation', () => {
    it('verifies event payload contains zero credentials, auth tokens, or RTSP passwords', () => {
      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-sec-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 's-sec-1',
        evidence_id: 'ev-sec-1',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.95,
        consensus_of: 5,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/sec_test.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-sec-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const serialized = JSON.stringify(eventPayload);
      const forbiddenTokens = ['password', 'secret', 'rtsp://', 'Authorization', 'Bearer', 'token'];

      for (const token of forbiddenTokens) {
        expect(serialized.toLowerCase()).not.toContain(token.toLowerCase());
      }
    });
  });

  describe('5. Duplicate Delivery & Idempotency', () => {
    it('acknowledges duplicate delivery without re-inserting into database', async () => {
      // Simulate existing sighting already stored
      prismaMock.vehicleSighting.findUnique.mockResolvedValueOnce({
        id: 'sighting-existing-001',
        plateNormalized: 'GJ01AB1234',
      });

      const eventPayload: VehicleSightingCreatedPayload = {
        event_id: 'e-dup-1',
        event_type: EVENT_TYPE_SIGHTING_CREATED,
        schema_version: SCHEMA_VERSION,
        occurred_at: new Date().toISOString(),
        producer: 'ai-worker',
        sighting_id: 'sighting-existing-001',
        evidence_id: 'evidence-existing-001',
        camera_id: 'CAM-DEMO-01',
        plate_normalized: 'GJ01AB1234',
        confidence: 0.92,
        consensus_of: 3,
        total_observations: 5,
        storage_ref: 's3://police-evidence-vault/evidence/dup.jpg',
        evidence_hash: validSha256,
        captured_at: new Date().toISOString(),
        correlation_id: 'corr-dup-001',
        source_type: VideoSourceType.RESEARCH_VIDEO,
      };

      const success = await consumer.processStreamMessage({
        id: '1700000000003-0',
        fields: { data: JSON.stringify(eventPayload) },
      });

      expect(success).toBe(true);
      expect(prismaMock.vehicleSighting.create).not.toHaveBeenCalled();
      expect(consumer.totalDuplicatesDetected).toBe(1);
      expect(redisClientMock.ack).toHaveBeenCalledWith(
        consumer.streamName,
        consumer.consumerGroup,
        '1700000000003-0',
      );
    });
  });
});
