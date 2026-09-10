// ==============================================================================
// Stream URL Transformation Layer
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 5.2, Section 8.2) & docs/PHASE_4C_IMPLEMENTATION.md
// ==============================================================================

import { Camera, CameraStream } from '@/types/camera';

export interface StreamResolutionResult {
  playable: boolean;
  hlsUrl: string | null;
  reason?: string;
  stream: CameraStream | null;
}

/**
 * Default MediaMTX HLS Gateway URL for local and simulated feeds.
 * Browser-safe environment variable NEXT_PUBLIC_HLS_GATEWAY_URL can override.
 */
export function getHlsGatewayBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_HLS_GATEWAY_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:8888';
}

/**
 * Extracts the stream path from an RTSP URI (e.g. rtsp://simulator:8554/live/cam-ahm-01 -> live/cam-ahm-01)
 */
export function extractRtspPath(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();

  // Try native URL parser first
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    if (pathname) return pathname;
  } catch {
    // Fallback regex if runtime URL parser rejects rtsp protocol
  }

  const match = trimmed.match(/^rtsp:\/\/[^/]+\/(.+)$/i);
  if (match && match[1]) {
    return match[1].replace(/^\/+/, '');
  }

  return null;
}

/**
 * Pure function to resolve a browser-playable HLS stream URL from camera metadata.
 * Strictly adheres to zero-fake-video policy:
 * - If camera has an RTSP stream, resolves to MediaMTX HLS index.m3u8
 * - If camera has a direct HLS URL, returns it
 * - If camera has non-playable protocol (e.g. mock://), returns honest unplayable status
 * - Never returns a fake or placeholder video URL
 */
export function resolveCameraStream(camera: Camera | null | undefined): StreamResolutionResult {
  if (!camera) {
    return {
      playable: false,
      hlsUrl: null,
      reason: 'No camera selected',
      stream: null,
    };
  }

  if (!camera.streams || camera.streams.length === 0) {
    return {
      playable: false,
      hlsUrl: null,
      reason: `Camera ${camera.name} has no configured video streams in the registry.`,
      stream: null,
    };
  }

  // Choose the first stream as primary
  const primaryStream = camera.streams[0];
  const rawUrl = primaryStream.url_or_handle?.trim() || '';

  if (!rawUrl) {
    return {
      playable: false,
      hlsUrl: null,
      reason: `Camera ${camera.name} has an empty stream handle in the registry.`,
      stream: primaryStream,
    };
  }

  // 1. Direct HLS feed
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    if (rawUrl.includes('.m3u8')) {
      return {
        playable: true,
        hlsUrl: rawUrl,
        stream: primaryStream,
      };
    }
  }

  // 2. RTSP feed -> transform to MediaMTX HLS
  if (rawUrl.startsWith('rtsp://')) {
    const streamPath = extractRtspPath(rawUrl);
    if (!streamPath) {
      return {
        playable: false,
        hlsUrl: null,
        reason: `Invalid RTSP stream URI '${rawUrl}' for camera ${camera.name}.`,
        stream: primaryStream,
      };
    }

    const gatewayBase = getHlsGatewayBaseUrl();
    const hlsUrl = `${gatewayBase}/${streamPath}/index.m3u8`;

    return {
      playable: true,
      hlsUrl,
      stream: primaryStream,
    };
  }

  // 3. Unsupported protocol (e.g. mock://, file://, custom vendor protocol)
  let protocol = 'unknown';
  const protoMatch = rawUrl.match(/^([a-zA-Z0-9_-]+):\/\//);
  if (protoMatch && protoMatch[1]) {
    protocol = protoMatch[1];
  }

  return {
    playable: false,
    hlsUrl: null,
    reason: `Stream protocol '${protocol}' is not supported for browser playback. MediaMTX gateway requires a compatible RTSP or HLS feed.`,
    stream: primaryStream,
  };
}
