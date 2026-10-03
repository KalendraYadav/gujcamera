import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EventsModule } from '../../common/events/events.module';
import { CamerasModule } from '../cameras/cameras.module';

@Module({
  imports: [EventsModule, CamerasModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
