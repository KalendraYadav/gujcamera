import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleCorrelationService } from './vehicle-correlation.service';
import {
  PostGisGeodesicDistanceProvider,
  RouteIntelligenceEngine,
} from './route-intelligence';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    VehicleCorrelationService,
    PostGisGeodesicDistanceProvider,
    RouteIntelligenceEngine,
  ],
  exports: [VehiclesService, VehicleCorrelationService, RouteIntelligenceEngine, PostGisGeodesicDistanceProvider],
})
export class VehiclesModule {}
