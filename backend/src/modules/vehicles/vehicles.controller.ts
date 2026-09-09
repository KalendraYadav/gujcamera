import {
  Controller,
  Get,
  Param,
  Query,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { VehicleQueryDto } from './dto/vehicle-query.dto';
import { SightingQueryDto } from './dto/sighting-query.dto';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Roles('INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Search vehicles by plate or prefix and time range',
    description: 'Requires INVESTIGATOR, DEPARTMENT_ADMIN, or SUPER_ADMIN role. Automatically normalizes plates and records audit log.',
  })
  @ApiResponse({ status: 200, description: 'Matched vehicles list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient privileges' })
  async listVehicles(
    @Query() query: VehicleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.vehiclesService.searchVehicles(query, user, requestId);
  }

  @Get('search')
  @Roles('INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Search vehicles by plate prefix or exact query (Alias for /vehicles)',
  })
  @ApiResponse({ status: 200, description: 'Matched vehicles list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient privileges' })
  async searchVehicles(
    @Query() query: VehicleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.vehiclesService.searchVehicles(query, user, requestId);
  }

  @Get(':plate')
  @Roles('INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Get single vehicle deep-dive record',
    description: 'Fetches vehicle metadata, first/last sighting summaries, and active watchlist alerts.',
  })
  @ApiResponse({ status: 200, description: 'Vehicle deep-dive record' })
  @ApiResponse({ status: 404, description: 'VEHICLE_NOT_FOUND' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findByPlate(
    @Param('plate') plate: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.vehiclesService.findVehicleByPlate(plate, user, requestId);
  }

  @Get(':plate/sightings')
  @Roles('INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Get chronological sighting history for a vehicle',
    description: 'Returns observed camera sightings with location details, timestamps, and detection confidence.',
  })
  @ApiResponse({ status: 200, description: 'Chronological sightings history' })
  @ApiResponse({ status: 404, description: 'VEHICLE_NOT_FOUND' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getSightings(
    @Param('plate') plate: string,
    @Query() query: SightingQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.vehiclesService.getVehicleSightings(plate, query, user, requestId);
  }

  @Get(':plate/timeline')
  @Roles('INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Reconstruct spatio-temporal vehicle trajectory and GIS route',
    description: 'Computes consecutive camera hops, geodesic distance (meters via PostGIS), travel time, implied speed (km/h), and plausibility status.',
  })
  @ApiResponse({ status: 200, description: 'Reconstructed route trajectory' })
  @ApiResponse({ status: 404, description: 'VEHICLE_NOT_FOUND' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getTimeline(
    @Param('plate') plate: string,
    @Query() query: TimelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.vehiclesService.getVehicleTimeline(plate, query, user, requestId);
  }

  @Get(':plate/route')
  @Roles('INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Reconstruct spatio-temporal route (Alias for /timeline)',
  })
  @ApiResponse({ status: 200, description: 'Reconstructed route trajectory' })
  @ApiResponse({ status: 404, description: 'VEHICLE_NOT_FOUND' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getRoute(
    @Param('plate') plate: string,
    @Query() query: TimelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.vehiclesService.getVehicleTimeline(plate, query, user, requestId);
  }
}
