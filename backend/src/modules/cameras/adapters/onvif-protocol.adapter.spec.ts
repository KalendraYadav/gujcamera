import { OnvifProtocolAdapter } from './onvif-protocol.adapter';
import { AdapterConnectionStatus } from './camera-protocol-adapter.interface';
import { CameraProtocol } from '@prisma/client';
import { OnvifProtocolTestFixture } from '../../../../test/fixtures/onvif-protocol-fixture';

describe('OnvifProtocolAdapter (ONVIF Core Profile S SOAP Probe)', () => {
  let adapter: OnvifProtocolAdapter;
  let fixture: OnvifProtocolTestFixture;
  let fixturePort: number;

  beforeAll(async () => {
    adapter = new OnvifProtocolAdapter();
    fixture = new OnvifProtocolTestFixture({
      requireAuth: true,
      expectedUsername: 'admin',
      expectedPassword: 'GujaratPolice@2026',
      manufacturer: 'Gujarat-Police-Surveillance',
      model: 'GP-CCTV-4K-PRO',
      firmwareVersion: '4.2.1-GP-2026',
      serialNumber: 'GJ-POLICE-CAM-2026-8849',
    });
    fixturePort = await fixture.start();
  });

  afterAll(async () => {
    await fixture.stop();
  });

  describe('validateConfig', () => {
    it('accepts valid HTTP/HTTPS endpoint URLs', () => {
      const httpResult = adapter.validateConfig({
        protocol: CameraProtocol.ONVIF,
        endpointUrl: 'http://192.168.1.100:80/onvif/device_service',
      });
      expect(httpResult.isValid).toBe(true);

      const httpsResult = adapter.validateConfig({
        protocol: CameraProtocol.ONVIF,
        endpointUrl: 'https://192.168.1.100:443/onvif/device_service',
      });
      expect(httpsResult.isValid).toBe(true);
    });

    it('rejects URLs with non-http/https protocols', () => {
      const result = adapter.validateConfig({
        protocol: CameraProtocol.ONVIF,
        endpointUrl: 'rtsp://192.168.1.100:554/onvif/device_service',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("ONVIF URL must begin with 'http://' or 'https://'");
    });

    it('rejects missing endpoint URL', () => {
      const result = adapter.validateConfig({
        protocol: CameraProtocol.ONVIF,
        endpointUrl: '',
      });
      expect(result.isValid).toBe(false);
    });
  });

  describe('probeConnection against ONVIF Protocol Test Fixture', () => {
    it('authenticates via WS-Security UsernameToken and retrieves device information & stream URI', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.ONVIF,
        endpointUrl: `http://127.0.0.1:${fixturePort}/onvif/device_service`,
        username: 'admin',
        password: 'GujaratPolice@2026',
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.CONNECTED);
      expect(result.reachable).toBe(true);
      expect(result.protocol).toBe(CameraProtocol.ONVIF);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.streamMetadata).toBeDefined();
      expect(result.streamMetadata?.deviceInfo?.manufacturer).toBe('Gujarat-Police-Surveillance');
      expect(result.streamMetadata?.deviceInfo?.model).toBe('GP-CCTV-4K-PRO');
      expect(result.streamMetadata?.deviceInfo?.firmwareVersion).toBe('4.2.1-GP-2026');
      expect(result.streamMetadata?.deviceInfo?.serialNumber).toBe('GJ-POLICE-CAM-2026-8849');
      expect(result.streamMetadata?.streamUri).toBe('rtsp://127.0.0.1:8554/live/cam-ahm-01');

      // Security check: passwords must never be leaked
      expect(JSON.stringify(result)).not.toContain('GujaratPolice@2026');
    });

    it('returns DEGRADED when WS-Security credentials fail authentication', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.ONVIF,
        endpointUrl: `http://127.0.0.1:${fixturePort}/onvif/device_service`,
        username: 'admin',
        password: 'WrongPassword999',
        timeoutMs: 3000,
      });

      expect(result.status).toBe(AdapterConnectionStatus.DEGRADED);
      expect(result.reachable).toBe(true);
      expect(result.errorMessage).toContain('ONVIF Authentication Failed');
    });

    it('returns OFFLINE when ONVIF port is unreachable', async () => {
      const result = await adapter.probeConnection({
        protocol: CameraProtocol.ONVIF,
        endpointUrl: 'http://127.0.0.1:54321/onvif/device_service',
        timeoutMs: 1500,
      });

      expect(result.status).toBe(AdapterConnectionStatus.OFFLINE);
      expect(result.reachable).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('returns ERROR when response contains malformed non-SOAP XML', async () => {
      const malformedFixture = new OnvifProtocolTestFixture({
        requireAuth: false,
        returnMalformed: true,
      });
      const malformedPort = await malformedFixture.start();

      try {
        const result = await adapter.probeConnection({
          protocol: CameraProtocol.ONVIF,
          endpointUrl: `http://127.0.0.1:${malformedPort}/onvif/device_service`,
          timeoutMs: 2000,
        });

        expect(result.status).toBe(AdapterConnectionStatus.ERROR);
        expect(result.reachable).toBe(true);
        expect(result.errorMessage).toContain('Invalid ONVIF SOAP response');
      } finally {
        await malformedFixture.stop();
      }
    });
  });
});
