import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsGateway } from './alerts.gateway';
import { WatchlistsModule } from '../watchlists/watchlists.module';

@Module({
  imports: [
    JwtModule.register({}),
    WatchlistsModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsGateway],
  exports: [AlertsService, AlertsGateway],
})
export class AlertsModule {}
