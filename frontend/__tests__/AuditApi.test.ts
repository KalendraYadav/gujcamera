import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditApi } from '@/lib/api/audit';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('auditApi.getAuditLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strips non-whitelisted parameters like sort_order and status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 15, total_pages: 0 },
    });

    await auditApi.getAuditLogs({
      sort_order: 'desc' as any,
      status: 'SUCCESS' as any,
      page: 1,
      limit: 15,
    });

    expect(apiClient.get).toHaveBeenCalledWith('/audit?page=1&limit=15');
    const calledUrl = vi.mocked(apiClient.get).mock.calls[0][0];
    expect(calledUrl).not.toContain('sort_order');
    expect(calledUrl).not.toContain('status');
  });

  it('translates legacy frontend query keys to canonical backend keys', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 15, total_pages: 0 },
    });

    await auditApi.getAuditLogs({
      resource_type: 'CAMERA_REGISTRY',
      user_id: 'usr-123',
      from_date: '2026-09-01T00:00:00.000Z',
      to_date: '2026-09-11T23:59:59.000Z',
      action: 'CAMERA_UPDATE',
      page: 2,
      limit: 25,
    });

    const calledUrl = vi.mocked(apiClient.get).mock.calls[0][0];
    expect(calledUrl).toContain('resource=CAMERA_REGISTRY');
    expect(calledUrl).toContain('actor_id=usr-123');
    expect(calledUrl).toContain('start_date=2026-09-01T00%3A00%3A00.000Z');
    expect(calledUrl).toContain('end_date=2026-09-11T23%3A59%3A59.000Z');
    expect(calledUrl).toContain('action=CAMERA_UPDATE');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=25');
  });

  it('normalizes backend audit response into frontend shape', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        {
          id: 'log-uuid-1',
          actor_id: 'usr-adm-1',
          actor_email: 'admin.demo@gujcamera.local',
          actor_role: 'SUPER_ADMIN',
          actor_department: 'Gujarat State Police HQ',
          action: 'CAMERA_REGISTER',
          resource: 'CAMERA_REGISTRY',
          before: null,
          after: { id: 'cam-1', name: 'Traffic Junction 1' },
          correlation_id: 'corr-uuid-1',
          ts: '2026-09-11T10:00:00.000Z',
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 15,
        total_pages: 1,
      },
    });

    const res = await auditApi.getAuditLogs();

    expect(res.data).toHaveLength(1);
    const item = res.data[0];
    expect(item.id).toBe('log-uuid-1');
    expect(item.action).toBe('CAMERA_REGISTER');
    expect(item.resource_type).toBe('CAMERA_REGISTRY');
    expect(item.timestamp).toBe('2026-09-11T10:00:00.000Z');
    expect(item.status).toBe('SUCCESS');
    expect(item.user?.name).toBe('admin.demo@gujcamera.local');
    expect(item.user?.role).toBe('SUPER_ADMIN');
    expect(item.details).toEqual({
      before: null,
      after: { id: 'cam-1', name: 'Traffic Junction 1' },
    });
    expect(res.meta.total).toBe(1);
    expect(res.pagination?.total_pages).toBe(1);
  });
});
