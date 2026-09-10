import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CameraProtocol } from '@prisma/client';
import { CameraProtocolAdapter } from './camera-protocol-adapter.interface';
import { RtspProtocolAdapter } from './rtsp-protocol.adapter';
import { OnvifProtocolAdapter } from './onvif-protocol.adapter';

@Injectable()
export class ProtocolAdapterRegistry {
  private readonly logger = new Logger(ProtocolAdapterRegistry.name);
  private readonly adapters = new Map<CameraProtocol, CameraProtocolAdapter>();

  constructor(
    private readonly rtspAdapter: RtspProtocolAdapter,
    private readonly onvifAdapter: OnvifProtocolAdapter,
  ) {
    this.adapters.set(CameraProtocol.RTSP, this.rtspAdapter);
    this.adapters.set(CameraProtocol.ONVIF, this.onvifAdapter);
    this.logger.log(`Initialized Camera Protocol Adapter Registry with [${Array.from(this.adapters.keys()).join(', ')}]`);
  }

  /**
   * Retrieve protocol adapter instance for the specified camera protocol
   * Throws BadRequestException on unsupported protocols without silent fallback.
   */
  getAdapter(protocol: CameraProtocol): CameraProtocolAdapter {
    const adapter = this.adapters.get(protocol);
    if (!adapter) {
      throw new BadRequestException({
        error_code: 'UNSUPPORTED_CAMERA_PROTOCOL',
        message: `Protocol '${protocol}' is not supported by the active protocol adapter engine. Supported protocols are: ${this.getSupportedProtocols().join(', ')}`,
      });
    }
    return adapter;
  }

  /**
   * Returns list of genuinely supported and executable camera protocol types
   */
  getSupportedProtocols(): CameraProtocol[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a protocol has an executable adapter registered
   */
  hasAdapter(protocol: CameraProtocol): boolean {
    return this.adapters.has(protocol);
  }
}
