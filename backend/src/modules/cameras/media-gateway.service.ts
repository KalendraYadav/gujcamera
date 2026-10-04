import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';
import { sanitizeStreamUrl } from '../../common/utils/url-sanitizer.util';

export interface MediaGatewayHealth {
  isHealthy: boolean;
  activePathsCount: number;
  error?: string;
}

export interface DynamicPathRegistrationResult {
  success: boolean;
  pathName: string;
  internalRtspUrl: string;
  internalHlsUrl: string;
  isExternalSource: boolean;
  error?: string;
}

export interface MediaMtxPathState {
  name: string;
  confName?: string;
  sourceType?: string;
  ready: boolean;
  readyTime?: string;
  tracks?: string[];
  bytesReceived?: number;
  readersCount?: number;
}

export interface PathStateResult {
  exists: boolean;
  ready: boolean;
  state?: MediaMtxPathState;
  error?: string;
}

@Injectable()
export class MediaGatewayService {
  private readonly logger = new Logger(MediaGatewayService.name);
  public readonly apiUrl: string;
  public readonly internalRtspBase: string;
  public readonly hlsBase: string;
  public readonly apiUser?: string;
  public readonly apiPassword?: string;

  constructor(private readonly configService: ConfigService) {
    const rawApiUrl = this.configService.get<string>('MEDIAMTX_API_URL', 'http://localhost:9997');
    this.apiUrl = rawApiUrl.replace(/\/+$/, '');

    const rawRtspBase = this.configService.get<string>(
      'MEDIAMTX_INTERNAL_RTSP_BASE_URL',
      'rtsp://video-gateway:8554',
    );
    this.internalRtspBase = rawRtspBase.replace(/\/+$/, '');

    const rawHlsBase = this.configService.get<string>('HLS_GATEWAY_URL', 'http://localhost:8888');
    this.hlsBase = rawHlsBase.replace(/\/+$/, '');

    this.apiUser = this.configService.get<string>('MEDIAMTX_API_USER');
    this.apiPassword = this.configService.get<string>('MEDIAMTX_API_PASSWORD');
  }

  /**
   * Normalize human-readable camera name or code to a MediaMTX URL-safe path name.
   * MediaMTX API v3 route (:name) requires flat path identifiers without slashes.
   * Example: 'CAM-AHM-01: SG Highway - Pakwan Crossroad' -> 'cam-ahm-01'
   * Example: 'CAM-SUR-01' -> 'cam-sur-01'
   */
  normalizePathName(cameraNameOrCode: string, fallbackUuid: string): string {
    if (!cameraNameOrCode) {
      return `cam-${fallbackUuid.slice(0, 8)}`;
    }

    const trimmed = cameraNameOrCode.trim();

    // Check for standard Police camera code prefix, e.g. "CAM-AHM-01: ..." or "CAM-AHM-01"
    const prefixMatch = trimmed.match(/^(CAM[-_][A-Za-z0-9_-]+)(?::|\s|$)/i);
    if (prefixMatch && prefixMatch[1]) {
      const code = prefixMatch[1].toLowerCase();
      if (/^[a-z0-9_-]+$/.test(code) && code.length >= 3) {
        return code;
      }
    }

    // Fallback: slugify full name
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);

    if (slug.length >= 3) {
      return slug.startsWith('cam-') ? slug : `cam-${slug}`;
    }

