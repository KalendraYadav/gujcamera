import { ConfigService } from '@nestjs/config';
import { MediaGatewayService } from './media-gateway.service';

describe('MediaGatewayService (MediaMTX v3 Control Plane)', () => {
  let service: MediaGatewayService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, defaultVal: any) => {
        if (key === 'MEDIAMTX_API_URL') return 'http://localhost:9997';
        if (key === 'MEDIAMTX_INTERNAL_RTSP_BASE_URL') return 'rtsp://video-gateway:8554';
        if (key === 'HLS_GATEWAY_URL') return 'http://localhost:8888';
        return defaultVal;
      }),
    } as any;

    service = new MediaGatewayService(mockConfigService);
  });

  describe('normalizePathName', () => {
    it('extracts canonical code prefix from police camera name', () => {
      expect(
        service.normalizePathName('CAM-AHM-01: SG Highway - Pakwan Crossroad', 'uuid-1234'),
      ).toBe('cam-ahm-01');
      expect(service.normalizePathName('CAM-SUR-05: Surat Ring Road', 'uuid-1234')).toBe(
        'cam-sur-05',
      );
      expect(service.normalizePathName('CAM-VAD-02', 'uuid-1234')).toBe('cam-vad-02');
    });

    it('slugifies camera names without canonical code prefix', () => {
      expect(service.normalizePathName('Pakwan Crossroad North', 'uuid-1234')).toBe(
        'cam-pakwan-crossroad-north',
      );
    });

    it('falls back to uuid slice if name is empty or unparseable', () => {
      expect(service.normalizePathName('', '12345678-abcd-1234-abcd-1234567890ab')).toBe(
        'cam-12345678',
      );
    });
  });

  describe('isInternalGatewayStream', () => {
    it('identifies internal gateway and simulator streams', () => {
      expect(service.isInternalGatewayStream('rtsp://video-gateway:8554/cam-ahm-01')).toBe(true);
      expect(service.isInternalGatewayStream('rtsp://simulator:8554/live/cam-ahm-01')).toBe(true);
      expect(service.isInternalGatewayStream('rtsp://localhost:8554/cam-ahm-01')).toBe(true);
      expect(service.isInternalGatewayStream('rtsp://127.0.0.1:8554/cam-ahm-01')).toBe(true);
    });

    it('identifies external camera streams', () => {
      expect(
        service.isInternalGatewayStream('rtsp://10.20.4.15:554/Streaming/Channels/102'),
      ).toBe(false);
      expect(service.isInternalGatewayStream('rtsp://admin:pass@camera.surat.police:554/live')).toBe(
        false,
      );
      expect(service.isInternalGatewayStream('rtsp://192.168.1.50/stream1')).toBe(false);
    });
  });

  describe('sanitizeUrl', () => {
    it('masks embedded credentials', () => {
      const sanitized = service.sanitizeUrl('rtsp://admin:SecretPass123@10.20.4.15:554/ch1');
      expect(sanitized).not.toContain('SecretPass123');
      expect(sanitized).toContain('***:***@');
    });

    it('leaves unauthenticated URLs unchanged', () => {
      expect(service.sanitizeUrl('rtsp://video-gateway:8554/cam-01')).toBe(
        'rtsp://video-gateway:8554/cam-01',
      );
    });
  });

  describe('registerPath against external RTSP source', () => {
    it('passes through internal stream without external registration', async () => {
      const result = await service.registerPath(
        'cam-ahm-01',
        'rtsp://video-gateway:8554/cam-ahm-01',
      );
      expect(result.success).toBe(true);
      expect(result.isExternalSource).toBe(false);
      expect(result.internalRtspUrl).toBe('rtsp://video-gateway:8554/cam-ahm-01');
      expect(result.internalHlsUrl).toBe('http://localhost:8888/cam-ahm-01/index.m3u8');
    });

    it('performs POST to MediaMTX API when registering a new external source', async () => {
      // Mock httpRequest:
      // First call: GET /v3/config/paths/get/cam-sur-01 -> 404 (not exists)
      // Second call: POST /v3/config/paths/add/cam-sur-01 -> 200 (created)
      const httpRequestSpy = jest
        .spyOn(service as any, 'httpRequest')
        .mockImplementation((method: string, url: string) => {
          if (method === 'GET' && url.includes('/v3/config/paths/get/')) {
            return Promise.resolve({ statusCode: 404, body: 'path not found' });
          }
          if (method === 'POST' && url.includes('/v3/config/paths/add/')) {
            return Promise.resolve({ statusCode: 200, body: '{"name":"cam-sur-01"}' });
          }
          return Promise.resolve({ statusCode: 200, body: '{}' });
        });

      const result = await service.registerPath(
        'cam-sur-01',
        'rtsp://10.20.4.15:554/Streaming/Channels/102',
      );

      expect(result.success).toBe(true);
      expect(result.isExternalSource).toBe(true);
      expect(result.pathName).toBe('cam-sur-01');
      expect(result.internalRtspUrl).toBe('rtsp://video-gateway:8554/cam-sur-01');
      expect(result.internalHlsUrl).toBe('http://localhost:8888/cam-sur-01/index.m3u8');

      expect(httpRequestSpy).toHaveBeenCalledTimes(2);
      expect(httpRequestSpy.mock.calls[1][0]).toBe('POST');
      expect(httpRequestSpy.mock.calls[1][1]).toContain('/v3/config/paths/add/cam-sur-01');
    });

    it('performs PATCH to MediaMTX API when updating an existing external source', async () => {
      const httpRequestSpy = jest
        .spyOn(service as any, 'httpRequest')
        .mockImplementation((method: string, url: string) => {
          if (method === 'GET' && url.includes('/v3/config/paths/get/')) {
            return Promise.resolve({ statusCode: 200, body: '{"name":"cam-sur-01"}' });
          }
          if (method === 'PATCH' && url.includes('/v3/config/paths/patch/')) {
            return Promise.resolve({ statusCode: 200, body: '{"name":"cam-sur-01"}' });
          }
          return Promise.resolve({ statusCode: 200, body: '{}' });
        });

      const result = await service.registerPath(
        'cam-sur-01',
        'rtsp://10.20.4.15:554/Streaming/Channels/102-new',
      );

      expect(result.success).toBe(true);
      expect(result.isExternalSource).toBe(true);
      expect(httpRequestSpy).toHaveBeenCalledTimes(2);
      expect(httpRequestSpy.mock.calls[1][0]).toBe('PATCH');
    });

    it('reports controlled failure and sanitizes credentials if MediaMTX API errors', async () => {
      jest
        .spyOn(service as any, 'httpRequest')
        .mockRejectedValue(new Error('Failed to connect to rtsp://admin:SecretPass123@10.20.4.15:554/live'));

      const result = await service.registerPath(
        'cam-sur-01',
        'rtsp://admin:SecretPass123@10.20.4.15:554/live',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Media Gateway registration failed');
      expect(result.error).not.toContain('SecretPass123');
      expect(result.error).toContain('***:***@');
    });

    it('rejects mock and placeholder sources without querying MediaMTX API', async () => {
      const httpRequestSpy = jest.spyOn(service as any, 'httpRequest');

      const result = await service.registerPath(
        'cam-gnd-01',
        'mock://vendor-a/gnd-sec-01',
      );

      expect(result.success).toBe(false);
      expect(result.isExternalSource).toBe(false);
      expect(result.error).toContain('Unsupported stream protocol');
      expect(httpRequestSpy).not.toHaveBeenCalled();
    });

    it('identifies placeholder and pullable stream protocols correctly', () => {
      expect(service.isPlaceholderStream('mock://vendor-a/gnd-sec-01')).toBe(true);
      expect(service.isPlaceholderStream('placeholder://cam-01')).toBe(true);
      expect(service.isPlaceholderStream('rtsp://10.20.4.15:554/live')).toBe(false);

      expect(service.isPullableExternalSource('rtsp://10.20.4.15:554/live')).toBe(true);
      expect(service.isPullableExternalSource('rtsps://camera.lan/stream')).toBe(true);
      expect(service.isPullableExternalSource('rtsp://video-gateway:8554/cam-01')).toBe(false);
      expect(service.isPullableExternalSource('rtsp://simulator:8554/cam-01')).toBe(false);
      expect(service.isPullableExternalSource('mock://vendor-a/gnd-sec-01')).toBe(false);
    });
  });

  describe('Control API Authentication', () => {
    it('attaches HTTP Basic Auth header when api credentials are configured', () => {
      const authConfigService = {
        get: jest.fn((key: string, defaultVal: any) => {
          if (key === 'MEDIAMTX_API_URL') return 'http://localhost:9997';
          if (key === 'MEDIAMTX_API_USER') return 'mediamtx_admin';
          if (key === 'MEDIAMTX_API_PASSWORD') return 'mediamtx_secret_2026';
          return defaultVal;
        }),
      } as any;

      const authService = new MediaGatewayService(authConfigService);
      expect(authService.apiUser).toBe('mediamtx_admin');
      expect(authService.apiPassword).toBe('mediamtx_secret_2026');
    });
  });

  describe('removePath', () => {
    it('calls DELETE on MediaMTX API', async () => {
      const httpRequestSpy = jest
        .spyOn(service as any, 'httpRequest')
        .mockResolvedValue({ statusCode: 200, body: 'path deleted' });

      const result = await service.removePath('cam-sur-01');
      expect(result.success).toBe(true);
      expect(httpRequestSpy).toHaveBeenCalledWith(
        'DELETE',
        'http://localhost:9997/v3/config/paths/delete/cam-sur-01',
        null,
        3000,
      );
    });

    it('treats 404 as safe successful removal (idempotent)', async () => {
      jest
        .spyOn(service as any, 'httpRequest')
        .mockResolvedValue({ statusCode: 404, body: 'path not found' });

      const result = await service.removePath('cam-sur-nonexistent');
      expect(result.success).toBe(true);
    });
  });
});
