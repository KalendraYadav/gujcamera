// ==============================================================================
// NETRAVA — Simulated CCTV FFmpeg Replay Engine & Stream Orchestrator
// Gujarat Police Innovation Challenge 2026
// Manages simulated live RTSP streaming lifecycle into MediaMTX
// ==============================================================================

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, spawn } from 'child_process';
import { DatasetAdapterService } from './dataset-adapter.service';
import { MediaGatewayService } from '../media-gateway.service';
import {
  CameraReplayStatus,
  ManifestCameraEntry,
  ReplayState,
} from './dataset-manifest.types';

interface ManagedProcess {
  process?: ChildProcess;
  cameraId: string;
  rtspPath: string;
  state: ReplayState;
  startedAt?: Date;
  restartCount: number;
  lastError?: string;
  targetRtspUrl: string;
}

@Injectable()
export class SimulatedReplayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulatedReplayService.name);
  private readonly managedProcesses = new Map<string, ManagedProcess>();
  private readonly gatewayHost: string;
  private readonly gatewayPort: number;
  private readonly ffmpegBin: string;
  private readonly autoStartOnBoot: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly datasetAdapter: DatasetAdapterService,
    private readonly mediaGateway: MediaGatewayService,
  ) {
    this.gatewayHost = this.configService.get<string>('MEDIAMTX_HOST', 'localhost');
    this.gatewayPort = this.configService.get<number>('MEDIAMTX_RTSP_PORT', 8554);
    this.ffmpegBin = this.configService.get<string>('FFMPEG_BIN_PATH', 'ffmpeg');
    this.autoStartOnBoot = this.configService.get<boolean>('SIMULATED_REPLAY_AUTOSTART', false);
  }

  async onModuleInit() {
    this.logger.log('[SimulatedReplay] Initializing Simulated CCTV Replay Engine...');
    if (this.autoStartOnBoot) {
      this.logger.log('[SimulatedReplay] SIMULATED_REPLAY_AUTOSTART is enabled. Starting all demonstration streams...');
      await this.startAllStreams();
    }
  }

  async onModuleDestroy() {
    this.logger.log('[SimulatedReplay] Gracefully stopping all spawned FFmpeg replay processes...');
    await this.stopAllStreams();
  }

  /**
   * Start a single camera demonstration stream over RTSP
   */
  public async startStream(cameraId: string): Promise<CameraReplayStatus> {
    const camera = await this.datasetAdapter.getSourceByCameraId(cameraId);
    if (!camera) {
      throw new Error(`Camera with ID '${cameraId}' not found in demonstration manifest`);
    }

    const validation = await this.datasetAdapter.validateSource(camera);
    if (!validation.fileExists) {
      throw new Error(`Video file for camera '${cameraId}' not found: ${validation.resolvedAbsolutePath}`);
    }

    // Stop existing process if running
    await this.stopStream(cameraId);

    const targetRtspUrl = `rtsp://${this.gatewayHost}:${this.gatewayPort}/${camera.rtspPath}`;
    this.logger.log(`[SimulatedReplay] Spawning FFmpeg loop for camera [${cameraId}] -> ${targetRtspUrl}`);

    const existingState = this.managedProcesses.get(cameraId);
    const restartCount = existingState ? existingState.restartCount + 1 : 0;

    const managed: ManagedProcess = {
      cameraId,
      rtspPath: camera.rtspPath,
      state: 'STARTING',
      startedAt: new Date(),
      restartCount,
      targetRtspUrl,
    };
    this.managedProcesses.set(cameraId, managed);

    // FFmpeg arguments:
    // -re: read input at native frame rate
    // -stream_loop -1: infinite looping
    // -c:v copy: zero re-encoding, pure RTP/RTSP packetization
    // -rtsp_transport tcp: reliable TCP transport
    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-re',
      '-stream_loop',
      '-1',
      '-i',
      validation.resolvedAbsolutePath,
      '-c:v',
      'copy',
      '-f',
      'rtsp',
      '-rtsp_transport',
      'tcp',
      targetRtspUrl,
    ];

    try {
      const child = spawn(this.ffmpegBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      managed.process = child;
      managed.state = 'STREAMING';

      child.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
          this.logger.debug(`[FFmpeg:${camera.rtspPath}] ${msg}`);
        }
      });

      child.on('error', (err) => {
        this.logger.warn(`[FFmpeg:${camera.rtspPath}] Process error: ${err.message}`);
        managed.state = 'ERROR';
        managed.lastError = err.message;
      });

      child.on('exit', (code, signal) => {
        this.logger.log(`[FFmpeg:${camera.rtspPath}] Process exited (code: ${code}, signal: ${signal})`);
        if (managed.state === 'STREAMING') {
          managed.state = 'STOPPED';
        }
      });

      return this.getStreamStatus(cameraId);
    } catch (err: any) {
      managed.state = 'ERROR';
      managed.lastError = err.message;
      this.logger.error(`[SimulatedReplay] Failed to spawn FFmpeg process: ${err.message}`);
      return this.getStreamStatus(cameraId);
    }
  }

  /**
   * Stop a single camera demonstration stream
   */
  public async stopStream(cameraId: string): Promise<boolean> {
    const managed = this.managedProcesses.get(cameraId);
    if (!managed) {
      return false;
    }

    if (managed.process && !managed.process.killed) {
      this.logger.log(`[SimulatedReplay] Terminating FFmpeg process for [${cameraId}] (PID: ${managed.process.pid})`);
      try {
        managed.process.kill('SIGTERM');
      } catch (err) {
        try {
          managed.process.kill('SIGKILL');
        } catch {}
      }
    }

    managed.state = 'STOPPED';
    return true;
  }

  /**
   * Start all demonstration streams declared in the manifest
   */
  public async startAllStreams(): Promise<CameraReplayStatus[]> {
    const cameras = await this.datasetAdapter.getAllSources();
    const results: CameraReplayStatus[] = [];

    for (const cam of cameras) {
      try {
        const status = await this.startStream(cam.cameraId);
        results.push(status);
      } catch (err: any) {
        this.logger.warn(`[SimulatedReplay] Could not auto-start stream for [${cam.cameraId}]: ${err.message}`);
        const status = await this.getStreamStatus(cam.cameraId);
        results.push(status);
      }
    }

    return results;
  }

  /**
   * Stop all active demonstration streams
   */
  public async stopAllStreams(): Promise<void> {
    for (const cameraId of this.managedProcesses.keys()) {
      await this.stopStream(cameraId);
    }
    this.managedProcesses.clear();
  }

  /**
   * Query status for a single demonstration camera stream
   */
  public async getStreamStatus(cameraId: string): Promise<CameraReplayStatus> {
    const camera = await this.datasetAdapter.getSourceByCameraId(cameraId);
    if (!camera) {
      throw new Error(`Camera with ID '${cameraId}' not found in manifest`);
    }

    const managed = this.managedProcesses.get(cameraId);
    const targetRtspUrl = `rtsp://${this.gatewayHost}:${this.gatewayPort}/${camera.rtspPath}`;
    const hlsUrl = `${this.mediaGateway.hlsBase}/${camera.rtspPath}/index.m3u8`;

    // Query MediaMTX path status
    let mediaMtxReady = false;
    try {
      const pathState = await this.mediaGateway.getPathState(camera.rtspPath);
      mediaMtxReady = pathState.ready;
    } catch {
      // Fallback
    }

    const state: ReplayState = managed
      ? managed.state
      : mediaMtxReady
      ? 'STREAMING'
      : 'IDLE';

    const uptimeSeconds = managed?.startedAt
      ? Math.floor((Date.now() - managed.startedAt.getTime()) / 1000)
      : undefined;

    return {
      cameraId: camera.cameraId,
      rtspPath: camera.rtspPath,
      targetRtspUrl,
      hlsUrl,
      sourceType: camera.sourceType,
      licenseStatus: camera.licenseStatus,
      isSimulatedLive: true,
      state,
      pid: managed?.process?.pid,
      startedAt: managed?.startedAt,
      uptimeSeconds,
      restartCount: managed?.restartCount || 0,
      lastError: managed?.lastError,
      mediaMtxReady,
    };
  }

  /**
   * Query statuses for all demonstration camera streams
   */
  public async getAllStreamStatuses(): Promise<CameraReplayStatus[]> {
    const cameras = await this.datasetAdapter.getAllSources();
    const statuses: CameraReplayStatus[] = [];

    for (const cam of cameras) {
      const status = await this.getStreamStatus(cam.cameraId);
      statuses.push(status);
    }

    return statuses;
  }
}
