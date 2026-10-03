import { Module } from '@nestjs/common';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { RtspProtocolAdapter } from './adapters/rtsp-protocol.adapter';
import { OnvifProtocolAdapter } from './adapters/onvif-protocol.adapter';
import { ProtocolAdapterRegistry } from './adapters/protocol-adapter.registry';
import { MediaGatewayService } from './media-gateway.service';
import { EventsModule } from '../../common/events/events.module';

import { LocalEncryptedCredentialProvider } from './credentials/local-encrypted-credential.provider';
import { CREDENTIAL_STORE_TOKEN } from './credentials/credential-store.interface';
import { CameraHealthPollerService } from './health/camera-health-poller.service';

@Module({
  imports: [EventsModule],
  controllers: [CamerasController],
  providers: [
    CamerasService,
    MediaGatewayService,
    CameraHealthPollerService,
    LocalEncryptedCredentialProvider,
    {
      provide: CREDENTIAL_STORE_TOKEN,
      useExisting: LocalEncryptedCredentialProvider,
    },
    RtspProtocolAdapter,
    OnvifProtocolAdapter,
    ProtocolAdapterRegistry,
  ],
  exports: [
    CamerasService,
    MediaGatewayService,
    CameraHealthPollerService,
    LocalEncryptedCredentialProvider,
    CREDENTIAL_STORE_TOKEN,
    RtspProtocolAdapter,
    OnvifProtocolAdapter,
    ProtocolAdapterRegistry,
  ],
})
export class CamerasModule {}

