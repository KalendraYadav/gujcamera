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
import { DatasetAdapterService } from './dataset-adapter/dataset-adapter.service';
import { SimulatedReplayService } from './dataset-adapter/simulated-replay.service';
import { SimulatedCctvController } from './dataset-adapter/simulated-cctv.controller';

@Module({
  imports: [EventsModule],
  controllers: [CamerasController, SimulatedCctvController],
  providers: [
    CamerasService,
    MediaGatewayService,
    CameraHealthPollerService,
    DatasetAdapterService,
    SimulatedReplayService,
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
    DatasetAdapterService,
    SimulatedReplayService,
    LocalEncryptedCredentialProvider,
    CREDENTIAL_STORE_TOKEN,
    RtspProtocolAdapter,
    OnvifProtocolAdapter,
    ProtocolAdapterRegistry,
  ],
})
export class CamerasModule {}


