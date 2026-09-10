import { Module } from '@nestjs/common';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { RtspProtocolAdapter } from './adapters/rtsp-protocol.adapter';
import { OnvifProtocolAdapter } from './adapters/onvif-protocol.adapter';
import { ProtocolAdapterRegistry } from './adapters/protocol-adapter.registry';

@Module({
  controllers: [CamerasController],
  providers: [
    CamerasService,
    RtspProtocolAdapter,
    OnvifProtocolAdapter,
    ProtocolAdapterRegistry,
  ],
  exports: [
    CamerasService,
    RtspProtocolAdapter,
    OnvifProtocolAdapter,
    ProtocolAdapterRegistry,
  ],
})
export class CamerasModule {}
