import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CamerasService } from './cameras.service';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { CameraQueryDto } from './dto/camera-query.dto';
import { NearbyCameraQueryDto } from './dto/nearby-camera-query.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';


@ApiTags('Cameras')
@ApiBearerAuth()
@Controller('cameras')
export class CamerasController {
  constructor(private readonly camerasService: CamerasService) {}

  @Get()
  @ApiOperation({
    summary: 'List cameras with GIS viewport (bbox), status, and department filtering',
    description: 'Supports PostGIS spatial bounding box query (bbox=minLong,minLat,maxLong,maxLat), status, department scoping, and cursor pagination.',
  })
  @ApiResponse({ status: 200, description: 'Filtered list of CCTV cameras' })
  @ApiResponse({ status: 400, description: 'INVALID_BBOX or malformed query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized: missing or invalid JWT' })
  async findCameras(@Query() query: CameraQueryDto) {
    return this.camerasService.findCameras(query);
  }

  @Get('nearby')
  @ApiOperation({
    summary: 'Find nearby CCTV cameras using PostGIS geodesic distance',
    description: 'Calculates real Great-Circle distance over WGS-84 geography. Search radius unit is strictly METERS.',
  })
  @ApiResponse({ status: 200, description: 'Nearby cameras ordered by distance ascending' })
  @ApiResponse({ status: 400, description: 'INVALID_COORDINATES or INVALID_RADIUS' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findNearby(@Query() query: NearbyCameraQueryDto) {
    return this.camerasService.findNearbyCameras(query);
  }

  @Get('health/summary')
  @ApiOperation({
    summary: 'Get operational telemetry summary across all registered CCTV cameras',
    description: 'Provides camera operational status counts (online, degraded, offline, error). Distinct from API/database infrastructure health.',
  })
  @ApiResponse({ status: 200, description: 'Camera equipment operational telemetry summary' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getHealthSummary() {
    return this.camerasService.getCameraHealthSummary();
  }

  @Post('test-connection')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Probe camera stream connectivity via protocol adapter',
    description: 'Executes a genuine protocol probe (RTSP RFC 2326 TCP negotiation or ONVIF Profile S SOAP 1.2 probe). Returns latency, connection status, and stream metadata without returning credentials.',
  })
  @ApiResponse({ status: 200, description: 'Probe result with connection state and latency' })
  @ApiResponse({ status: 400, description: 'Unsupported protocol or validation failure' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testConnection(@Body() dto: TestConnectionDto) {
    return this.camerasService.testConnection(dto);
  }

  @Get('connectors/list')
  @ApiOperation({
    summary: 'List available camera connectors and supported protocol adapters',
  })
  @ApiResponse({ status: 200, description: 'List of connectors and supported protocols' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConnectors() {
    return this.camerasService.getConnectors();
  }

  @Get('connectors')
  @ApiOperation({
    summary: 'List available camera connectors and supported protocol adapters (alias)',
  })
  @ApiResponse({ status: 200, description: 'List of connectors and supported protocols' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConnectorsAlias() {
    return this.camerasService.getConnectors();
  }

  @Get('departments')
  @ApiOperation({
    summary: 'List departments with canonical IDs and names for fleet assignment',
  })
  @ApiResponse({ status: 200, description: 'List of departments' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDepartments() {
    return this.camerasService.getDepartments();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get single camera deep-dive record',
    description: 'Fetches camera metadata, physical location, streams, and operational health telemetry.',
  })
  @ApiResponse({ status: 200, description: 'Camera details' })
  @ApiResponse({ status: 404, description: 'CAMERA_NOT_FOUND' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findById(@Param('id') id: string) {
    return this.camerasService.findCameraById(id);
  }

  @Get(':id/health')
  @ApiOperation({
    summary: 'Get operational health and heartbeat telemetry for a specific camera',
  })
  @ApiResponse({ status: 200, description: 'Camera health telemetry' })
  @ApiResponse({ status: 404, description: 'CAMERA_NOT_FOUND' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCameraHealth(@Param('id') id: string) {
    return this.camerasService.getCameraHealth(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Onboard a new CCTV camera',
    description: 'Requires SUPER_ADMIN or DEPARTMENT_ADMIN role. Department Admins can only register cameras within their department.',
  })
  @ApiResponse({ status: 201, description: 'Camera successfully onboarded' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid department/connector' })
  @ApiResponse({ status: 403, description: 'DEPARTMENT_ACCESS_DENIED' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_STREAM_ENDPOINT' })
  async createCamera(
    @Body() createCameraDto: CreateCameraDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.camerasService.createCamera(createCameraDto, user, requestId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @ApiOperation({
    summary: 'Update camera metadata or location',
    description: 'Requires SUPER_ADMIN or DEPARTMENT_ADMIN role. Prevents mass assignment and records before/after audit log.',
  })
  @ApiResponse({ status: 200, description: 'Camera successfully updated' })
  @ApiResponse({ status: 400, description: 'Validation failure' })
  @ApiResponse({ status: 403, description: 'DEPARTMENT_ACCESS_DENIED' })
  @ApiResponse({ status: 404, description: 'CAMERA_NOT_FOUND' })
  async updateCamera(
    @Param('id') id: string,
    @Body() updateCameraDto: UpdateCameraDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.camerasService.updateCamera(id, updateCameraDto, user, requestId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @ApiOperation({
    summary: 'Soft decommission a CCTV camera',
    description: 'Marks camera inactive and offline while preserving historical sightings, detections, and evidence.',
  })
  @ApiResponse({ status: 200, description: 'Camera successfully decommissioned' })
  @ApiResponse({ status: 403, description: 'DEPARTMENT_ACCESS_DENIED' })
  @ApiResponse({ status: 404, description: 'CAMERA_NOT_FOUND' })
  async decommissionCamera(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.camerasService.decommissionCamera(id, user, requestId);
  }
}
