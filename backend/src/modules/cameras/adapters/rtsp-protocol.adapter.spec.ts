import * as net from 'net';
import { RtspProtocolAdapter } from './rtsp-protocol.adapter';
import { AdapterConnectionStatus } from './camera-protocol-adapter.interface';
import { CameraProtocol } from '@prisma/client';

describe('RtspProtocolAdapter (RFC 2326 TCP Protocol Probe & Authentication)', () => {
  let adapter: RtspProtocolAdapter;
  let mockServer: net.Server;
  let mockPort: number;

  beforeAll((done) => {
    mockServer = net.createServer((socket) => {
      socket.on('data', (data) => {
        const text = data.toString('utf-8');

        if (text.startsWith('OPTIONS')) {
          socket.write(
            'RTSP/1.0 200 OK\r\nCSeq: 1\r\nPublic: OPTIONS, DESCRIBE, SETUP, PLAY\r\n\r\n',
          );
        } else if (text.startsWith('DESCRIBE')) {
          if (text.includes('/auth-required')) {
            if (text.includes('Authorization: Basic YWRtaW46VmFsaWRQYXNzMjAyNg==')) {
              // Valid credentials (admin:ValidPass2026)
              const sdp = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=AuthSession\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\n';
              socket.write(
                `RTSP/1.0 200 OK\r\nCSeq: 3\r\nContent-Type: application/sdp\r\nContent-Length: ${sdp.length}\r\n\r\n${sdp}`,
              );
            } else {
              socket.write(
                'RTSP/1.0 401 Unauthorized\r\nCSeq: 2\r\nWWW-Authenticate: Basic realm="MediaMTX"\r\n\r\n',
              );
            }
          } else if (text.includes('/definitely-nonexistent')) {
            socket.write('RTSP/1.0 404 Not Found\r\nCSeq: 2\r\n\r\n');
          } else {
            // Standard unauthenticated stream
            const sdp = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=LiveSession\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\n';
            socket.write(
              `RTSP/1.0 200 OK\r\nCSeq: 2\r\nContent-Type: application/sdp\r\nContent-Length: ${sdp.length}\r\n\r\n${sdp}`,
            );
          }
        }
      });
    });

    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address() as net.AddressInfo;
      mockPort = addr.port;
      done();
    });
  });

  afterAll((done) => {
    mockServer.close(done);
  });

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

  describe('probeConnection protocol exchange', () => {
    it('successfully negotiates RFC 2326 RTSP DESCRIBE against unauthenticated source', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: `rtsp://127.0.0.1:${mockPort}/live/cam-ahm-01`,
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.CONNECTED);
      expect(result.reachable).toBe(true);
      expect(result.protocol).toBe(CameraProtocol.RTSP);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.streamMetadata).toBeDefined();
      expect(result.streamMetadata?.codec).toBe('H264');
      expect(result.streamMetadata?.streamUri).toBe(`rtsp://127.0.0.1:${mockPort}/live/cam-ahm-01`);
    });

    it('detects 401 Unauthorized and successfully retries RFC 2326 Basic Authorization with credentials', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: `rtsp://127.0.0.1:${mockPort}/auth-required`,
        username: 'admin',
        password: 'ValidPass2026',
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.CONNECTED);
      expect(result.reachable).toBe(true);
      expect(result.streamMetadata?.codec).toBe('H264');
    });

    it('returns DEGRADED when 401 Unauthorized occurs without credentials', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: `rtsp://127.0.0.1:${mockPort}/auth-required`,
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.DEGRADED);
      expect(result.reachable).toBe(true);
      expect(result.errorMessage).toContain('401 Unauthorized');
    });

    it('returns DEGRADED when credentials fail authentication after retry', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: `rtsp://127.0.0.1:${mockPort}/auth-required`,
        username: 'admin',
        password: 'WrongPassword',
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.DEGRADED);
      expect(result.reachable).toBe(true);
      expect(result.errorMessage).toContain('Invalid credentials');
    });

    it('detects missing stream endpoint as 404 OFFLINE', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: `rtsp://127.0.0.1:${mockPort}/definitely-nonexistent`,
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

    it('redacts embedded credentials in endpoint URLs and never leaks secrets in probe results', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.RTSP,
        endpointUrl: `rtsp://admin:SecretPassword123@127.0.0.1:${mockPort}/live/cam-ahm-01`,
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.CONNECTED);
      expect(JSON.stringify(result)).not.toContain('SecretPassword123');
      expect(result.streamMetadata?.streamUri).toContain('***:***@');
    });
  });
});
