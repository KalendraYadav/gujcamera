// ==============================================================================
// NETRAVA — Simulated CCTV & Demonstration Stream Operator Controller
// Gujarat Police Innovation Challenge 2026
// REST Endpoints for Manifest Inspection & Replay Stream Orchestration
// ==============================================================================

import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DatasetAdapterService } from './dataset-adapter.service';
import { SimulatedReplayService } from './simulated-replay.service';
import { Roles } from '../../../common/decorators/roles.decorator';

@ApiTags('Simulated CCTV & Demonstration Streams')
@ApiBearerAuth()
@Controller('cameras/simulated-cctv')
export class SimulatedCctvController {
  constructor(
    private readonly datasetAdapter: DatasetAdapterService,
    private readonly replayService: SimulatedReplayService,
  ) {}

  @Get('manifest')
  @ApiOperation({
    summary: 'Get validated demonstration CCTV corridor manifest',
    description: 'Returns the official demonstration manifest and camera definitions with GPS coordinates, RTSP stream paths, and video hashes. Contains no secrets.',
  })
  @ApiResponse({ status: 200, description: 'Demonstration manifest details' })
  async getManifest() {
    return this.datasetAdapter.getManifest();
  }

  @Get('validate')
  @ApiOperation({
    summary: 'Validate demonstration media assets and integrity hashes',
    description: 'Inspects video files on disk, validates dimensions and FPS, verifies SHA-256 cryptographic digests, and reports unverified licenses.',
  })
  @ApiResponse({ status: 200, description: 'Manifest and media validation report' })
  async validateSources() {
    return this.datasetAdapter.validateAllSources();
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get active replay status across all demonstration CCTV streams',
    description: 'Returns stream state (STREAMING, IDLE, ERROR), process PID, uptime, target RTSP URL, and MediaMTX readiness.',
  })
  @ApiResponse({ status: 200, description: 'List of camera replay statuses' })
  async getAllStatuses() {
    return this.replayService.getAllStreamStatuses();
  }

  @Get(':cameraId/status')
  @ApiOperation({
    summary: 'Get replay status for a single demonstration camera',
  })
  @ApiResponse({ status: 200, description: 'Single camera replay status' })
  @ApiResponse({ status: 404, description: 'Camera not in demonstration manifest' })
  async getStatus(@Param('cameraId') cameraId: string) {
    return this.replayService.getStreamStatus(cameraId);
  }

  @Post('start-all')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start all demonstration camera RTSP streams',
    description: 'Spawns continuous FFmpeg replay loops for all cameras in the demonstration manifest into MediaMTX.',
  })
  @ApiResponse({ status: 200, description: 'All demonstration streams initiated' })
  async startAll() {
    return this.replayService.startAllStreams();
  }

  @Post('stop-all')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop all active demonstration camera streams',
    description: 'Gracefully terminates all spawned FFmpeg replay processes.',
  })
  @ApiResponse({ status: 200, description: 'All demonstration streams stopped' })
  async stopAll() {
    await this.replayService.stopAllStreams();
    return { success: true, message: 'All demonstration streams terminated.' };
  }

  @Post(':cameraId/start')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start a single demonstration camera stream',
  })
  @ApiResponse({ status: 200, description: 'Camera stream initiated' })
  async startStream(@Param('cameraId') cameraId: string) {
    return this.replayService.startStream(cameraId);
  }

  @Post(':cameraId/stop')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop a single demonstration camera stream',
  })
  @ApiResponse({ status: 200, description: 'Camera stream stopped' })
  async stopStream(@Param('cameraId') cameraId: string) {
    const success = await this.replayService.stopStream(cameraId);
    return { success, cameraId };
  }

  @Post(':cameraId/restart')
  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restart a single demonstration camera stream',
  })
  @ApiResponse({ status: 200, description: 'Camera stream restarted' })
  async restartStream(@Param('cameraId') cameraId: string) {
    await this.replayService.stopStream(cameraId);
    return this.replayService.startStream(cameraId);
  }
}