    return `cam-${fallbackUuid.slice(0, 8)}`;
  }

  /**
   * Determine if a stream URL is an existing internal gateway/simulator stream
   */
  isInternalGatewayStream(streamUrl: string): boolean {
    if (!streamUrl) return false;
    const lower = streamUrl.toLowerCase();
    return (
      lower.includes('video-gateway:8554') ||
      lower.includes('simulator:8554') ||
      lower.includes('localhost:8554') ||
      lower.includes('127.0.0.1:8554')
    );
  }

  /**
   * Determine if a stream URL is an external source that MediaMTX can pull.
   * MediaMTX supports pulling from rtsp://, rtsps://, rtmp://, rtmps://, http://, https://, srt://, udp://.
   * Non-routable or placeholder protocols (such as mock://, custom://, file://) cannot be pulled.
   * Internal gateway streams (video-gateway, simulator, localhost) are published into MediaMTX, not pulled.
   */
  isPullableExternalSource(streamUrl: string): boolean {
    if (!streamUrl) return false;
    if (this.isInternalGatewayStream(streamUrl)) return false;
    const lower = streamUrl.toLowerCase().trim();
    return (
      lower.startsWith('rtsp://') ||
      lower.startsWith('rtsps://') ||
      lower.startsWith('rtmp://') ||
      lower.startsWith('rtmps://') ||
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('srt://') ||
      lower.startsWith('udp://')
    );
  }

  /**
   * Check if a stream URL is a mock or placeholder protocol (e.g. mock://, custom://, placeholder://)
   */
  isPlaceholderStream(streamUrl: string): boolean {
    if (!streamUrl) return false;
    const lower = streamUrl.toLowerCase().trim();
    return (
      lower.startsWith('mock://') ||
      lower.startsWith('placeholder://') ||
      lower.startsWith('custom://') ||
      lower.startsWith('vendor://')
    );
  }

  /**
   * Extract stream path from an RTSP URL (e.g. rtsp://host:8554/cam-ahm-01 -> cam-ahm-01)
   */
  extractStreamPath(streamUrl: string): string {
    if (!streamUrl) return '';
    try {
      const parsed = new URL(streamUrl);
      return parsed.pathname.replace(/^\/+/, '');
    } catch {
      const match = streamUrl.match(/^rtsp:\/\/[^/]+\/(.+)$/i);
      return match && match[1] ? match[1].replace(/^\/+/, '') : '';
    }
  }

  /**
   * Sanitize URL to mask credentials in log messages
   */
  sanitizeUrl(url: string): string {
    return sanitizeStreamUrl(url);
  }

  /**
   * Probe MediaMTX API health and list of active paths
   */
  async checkHealth(timeoutMs = 3000): Promise<MediaGatewayHealth> {
    try {
      const response = await this.httpRequest('GET', `${this.apiUrl}/v3/paths/list`, null, timeoutMs);
      if (response.statusCode >= 200 && response.statusCode < 300) {
        let activePathsCount = 0;
        try {
          const body = JSON.parse(response.body);
          activePathsCount = body.items ? body.items.length : 0;
        } catch {}
        return { isHealthy: true, activePathsCount };
      }
      return {
        isHealthy: false,
        activePathsCount: 0,
        error: `MediaMTX returned HTTP ${response.statusCode}`,
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        activePathsCount: 0,
        error: `MediaMTX API unreachable at ${this.apiUrl}: ${err.message}`,
      };
    }
  }

  /**
   * Retrieve current path configuration from MediaMTX
   */
  async getPathConfig(pathName: string, timeoutMs = 3000): Promise<{ exists: boolean; config?: any; error?: string }> {
    try {
      const safePath = encodeURIComponent(pathName);
      const response = await this.httpRequest('GET', `${this.apiUrl}/v3/config/paths/get/${safePath}`, null, timeoutMs);
      if (response.statusCode === 200) {
        const config = JSON.parse(response.body);
        return { exists: true, config };
      }
      if (response.statusCode === 404) {
        return { exists: false };
      }
      return {
        exists: false,
        error: `MediaMTX returned HTTP ${response.statusCode}`,
      };
    } catch (err: any) {
      return {
        exists: false,
        error: err.message,
      };
    }
  }

  /**
   * Query runtime state for all active paths in MediaMTX in a single call.
   * Highly scalable for large camera estates as it avoids 1 HTTP call per camera.
   */
  async listPathStates(
    timeoutMs = 4000,
  ): Promise<{ success: boolean; paths: Map<string, MediaMtxPathState>; error?: string }> {
    const map = new Map<string, MediaMtxPathState>();
    try {
      const response = await this.httpRequest('GET', `${this.apiUrl}/v3/paths/list`, null, timeoutMs);
      if (response.statusCode >= 200 && response.statusCode < 300) {
        const body = JSON.parse(response.body);
        const items = Array.isArray(body.items) ? body.items : [];
        for (const item of items) {
          if (item && item.name) {
            map.set(item.name, {
              name: item.name,
              confName: item.confName,
              sourceType: item.source ? item.source.type : undefined,
              ready: Boolean(item.ready),
              readyTime: item.readyTime,
              tracks: Array.isArray(item.tracks) ? item.tracks : undefined,
              bytesReceived: typeof item.bytesReceived === 'number' ? item.bytesReceived : undefined,
              readersCount: Array.isArray(item.readers) ? item.readers.length : 0,
            });
          }
        }
        return { success: true, paths: map };
      }
      return {
        success: false,
        paths: map,
        error: `MediaMTX returned HTTP ${response.statusCode}`,
      };
    } catch (err: any) {
      return {
        success: false,
        paths: map,
        error: `MediaMTX API unreachable at ${this.apiUrl}: ${err.message}`,
      };
    }
  }

  /**
   * Authoritative runtime state for a specific camera stream path from MediaMTX control API.
   * Uses GET /v3/paths/get/<path>
   */
  async getPathState(pathName: string, timeoutMs = 3000): Promise<PathStateResult> {
    try {
      const safePath = encodeURIComponent(pathName);
      const response = await this.httpRequest('GET', `${this.apiUrl}/v3/paths/get/${safePath}`, null, timeoutMs);
      if (response.statusCode === 200) {
        const item = JSON.parse(response.body);
        return {
          exists: true,
          ready: Boolean(item.ready),
          state: {
            name: item.name || pathName,
            confName: item.confName,
            sourceType: item.source ? item.source.type : undefined,
            ready: Boolean(item.ready),
            readyTime: item.readyTime,
            tracks: Array.isArray(item.tracks) ? item.tracks : undefined,
            bytesReceived: typeof item.bytesReceived === 'number' ? item.bytesReceived : undefined,
            readersCount: Array.isArray(item.readers) ? item.readers.length : 0,
          },
        };
      }
      if (response.statusCode === 404) {
        return { exists: false, ready: false };
      }
      return {
        exists: false,
        ready: false,
        error: `MediaMTX returned HTTP ${response.statusCode}`,
      };
    } catch (err: any) {
      return {
        exists: false,
        ready: false,
        error: err.message,
      };
    }
  }

  /**
   * Dynamically register or update a camera stream path in MediaMTX.
   * If the stream is an external RTSP source, MediaMTX is instructed to pull the stream.
   * Returns normalized internal RTSP URL for downstream AI and HLS URL for frontend.
   */
  async registerPath(
    pathName: string,
    sourceUrl: string,
    timeoutMs = 4000,
  ): Promise<DynamicPathRegistrationResult> {
    const isInternal = this.isInternalGatewayStream(sourceUrl);
    const sanitizedSource = this.sanitizeUrl(sourceUrl);
    const safePath = encodeURIComponent(pathName);

    const internalRtspUrl = `${this.internalRtspBase}/${pathName}`;
    const internalHlsUrl = `${this.hlsBase}/${pathName}/index.m3u8`;

    // If source is already published internally (e.g. synthetic FFmpeg loop), check if path exists
    if (isInternal) {
      this.logger.log(
        `[MediaGateway] Path '${pathName}' references internal gateway stream: ${sanitizedSource}`,
      );
      return {
        success: true,
        pathName,
        internalRtspUrl: sourceUrl,
        internalHlsUrl,
        isExternalSource: false,
      };
    }

    // If source is a mock or placeholder protocol, do not register in MediaMTX
    if (this.isPlaceholderStream(sourceUrl) || !this.isPullableExternalSource(sourceUrl)) {
      this.logger.log(
        `[MediaGateway] Path '${pathName}' has non-routable/placeholder source: ${sanitizedSource}. Skipping MediaMTX registration.`,
      );
      return {
        success: false,
        pathName,
        internalRtspUrl: sourceUrl,
        internalHlsUrl,
        isExternalSource: false,
        error: `Unsupported stream protocol: '${sanitizedSource}' is a placeholder or mock source and cannot be registered in MediaMTX`,
      };
    }

    try {
      // Step 1: Check if path already exists in MediaMTX
      const existing = await this.getPathConfig(pathName, timeoutMs);

      if (existing.exists) {
        // Path exists: PATCH configuration to update source
        this.logger.log(`[MediaGateway] Updating existing MediaMTX path '${pathName}' -> ${sanitizedSource}`);
        const patchPayload = JSON.stringify({
          source: sourceUrl,
          sourceOnDemand: false,
        });

        const patchRes = await this.httpRequest(
          'PATCH',
          `${this.apiUrl}/v3/config/paths/patch/${safePath}`,
          patchPayload,
          timeoutMs,
        );

        if (patchRes.statusCode === 200) {
          this.logger.log(`[MediaGateway] Successfully patched path '${pathName}'`);
          return {
            success: true,
            pathName,
            internalRtspUrl,
            internalHlsUrl,
            isExternalSource: true,
          };
        } else {
          throw new Error(`MediaMTX PATCH failed with HTTP ${patchRes.statusCode}: ${this.sanitizeUrl(patchRes.body)}`);
        }
      } else {
        // Path does not exist: POST to add new path configuration
        this.logger.log(`[MediaGateway] Registering new MediaMTX path '${pathName}' -> ${sanitizedSource}`);
        const addPayload = JSON.stringify({
          source: sourceUrl,
          sourceOnDemand: false,
        });

        const addRes = await this.httpRequest(
          'POST',
          `${this.apiUrl}/v3/config/paths/add/${safePath}`,
          addPayload,
          timeoutMs,
        );

        if (addRes.statusCode === 200 || addRes.statusCode === 201) {
          this.logger.log(`[MediaGateway] Successfully registered path '${pathName}'`);
          return {
            success: true,
            pathName,
            internalRtspUrl,
            internalHlsUrl,
            isExternalSource: true,
          };
        } else {
          throw new Error(`MediaMTX ADD failed with HTTP ${addRes.statusCode}: ${this.sanitizeUrl(addRes.body)}`);
        }
      }
    } catch (err: any) {
      const safeErrorMsg = this.sanitizeUrl(err.message || 'Media gateway communication error');
      this.logger.error(
        `[MediaGateway] Failed to register path '${pathName}' (${sanitizedSource}): ${safeErrorMsg}`,
      );
      return {
        success: false,
        pathName,
        internalRtspUrl,
        internalHlsUrl,
        isExternalSource: true,
        error: `Media Gateway registration failed for path '${pathName}': ${safeErrorMsg}`,
      };
    }
  }

  /**
   * Deactivate/remove a dynamic path from MediaMTX when a camera is decommissioned
   */
  async removePath(pathName: string, timeoutMs = 3000): Promise<{ success: boolean; error?: string }> {
    try {
      const safePath = encodeURIComponent(pathName);
      this.logger.log(`[MediaGateway] Deleting MediaMTX path '${pathName}'`);

      const response = await this.httpRequest(
        'DELETE',
        `${this.apiUrl}/v3/config/paths/delete/${safePath}`,
        null,
        timeoutMs,
      );

      if (response.statusCode === 200 || response.statusCode === 404) {
        this.logger.log(`[MediaGateway] Path '${pathName}' removed from MediaMTX`);
        return { success: true };
      }

      return {
        success: false,
        error: `MediaMTX DELETE returned HTTP ${response.statusCode}: ${this.sanitizeUrl(response.body)}`,
      };
    } catch (err: any) {
      const safeErrorMsg = this.sanitizeUrl(err.message);
      this.logger.error(`[MediaGateway] Error deleting path '${pathName}': ${safeErrorMsg}`);
      return { success: false, error: safeErrorMsg };
    }
  }

  /**
   * Generic HTTP/HTTPS request utility with strict timeout, Basic Auth, and no third-party dependencies
   */
  private httpRequest(
    method: string,
    targetUrl: string,
    body: string | null = null,
    timeoutMs = 3000,
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(targetUrl);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers: Record<string, string | number> = {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body, 'utf8') } : {}),
          'User-Agent': 'NETRAVAHA-MediaGatewayClient/1.0',
        };

        if (this.apiUser && this.apiPassword) {
          const authBase64 = Buffer.from(`${this.apiUser}:${this.apiPassword}`).toString('base64');
          headers['Authorization'] = `Basic ${authBase64}`;
        }

        const options = {
          hostname: parsed.hostname,
          port: parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80,
          path: parsed.pathname + parsed.search,
          method,
          headers,
          timeout: timeoutMs,
        };

        const req = client.request(options, (res) => {
          let responseBody = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            responseBody += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 200,
              body: responseBody,
            });
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error(`MediaMTX request timed out after ${timeoutMs}ms`));
        });

        req.on('error', (err) => {
          reject(err);
        });

        if (body) {
          req.write(body);
        }
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
