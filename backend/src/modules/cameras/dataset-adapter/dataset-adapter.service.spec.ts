import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatasetAdapterService } from './dataset-adapter.service';
import * as path from 'path';

describe('DatasetAdapterService (Phase 13)', () => {
  let service: DatasetAdapterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetAdapterService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: any) => {
              if (key === 'DEMONSTRATION_MANIFEST_PATH') {
                return 'fixtures/manifests/demonstration_manifest.json';
              }
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DatasetAdapterService>(DatasetAdapterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getManifest', () => {
    it('should successfully load and parse the demonstration manifest', async () => {
      const manifest = await service.getManifest();
      expect(manifest).toBeDefined();
      expect(manifest.manifestVersion).toBe('1.0.0');
      expect(manifest.challenge).toContain('Gujarat Police Innovation Challenge');
      expect(Array.isArray(manifest.cameras)).toBe(true);
      expect(manifest.cameras.length).toBe(10);
    });

    it('should contain the 10 strategic demonstration corridor cameras', async () => {
      const manifest = await service.getManifest();
      const cameraIds = manifest.cameras.map((c) => c.cameraId);
      expect(cameraIds).toContain('CAM-AHM-01');
      expect(cameraIds).toContain('CAM-AHM-02');
      expect(cameraIds).toContain('CAM-AHM-03');
      expect(cameraIds).toContain('CAM-AHM-04');
      expect(cameraIds).toContain('CAM-GND-01');
      expect(cameraIds).toContain('CAM-GND-02');
      expect(cameraIds).toContain('CAM-DEMO-01');
      expect(cameraIds).toContain('CAM-SUR-01');
      expect(cameraIds).toContain('CAM-SUR-02');
      expect(cameraIds).toContain('CAM-VAD-01');
    });
  });

  describe('validateAllSources', () => {
    it('should validate all demonstration video assets and verify SHA-256 digests', async () => {
      const report = await service.validateAllSources();
      expect(report.totalCameras).toBe(10);
      expect(report.validCameras).toBe(10);
      expect(report.invalidCameras).toBe(0);
      expect(report.valid).toBe(true);

      // Verify every camera has fileExists = true and hashMatched = true
      for (const res of report.results) {
        expect(res.fileExists).toBe(true);
        expect(res.hashMatched).toBe(true);
        expect(res.metadataValid).toBe(true);
      }
    });

    it('should preserve LICENSE_VERIFICATION_REQUIRED for representative research video sources', async () => {
      const report = await service.validateAllSources();
      // Expect 3 research video nodes (CAM-DEMO-01, CAM-SUR-01, CAM-VAD-01)
      expect(report.unverifiedLicenseCount).toBe(3);

      const demoHwy = report.results.find((r) => r.cameraId === 'CAM-DEMO-01');
      expect(demoHwy).toBeDefined();
      expect(demoHwy?.licenseStatus).toBe('LICENSE_VERIFICATION_REQUIRED');
      expect(demoHwy?.warnings.length).toBeGreaterThan(0);
      expect(demoHwy?.warnings[0]).toContain('LICENSE_VERIFICATION_REQUIRED');
    });
  });

  describe('validateSource integrity checks', () => {
    it('should detect file existence failure when path is non-existent', async () => {
      const fakeCamera: any = {
        cameraId: 'CAM-FAKE-01',
        sourceId: 'SRC-FAKE',
        videoPath: 'fixtures/non-existent-video.mp4',
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
        width: 1280,
        height: 720,
        fps: 25,
        duration: 10,
        rtspPath: 'cam-fake',
        licenseStatus: 'VERIFIED_SYNTHETIC',
      };

      const result = await service.validateSource(fakeCamera);
      expect(result.valid).toBe(false);
      expect(result.fileExists).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('should detect SHA-256 mismatch when expected hash is altered', async () => {
      const camera = await service.getSourceByCameraId('CAM-AHM-01');
      expect(camera).toBeDefined();

      const tamperedCamera = {
        ...camera!,
        sha256: 'tampered-hash-000000000000000000000000000000000000000000000000000000',
      };

      const result = await service.validateSource(tamperedCamera);
      expect(result.valid).toBe(false);
      expect(result.hashMatched).toBe(false);
      expect(result.errors.some((e) => e.includes('SHA-256 digest mismatch'))).toBe(true);
    });

    it('should reject invalid RTSP path slugs containing special characters', async () => {
      const camera = await service.getSourceByCameraId('CAM-AHM-01');
      const badSlugCamera = {
        ...camera!,
        rtspPath: 'invalid/path/with/slashes',
      };

      const result = await service.validateSource(badSlugCamera);
      expect(result.valid).toBe(false);
      expect(result.metadataValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid or unsafe RTSP path slug'))).toBe(true);
    });
  });

  describe('Demonstration Truthfulness and Ground-Truth Boundary', () => {
    it('should maintain targetVehicles strictly as reference metadata without runtime injection', async () => {
      const camera = await service.getSourceByCameraId('CAM-AHM-01');
      expect(camera).toBeDefined();
      expect(camera?.targetVehicles.length).toBe(1);
      expect(camera?.targetVehicles[0].plate).toBe('GJ01AB1234');
      expect(camera?.targetVehicles[0].notes).toContain('never injected into runtime inference pipeline');
    });
  });
});
