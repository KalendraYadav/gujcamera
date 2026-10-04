// ==============================================================================
// NETRAVAHA — Dataset Source Adapter Service
// Gujarat Police Innovation Challenge 2026
// Implements IDatasetSource for Demonstration Feeds
// ==============================================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  DemonstrationManifest,
  ManifestCameraEntry,
  ManifestValidationReport,
  SourceValidationResult,
  IDatasetSource,
} from './dataset-manifest.types';

@Injectable()
export class DatasetAdapterService implements IDatasetSource, OnModuleInit {
  private readonly logger = new Logger(DatasetAdapterService.name);
  private manifestCache: DemonstrationManifest | null = null;
  private readonly workspaceRoot: string;
  private readonly manifestFilePath: string;

  constructor(private readonly configService: ConfigService) {
    // Resolve repository workspace root
    this.workspaceRoot = path.resolve(__dirname, '../../../../..');
    const customManifest = this.configService.get<string>('DEMONSTRATION_MANIFEST_PATH');
    this.manifestFilePath = customManifest
      ? path.resolve(this.workspaceRoot, customManifest)
      : path.resolve(this.workspaceRoot, 'fixtures/manifests/demonstration_manifest.json');
  }

  async onModuleInit() {
    this.logger.log(`[DatasetAdapter] Initializing dataset adapter from manifest: ${this.manifestFilePath}`);
    try {
      await this.getManifest();
      const report = await this.validateAllSources();
      this.logger.log(
        `[DatasetAdapter] Manifest verified: ${report.validCameras}/${report.totalCameras} cameras valid. Unverified licenses: ${report.unverifiedLicenseCount}.`,
      );
      if (report.unverifiedLicenseCount > 0) {
        this.logger.warn(
          `[DatasetAdapter] Note: ${report.unverifiedLicenseCount} sources have license status LICENSE_VERIFICATION_REQUIRED. Kept strictly as development fixtures.`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`[DatasetAdapter] Manifest initialization notice: ${err.message}`);
    }
  }

  /**
   * Resolve relative video path against repository workspace root
   */
  public resolveVideoPath(relPath: string): string {
    if (path.isAbsolute(relPath)) {
      return relPath;
    }
    return path.resolve(this.workspaceRoot, relPath);
  }

  /**
   * Load and cache demonstration manifest JSON
   */
  public async getManifest(forceReload = false): Promise<DemonstrationManifest> {
    if (this.manifestCache && !forceReload) {
      return this.manifestCache;
    }

    if (!fs.existsSync(this.manifestFilePath)) {
      throw new Error(`Demonstration manifest file not found at: ${this.manifestFilePath}`);
    }

    const raw = fs.readFileSync(this.manifestFilePath, 'utf8');
    const parsed: DemonstrationManifest = JSON.parse(raw);

    if (!parsed.manifestVersion || !Array.isArray(parsed.cameras)) {
      throw new Error('Malformed manifest: missing required manifestVersion or cameras array');
    }

    this.manifestCache = parsed;
    return parsed;
  }

  /**
   * Retrieve single camera demonstration record by camera ID
   */
  public async getSourceByCameraId(cameraId: string): Promise<ManifestCameraEntry | null> {
    const manifest = await this.getManifest();
    const entry = manifest.cameras.find(
      (c) => c.cameraId.toLowerCase() === cameraId.toLowerCase(),
    );
    return entry || null;
  }

  /**
   * Retrieve all configured demonstration cameras from manifest
   */
  public async getAllSources(): Promise<ManifestCameraEntry[]> {
    const manifest = await this.getManifest();
    return manifest.cameras;
  }

  /**
   * Compute authentic SHA-256 digest of a video file on disk
   */
  public async computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`File not found: ${filePath}`));
      }
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Validate a single camera source entry
   */
  public async validateSource(camera: ManifestCameraEntry): Promise<SourceValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const resolvedPath = this.resolveVideoPath(camera.videoPath);
    const fileExists = fs.existsSync(resolvedPath);

    if (!fileExists) {
      errors.push(`Video asset not found at path: ${resolvedPath}`);
    }

    let hashMatched = false;
    let computedHash: string | undefined = undefined;

    if (fileExists) {
      try {
        computedHash = await this.computeFileSha256(resolvedPath);
        if (computedHash.toLowerCase() === camera.sha256.toLowerCase()) {
          hashMatched = true;
        } else {
          errors.push(
            `SHA-256 digest mismatch. Expected: ${camera.sha256}, Computed: ${computedHash}`,
          );
        }
      } catch (err: any) {
        errors.push(`Failed to compute file digest: ${err.message}`);
      }
    }

    // Metadata validation
    let metadataValid = true;
    if (camera.width <= 0 || camera.height <= 0) {
      errors.push(`Invalid video dimensions: ${camera.width}x${camera.height}`);
      metadataValid = false;
    }
    if (camera.fps <= 0) {
      errors.push(`Invalid video FPS: ${camera.fps}`);
      metadataValid = false;
    }
    if (camera.duration <= 0) {
      errors.push(`Invalid video duration: ${camera.duration}s`);
      metadataValid = false;
    }
    if (!camera.rtspPath || !/^[a-z0-9_-]+$/i.test(camera.rtspPath)) {
      errors.push(`Invalid or unsafe RTSP path slug: '${camera.rtspPath}'`);
      metadataValid = false;
    }

    // License and Provenance discipline
    if (camera.licenseStatus === 'LICENSE_VERIFICATION_REQUIRED') {
      warnings.push(
        `License status is LICENSE_VERIFICATION_REQUIRED. Source permitted as local development fixture only, not approved production media.`,
      );
    }

    const valid = errors.length === 0 && fileExists && hashMatched && metadataValid;

    return {
      valid,
      cameraId: camera.cameraId,
      sourceId: camera.sourceId,
      videoPath: camera.videoPath,
      resolvedAbsolutePath: resolvedPath,
      fileExists,
      hashMatched,
      computedHash,
      expectedHash: camera.sha256,
      metadataValid,
      licenseStatus: camera.licenseStatus,
      errors,
      warnings,
    };
  }

  /**
   * Validate all camera source entries in the manifest
   */
  public async validateAllSources(): Promise<ManifestValidationReport> {
    const manifest = await this.getManifest();
    const results: SourceValidationResult[] = [];

    for (const camera of manifest.cameras) {
      const res = await this.validateSource(camera);
      results.push(res);
    }

    const validCameras = results.filter((r) => r.valid).length;
    const invalidCameras = results.filter((r) => !r.valid).length;
    const unverifiedLicenseCount = results.filter(
      (r) => r.licenseStatus === 'LICENSE_VERIFICATION_REQUIRED',
    ).length;

    return {
      valid: invalidCameras === 0,
      manifestVersion: manifest.manifestVersion,
      totalCameras: manifest.cameras.length,
      validCameras,
      invalidCameras,
      results,
      unverifiedLicenseCount,
      timestamp: new Date().toISOString(),
    };
  }
}
