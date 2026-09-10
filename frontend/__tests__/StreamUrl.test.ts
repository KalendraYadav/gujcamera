// ==============================================================================
// Stream URL Transformation Unit Tests
// Gujarat Police Innovation Challenge 2026
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveCameraStream,
  extractRtspPath,
  getHlsGatewayBaseUrl,
} from '@/lib/api/stream';
import { Camera } from '@/types/camera';

describe('Stream URL Transformation Layer', () => {
  const originalEnv = process.env.NEXT_PUBLIC_HLS_GATEWAY_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_HLS_GATEWAY_URL = 'http://localhost:8888';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_HLS_GATEWAY_URL = originalEnv;
  });

  describe('extractRtspPath', () => {
    it('correctly extracts stream path from internal simulator RTSP URI', () => {
      const path = extractRtspPath('rtsp://simulator:8554/live/cam-ahm-01');
      expect(path).toBe('live/cam-ahm-01');
    });

    it('correctly extracts stream path with deep path segments', () => {
      const path = extractRtspPath('rtsp://video-gateway:8554/surat/zone-1/cam-01');
      expect(path).toBe('surat/zone-1/cam-01');
    });

    it('returns null for empty or invalid RTSP URIs', () => {
      expect(extractRtspPath('')).toBeNull();
      expect(extractRtspPath('not-a-url')).toBeNull();
    });
  });

  describe('getHlsGatewayBaseUrl', () => {
    it('returns default gateway URL if env var is empty', () => {
      delete process.env.NEXT_PUBLIC_HLS_GATEWAY_URL;
      expect(getHlsGatewayBaseUrl()).toBe('http://localhost:8888');
    });

    it('strips trailing slashes from custom gateway URL', () => {
      process.env.NEXT_PUBLIC_HLS_GATEWAY_URL = 'https://cctv-edge.gujaratpolice.gov.in:8888/';
      expect(getHlsGatewayBaseUrl()).toBe('https://cctv-edge.gujaratpolice.gov.in:8888');
    });
  });

  describe('resolveCameraStream', () => {
    const baseCamera: Camera = {
      id: 'cam-001',
      name: 'CAM-AHM-01',
      department_id: 'dept-01',
      lat: 23.0225,
      long: 72.5714,
      protocol: 'RTSP',
      connector_type_id: 'conn-01',
      operational_status: 'ONLINE',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      location: { address: 'Ashram Road', zone: 'West', district: 'Ahmedabad' },
      streams: [
        {
          id: 'stream-01',
          codec: 'H264',
          resolution: '1920x1080',
          fps: 25,
          url_or_handle: 'rtsp://simulator:8554/live/cam-ahm-01',
        },
      ],
      health: {
        status: 'ONLINE',
        last_heartbeat: '2026-01-01T00:00:00Z',
        fps_actual: 24.8,
        packet_loss: 0.01,
      },
    };

    it('transforms RTSP stream into MediaMTX HLS URL', () => {
      const result = resolveCameraStream(baseCamera);
      expect(result.playable).toBe(true);
      expect(result.hlsUrl).toBe('http://localhost:8888/live/cam-ahm-01/index.m3u8');
      expect(result.stream?.codec).toBe('H264');
    });

    it('honors direct HLS URLs without re-mangling', () => {
      const directHlsCamera: Camera = {
        ...baseCamera,
        streams: [
          {
            id: 'stream-hls',
            codec: 'H264',
            resolution: '1920x1080',
            fps: 25,
            url_or_handle: 'https://edge.police.gov/streams/cam-ahm-01/index.m3u8',
          },
        ],
      };

      const result = resolveCameraStream(directHlsCamera);
      expect(result.playable).toBe(true);
      expect(result.hlsUrl).toBe('https://edge.police.gov/streams/cam-ahm-01/index.m3u8');
    });

    it('honestly rejects unsupported protocols like mock:// with clear reason', () => {
      const mockCamera: Camera = {
        ...baseCamera,
        name: 'CAM-GND-01',
        streams: [
          {
            id: 'stream-mock',
            codec: 'MOCK',
            resolution: '1920x1080',
            fps: 30,
            url_or_handle: 'mock://vendor-a/gnd-sec-01',
          },
        ],
      };

      const result = resolveCameraStream(mockCamera);
      expect(result.playable).toBe(false);
      expect(result.hlsUrl).toBeNull();
      expect(result.reason).toContain("Stream protocol 'mock' is not supported for browser playback");
    });

    it('handles camera with no configured streams', () => {
      const noStreamCamera: Camera = {
        ...baseCamera,
        streams: [],
      };

      const result = resolveCameraStream(noStreamCamera);
      expect(result.playable).toBe(false);
      expect(result.hlsUrl).toBeNull();
      expect(result.reason).toContain('no configured video streams');
    });

    it('handles null camera input safely', () => {
      const result = resolveCameraStream(null);
      expect(result.playable).toBe(false);
      expect(result.hlsUrl).toBeNull();
      expect(result.reason).toBe('No camera selected');
    });
  });
});
