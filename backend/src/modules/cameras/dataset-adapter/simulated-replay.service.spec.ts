import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SimulatedReplayService } from './simulated-replay.service';
import { DatasetAdapterService } from './dataset-adapter.service';
import { MediaGatewayService } from '../media-gateway.service';

describe('SimulatedReplayService (Phase 13)', () => {
  let service: SimulatedReplayService;
  let datasetAdapter: DatasetAdapterService;
  let mediaGateway: MediaGatewayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatedReplayService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: any) => {
              if (key === 'MEDIAMTX_HOST') return 'video-gateway';
              if (key === 'MEDIAMTX_RTSP_PORT') return 8554;
              if (key === 'DEMONSTRATION_MANIFEST_PATH') {
                return 'fixtures/manifests/demonstration_manifest.json';
              }
              return defaultVal;
            }),
          },
        },
        DatasetAdapterService,
        {
          provide: MediaGatewayService,
          useValue: {
            hlsBase: 'http://localhost:8888',
            internalRtspBase: 'rtsp://video-gateway:8554',
            getPathState: jest.fn().mockImplementation(async (pathName: string) => {
              return {
                exists: true,
                ready: true,
                state: { name: pathName, ready: true },
              };
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SimulatedReplayService>(SimulatedReplayService);
    datasetAdapter = module.get<DatasetAdapterService>(DatasetAdapterService);
    mediaGateway = module.get<MediaGatewayService>(MediaGatewayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStreamStatus', () => {
    it('should return complete replay status metadata for a camera', async () => {
      const status = await service.getStreamStatus('CAM-AHM-01');
      expect(status).toBeDefined();
      expect(status.cameraId).toBe('CAM-AHM-01');
      expect(status.rtspPath).toBe('cam-ahm-01');
      expect(status.targetRtspUrl).toBe('rtsp://video-gateway:8554/cam-ahm-01');
      expect(status.hlsUrl).toBe('http://localhost:8888/cam-ahm-01/index.m3u8');
      expect(status.isSimulatedLive).toBe(true);
      expect(status.sourceType).toBe('SYNTHETIC_STREAM');
      expect(status.licenseStatus).toBe('VERIFIED_SYNTHETIC');
      expect(status.mediaMtxReady).toBe(true);
    });

    it('should throw an error if camera is not in demonstration manifest', async () => {
      await expect(service.getStreamStatus('CAM-NON-EXISTENT')).rejects.toThrow(
        /not found in manifest/i,
      );
    });
  });

  describe('getAllStreamStatuses', () => {
    it('should return status for all 10 demonstration cameras', async () => {
      const statuses = await service.getAllStreamStatuses();
      expect(statuses.length).toBe(10);

      const paths = statuses.map((s) => s.rtspPath);
      expect(paths).toContain('cam-ahm-01');
      expect(paths).toContain('cam-ahm-02');
      expect(paths).toContain('demo-traffic');
      expect(paths).toContain('cam-sur-01');
      expect(paths).toContain('cam-vad-01');
    });

    it('should maintain deterministic mapping between cameraId and RTSP path', async () => {
      const statuses = await service.getAllStreamStatuses();
      const ahm01 = statuses.find((s) => s.cameraId === 'CAM-AHM-01');
      expect(ahm01?.rtspPath).toBe('cam-ahm-01');
      expect(ahm01?.targetRtspUrl).toContain('8554/cam-ahm-01');

      const sur01 = statuses.find((s) => s.cameraId === 'CAM-SUR-01');
      expect(sur01?.rtspPath).toBe('cam-sur-01');
      expect(sur01?.targetRtspUrl).toContain('8554/cam-sur-01');
    });
  });

  describe('Lifecycle Management', () => {
    it('should handle stopStream gracefully when not running', async () => {
      const stopped = await service.stopStream('CAM-AHM-01');
      expect(stopped).toBe(false);
    });

    it('should handle stopAllStreams gracefully', async () => {
      await expect(service.stopAllStreams()).resolves.not.toThrow();
    });
  });
});
