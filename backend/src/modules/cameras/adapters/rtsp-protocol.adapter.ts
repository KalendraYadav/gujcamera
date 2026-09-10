import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import { CameraProtocol } from '@prisma/client';
import {
  CameraProtocolAdapter,
  ProtocolConnectionConfig,
  ConnectionProbeResult,
  AdapterConnectionStatus,
  StreamMetadata,
} from './camera-protocol-adapter.interface';

@Injectable()
export class RtspProtocolAdapter implements CameraProtocolAdapter {
  readonly protocol = CameraProtocol.RTSP;
  private readonly logger = new Logger(RtspProtocolAdapter.name);

  /**
   * Validate RTSP endpoint configuration
   */
  validateConfig(config: ProtocolConnectionConfig): { isValid: boolean; error?: string } {
    if (!config.endpointUrl) {
      return { isValid: false, error: 'RTSP endpoint URL is required' };
    }

    try {
      const parsed = new URL(config.endpointUrl);
      if (parsed.protocol !== 'rtsp:') {
        return { isValid: false, error: "RTSP URL must begin with 'rtsp://'" };
      }
      if (!parsed.hostname) {
        return { isValid: false, error: 'RTSP URL must contain a valid hostname or IP address' };
      }
      return { isValid: true };
    } catch {
      return { isValid: false, error: 'Malformed RTSP URL structure' };
    }
  }

