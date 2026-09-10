import { ProtocolAdapterRegistry } from './protocol-adapter.registry';
import { RtspProtocolAdapter } from './rtsp-protocol.adapter';
import { OnvifProtocolAdapter } from './onvif-protocol.adapter';
import { CameraProtocol } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('ProtocolAdapterRegistry', () => {
  let registry: ProtocolAdapterRegistry;
  let rtspAdapter: RtspProtocolAdapter;
  let onvifAdapter: OnvifProtocolAdapter;

  beforeEach(() => {
    rtspAdapter = new RtspProtocolAdapter();
    onvifAdapter = new OnvifProtocolAdapter();
    registry = new ProtocolAdapterRegistry(rtspAdapter, onvifAdapter);
  });

  it('resolves the RTSP protocol adapter', () => {
    const adapter = registry.getAdapter(CameraProtocol.RTSP);
    expect(adapter).toBe(rtspAdapter);
    expect(adapter.protocol).toBe(CameraProtocol.RTSP);
  });

  it('resolves the ONVIF protocol adapter', () => {
    const adapter = registry.getAdapter(CameraProtocol.ONVIF);
    expect(adapter).toBe(onvifAdapter);
    expect(adapter.protocol).toBe(CameraProtocol.ONVIF);
  });

  it('lists both supported protocol types', () => {
    const protocols = registry.getSupportedProtocols();
    expect(protocols).toContain(CameraProtocol.RTSP);
    expect(protocols).toContain(CameraProtocol.ONVIF);
    expect(protocols.length).toBe(2);
  });

  it('rejects unsupported protocol MOCK_VENDOR without silent fallback', () => {
    expect(() => registry.getAdapter(CameraProtocol.MOCK_VENDOR)).toThrow(BadRequestException);
    try {
      registry.getAdapter(CameraProtocol.MOCK_VENDOR);
    } catch (err: any) {
      expect(err.getResponse().error_code).toBe('UNSUPPORTED_CAMERA_PROTOCOL');
    }
  });

  it('rejects unsupported protocol VENDOR_API without silent fallback', () => {
    expect(() => registry.getAdapter(CameraProtocol.VENDOR_API)).toThrow(BadRequestException);
  });
});
