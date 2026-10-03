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
  ApiQuery,
} from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { VehicleCorrelationService } from './vehicle-correlation.service';
import { VehicleQueryDto } from './dto/vehicle-query.dto';
import { SightingQueryDto } from './dto/sighting-query.dto';
import { TimelineQueryDto } from './dto/timeline-query.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly correlationService: VehicleCorrelationService,
  ) {}

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

  @Get(':plate/audit')
  @Roles('INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Get chronological audit records for vehicle investigation',
  })
  @ApiResponse({ status: 200, description: 'Vehicle investigation audit trail' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getAuditTrail(
    @Param('plate') plate: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.getVehicleAuditLogs(plate, user);
  }

  @Get(':plate/correlation-candidates')
  @Roles('INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Find correlation candidates for a vehicle observation (Phase 10)',
    description:
      'Returns ranked observation candidates with fuzzy plate similarity and spatio-temporal ' +
      'consistency scores. Candidates are for investigator review only and do NOT constitute ' +
      'identity matches. Supports window_days (1–30) and limit (1–200) query parameters.',
  })
  @ApiQuery({ name: 'window_days', required: false, type: Number, description: 'Search window in days (default 7, max 30)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum candidates to return (default 50, max 200)' })
  @ApiResponse({ status: 200, description: 'Correlation candidates with explainability reasons' })
  @ApiResponse({ status: 404, description: 'VEHICLE_NOT_FOUND or invalid plate format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getCorrelationCandidates(
    @Param('plate') plate: string,
    @Query('window_days') windowDays?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.correlationService.findCorrelationCandidates(
      plate,
      user!,
      requestId,
      windowDays ? parseInt(windowDays, 10) : 7,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