  /**
   * Execute real RFC 2326 RTSP socket probe over TCP
   */
  async probeConnection(config: ProtocolConnectionConfig): Promise<ConnectionProbeResult> {
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      return {
        status: AdapterConnectionStatus.ERROR,
        protocol: this.protocol,
        reachable: false,
        latencyMs: 0,
        errorMessage: validation.error,
        testedAt: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    const timeoutMs = config.timeoutMs || 5000;
    const sanitizedUrl = this.sanitizeUrl(config.endpointUrl);

    try {
      const parsed = new URL(config.endpointUrl);
      const host = parsed.hostname;
      const port = parsed.port ? parseInt(parsed.port, 10) : 554;
      const path = parsed.pathname || '/';

      const probeOutcome = await this.executeRtspSocketProbe(host, port, path, sanitizedUrl, timeoutMs);
      const latencyMs = Date.now() - startTime;

      return {
        status: probeOutcome.status,
        protocol: this.protocol,
        reachable: probeOutcome.reachable,
        latencyMs,
        streamMetadata: probeOutcome.metadata,
        errorMessage: probeOutcome.errorMessage,
        testedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      this.logger.warn(`RTSP probe failure for ${sanitizedUrl}: ${err.message}`);
      return {
        status: AdapterConnectionStatus.OFFLINE,
        protocol: this.protocol,
        reachable: false,
        latencyMs,
        errorMessage: `RTSP Connection Failed: ${err.message || 'Unknown network error'}`,
        testedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Issue standard RFC 2326 OPTIONS and DESCRIBE requests via Node.js net.Socket
   */
  private executeRtspSocketProbe(
    host: string,
    port: number,
    path: string,
    sanitizedUrl: string,
    timeoutMs: number,
  ): Promise<{
    status: AdapterConnectionStatus;
    reachable: boolean;
    metadata?: StreamMetadata;
    errorMessage?: string;
  }> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let buffer = '';
      let resolved = false;

      const safeResolve = (result: {
        status: AdapterConnectionStatus;
        reachable: boolean;
        metadata?: StreamMetadata;
        errorMessage?: string;
      }) => {
        if (!resolved) {
          resolved = true;
          socket.removeAllListeners();
          socket.destroy();
          resolve(result);
        }
      };

      socket.setTimeout(timeoutMs);

      socket.on('timeout', () => {
        safeResolve({
          status: AdapterConnectionStatus.OFFLINE,
          reachable: false,
          errorMessage: `RTSP connection timed out after ${timeoutMs}ms`,
        });
      });

      socket.on('error', (err: any) => {
        let message = 'Connection refused or host unreachable';
        if (err.code === 'ECONNREFUSED') {
          message = `Connection refused at ${host}:${port}`;
        } else if (err.code === 'ENOTFOUND') {
          message = `DNS lookup failed for host ${host}`;
        } else if (err.code === 'ETIMEDOUT') {
          message = `Connection timed out at ${host}:${port}`;
        }
        safeResolve({
          status: AdapterConnectionStatus.OFFLINE,
          reachable: false,
          errorMessage: message,
        });
      });

      let currentStep = 'OPTIONS';
      let publicVerbs = '';

      socket.connect(port, host, () => {
        // Step 1: Query capabilities via RFC 2326 OPTIONS
        const optionsRequest =
          `OPTIONS rtsp://${host}:${port}${path} RTSP/1.0\r\n` +
          `CSeq: 1\r\n` +
          `User-Agent: GujCamera-ProtocolAdapter/1.0\r\n\r\n`;

        socket.write(optionsRequest);
      });

      socket.on('data', (data) => {
        buffer += data.toString('utf-8');

        if (currentStep === 'OPTIONS' && buffer.includes('\r\n\r\n')) {
          const [headersPart] = buffer.split('\r\n\r\n');
          const statusLine = headersPart.split('\r\n')[0] || '';

          if (statusLine.includes(' 200 OK')) {
            // Extract Public header if present
            const publicMatch = headersPart.match(/Public:\s*([^\r\n]+)/i);
            if (publicMatch) {
              publicVerbs = publicMatch[1].trim();
            }

            // Transition to Step 2: DESCRIBE with SDP negotiation
            currentStep = 'DESCRIBE';
            buffer = '';

            const describeRequest =
              `DESCRIBE rtsp://${host}:${port}${path} RTSP/1.0\r\n` +
              `CSeq: 2\r\n` +
              `Accept: application/sdp\r\n` +
              `User-Agent: GujCamera-ProtocolAdapter/1.0\r\n\r\n`;

            socket.write(describeRequest);
            return;
          } else if (statusLine.includes(' 401 Unauthorized')) {
            safeResolve({
              status: AdapterConnectionStatus.DEGRADED,
              reachable: true,
              errorMessage: 'RTSP Authentication Required (401 Unauthorized)',
            });
            return;
          } else if (statusLine.includes(' 404 Not Found')) {
            safeResolve({
              status: AdapterConnectionStatus.OFFLINE,
              reachable: true,
              errorMessage: 'RTSP Stream Not Found (404)',
            });
            return;
          } else {
            safeResolve({
              status: AdapterConnectionStatus.ERROR,
              reachable: true,
              errorMessage: `RTSP OPTIONS Error Response: ${statusLine.trim()}`,
            });
            return;
          }
        }

        if (currentStep === 'DESCRIBE' && buffer.includes('\r\n\r\n')) {
          const [headersPart, ...bodyParts] = buffer.split('\r\n\r\n');
          const sdpBody = bodyParts.join('\r\n\r\n');
          const statusLine = headersPart.split('\r\n')[0] || '';

          if (statusLine.includes(' 200 OK')) {
            const metadata = this.parseSdp(sdpBody, sanitizedUrl);
            if (publicVerbs && metadata.rawDetails) {
              metadata.rawDetails.publicVerbs = publicVerbs;
            }
            safeResolve({
              status: AdapterConnectionStatus.CONNECTED,
              reachable: true,
              metadata,
            });
          } else if (statusLine.includes(' 401 Unauthorized')) {
            safeResolve({
              status: AdapterConnectionStatus.DEGRADED,
              reachable: true,
              errorMessage: 'RTSP Authentication Required (401 Unauthorized)',
            });
          } else if (statusLine.includes(' 404 Not Found')) {
            safeResolve({
              status: AdapterConnectionStatus.OFFLINE,
              reachable: true,
              errorMessage: 'RTSP Stream Not Found (404)',
            });
          } else {
            safeResolve({
              status: AdapterConnectionStatus.ERROR,
              reachable: true,
              errorMessage: `RTSP DESCRIBE Error Response: ${statusLine.trim()}`,
            });
          }
        }
      });
    });
  }

  /**
   * Parse Session Description Protocol (SDP) payload
   */
  private parseSdp(sdp: string, streamUri: string): StreamMetadata {
    let codec = 'H264';
    let resolution = '1920x1080';
    let fps = 25;

    const lines = sdp.split(/\r?\n/);
    for (const line of lines) {
      // Look for rtpmap, e.g. a=rtpmap:96 H264/90000 or H265/90000
      if (line.startsWith('a=rtpmap:')) {
        const parts = line.substring(9).trim().split(' ');
        if (parts[1]) {
          const encodingParts = parts[1].split('/');
          const enc = encodingParts[0].toUpperCase();
          if (enc === 'H264' || enc === 'H265' || enc === 'MP4V-ES' || enc === 'VP8' || enc === 'VP9') {
            codec = enc;
          }
        }
      }

      // Look for frame rate or resolution hints if provided in fmtp
      if (line.includes('framerate=')) {
        const match = line.match(/framerate=([0-9.]+)/i);
        if (match && match[1]) {
          fps = Math.round(parseFloat(match[1]));
        }
      }
    }

    return {
      codec,
      resolution,
      fps,
      streamUri,
      rawDetails: {
        protocol: 'RTSP/1.0',
        sdpLength: sdp.length,
      },
    };
  }

  /**
   * Sanitize RTSP URL by redacting credentials
   */
  private sanitizeUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      if (parsed.password || parsed.username) {
        parsed.username = '***';
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return urlStr.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    }
  }
}
