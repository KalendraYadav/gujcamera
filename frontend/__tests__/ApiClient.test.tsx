import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { tokenStorage } from '@/lib/auth/session';
import { ApiError } from '@/types/api';

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenStorage.clearTokens();
  });

  it('attaches X-Request-Id header to requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'UP' }),
    });
    global.fetch = mockFetch;

    await apiClient.get('/health', { requiresAuth: false });

    expect(mockFetch).toHaveBeenCalled();
    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get('X-Request-Id')).toBeTruthy();
  });

  it('attaches Authorization header when in-memory access token is set', async () => {
    tokenStorage.setAccessToken('valid-jwt-token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: '1' } }),
    });
    global.fetch = mockFetch;

    await apiClient.get('/auth/me');

    expect(mockFetch).toHaveBeenCalled();
    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer valid-jwt-token');
  });

  it('correctly maps standardized error envelope into ApiError', async () => {
    const errorEnvelope = {
      error_code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
      request_id: 'err-req-123',
      timestamp: '2026-09-10T12:00:00.000Z',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => errorEnvelope,
    });
    global.fetch = mockFetch;

    try {
      await apiClient.post('/auth/login', { email: 'wrong@police.gov', password: 'wrong' }, { requiresAuth: false });
      expect.fail('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errorCode).toBe('INVALID_CREDENTIALS');
      expect(err.statusCode).toBe(401);
      expect(err.requestId).toBe('err-req-123');
      expect(err.message).toBe('Invalid email or password');
    }
  });

  it('maps network failures to NETWORK_ERROR ApiError', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    global.fetch = mockFetch;

    try {
      await apiClient.get('/cameras', { requiresAuth: false });
      expect.fail('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.errorCode).toBe('NETWORK_ERROR');
      expect(err.statusCode).toBe(0);
    }
  });
});
