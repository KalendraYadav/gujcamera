import { describe, it, expect, vi, beforeEach } from 'vitest';
import { camerasApi } from '@/lib/api/cameras';
import { apiClient } from '@/lib/api/client';
import { CameraListResponse, CameraHealthSummary } from '@/types/camera';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Camera API Client (Phase 4B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries cameras without parameters returning full endpoint /cameras', async () => {
    const mockResponse: CameraListResponse = {
      data: [],
      pagination: { limit: 20, total: 0, next_cursor: null },
    };
    (apiClient.get as any).mockResolvedValueOnce(mockResponse);

    const result = await camerasApi.getCameras();
    expect(apiClient.get).toHaveBeenCalledWith('/cameras');
    expect(result).toEqual(mockResponse);
  });

  it('correctly constructs PostGIS spatial bounding box query parameters', async () => {
    const mockResponse: CameraListResponse = {
      data: [],
      pagination: { limit: 50, total: 0, next_cursor: null },
    };
    (apiClient.get as any).mockResolvedValueOnce(mockResponse);

    const bbox = '72.500000,23.000000,72.650000,23.250000';
    await camerasApi.getCameras({ bbox, limit: 50 });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/cameras?bbox=72.500000%2C23.000000%2C72.650000%2C23.250000&limit=50'
    );
  });

  it('filters cameras by operational status and department ID', async () => {
    (apiClient.get as any).mockResolvedValueOnce({ data: [], pagination: { limit: 20, total: 0, next_cursor: null } });

    await camerasApi.getCameras({
      status: 'ONLINE',
      department_id: 'dept-ahmedabad-uuid',
      is_active: true,
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/cameras?status=ONLINE&department_id=dept-ahmedabad-uuid&is_active=true'
    );
  });

  it('fetches a single camera by ID from /cameras/:id', async () => {
    const mockCamera = {
      id: 'cam-01',
      name: 'CAM-AHM-01',
      operational_status: 'ONLINE',
    };
    (apiClient.get as any).mockResolvedValueOnce(mockCamera);

    const result = await camerasApi.getCameraById('cam-01');
    expect(apiClient.get).toHaveBeenCalledWith('/cameras/cam-01');
    expect(result).toEqual(mockCamera);
  });

  it('fetches equipment operational telemetry summary from /cameras/health/summary', async () => {
    const mockSummary: CameraHealthSummary = {
      total_cameras: 5,
      online: 4,
      degraded: 1,
      offline: 0,
      connecting: 0,
      error: 0,
      decommissioned: 0,
      note: 'Camera operational health derived from registered camera telemetry and heartbeats',
    };
    (apiClient.get as any).mockResolvedValueOnce(mockSummary);

    const result = await camerasApi.getCameraHealthSummary();
    expect(apiClient.get).toHaveBeenCalledWith('/cameras/health/summary');
    expect(result.online).toBe(4);
    expect(result.degraded).toBe(1);
  });

  it('queries nearby cameras via PostGIS geodesic distance endpoint', async () => {
    (apiClient.get as any).mockResolvedValueOnce([]);

    await camerasApi.getNearbyCameras(23.0338, 72.5073, 5000, 10);
    expect(apiClient.get).toHaveBeenCalledWith(
      '/cameras/nearby?lat=23.0338&long=72.5073&radius_meters=5000&limit=10'
    );
  });

  it('propagates API failures as rejections without fabricating fallback data', async () => {
    (apiClient.get as any).mockRejectedValueOnce(new Error('Network error: Gateway timeout'));

    await expect(camerasApi.getCameras()).rejects.toThrow('Network error: Gateway timeout');
  });
});
