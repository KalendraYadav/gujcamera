import { RtspProtocolAdapter } from './rtsp-protocol.adapter';
import { AdapterConnectionStatus } from './camera-protocol-adapter.interface';
import { CameraProtocol } from '@prisma/client';

describe('RtspProtocolAdapter (RFC 2326 TCP Protocol Probe)', () => {
  let adapter: RtspProtocolAdapter;

  beforeEach(() => {
    adapter = new RtspProtocolAdapter();
  });

  describe('validateConfig', () => {
    it('accepts valid RTSP endpoint URLs', () => {
      const result = adapter.validateConfig({
        protocol: CameraProtocol.RTSP,
        endpointUrl: 'rtsp://127.0.0.1:8554/live/cam-ahm-01',
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects URLs with non-rtsp protocols', () => {
      const result = adapter.validateConfig({
        protocol: CameraProtocol.RTSP,
        endpointUrl: 'http://127.0.0.1:8554/live/cam-01',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("RTSP URL must begin with 'rtsp://'");
    });

    it('rejects missing or empty URLs', () => {
      const result = adapter.validateConfig({
        protocol: CameraProtocol.RTSP,
        endpointUrl: '',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('RTSP endpoint URL is required');
    });

    it('rejects malformed URLs', () => {
      const result = adapter.validateConfig({
        protocol: CameraProtocol.RTSP,
        endpointUrl: 'not-a-valid-url',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Malformed RTSP URL structure');
    });
  });

  describe('probeConnection against Live MediaMTX', () => {
    it('successfully negotiates RFC 2326 RTSP DESCRIBE against live cam-ahm-01 stream', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: 'rtsp://127.0.0.1:8554/live/cam-ahm-01',
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.CONNECTED);
      expect(result.reachable).toBe(true);
      expect(result.protocol).toBe(CameraProtocol.RTSP);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.streamMetadata).toBeDefined();
      expect(result.streamMetadata?.codec).toBe('H264');
      expect(result.streamMetadata?.streamUri).toBe('rtsp://127.0.0.1:8554/live/cam-ahm-01');
    });

    it('detects missing stream endpoint as 404 OFFLINE', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: 'rtsp://127.0.0.1:8554/live/definitely-nonexistent-stream-999',
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.OFFLINE);
      expect(result.reachable).toBe(true);
      expect(result.errorMessage).toContain('404');
    });

    it('reports OFFLINE when RTSP target port is closed/unreachable', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: 'rtsp://127.0.0.1:54321/live/closed-port',
        timeoutMs: 1500,
      });

      expect(result.status).toBe(AdapterConnectionStatus.OFFLINE);
      expect(result.reachable).toBe(false);
      expect(result.errorMessage).toContain('Connection refused');
    });

    it('redacts embedded credentials in endpoint URLs', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: 'rtsp://admin:SecretPassword123@127.0.0.1:8554/live/cam-ahm-01',
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.CONNECTED);
      // Secrets must never be exposed
      expect(JSON.stringify(result)).not.toContain('SecretPassword123');
      expect(result.streamMetadata?.streamUri).toContain('***:***@');
    });
  });
});
