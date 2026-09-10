// ==============================================================================
// Centralized REST API Client
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8: API Contract Conventions)
// ==============================================================================

import { ApiError, ApiErrorPayload, RequestOptions } from '@/types/api';
import { tokenStorage } from '@/lib/auth/session';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Generate lightweight client-side correlation UUID if none provided
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'req-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

async function request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const requiresAuth = options.requiresAuth !== false;
  const requestId = options.requestId || generateRequestId();

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  headers.set('X-Request-Id', requestId);

  if (requiresAuth) {
    const accessToken = tokenStorage.getAccessToken();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.ok) {
      if (response.status === 204) {
        return {} as T;
      }
      return (await response.json()) as T;
    }

    // Handle 401 Unauthorized for authenticated requests
    if (response.status === 401 && requiresAuth) {
      const refreshToken = tokenStorage.getRefreshToken();
      if (refreshToken && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
        if (!isRefreshing) {
          isRefreshing = true;

          try {
            const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Request-Id': generateRequestId(),
              },
              body: JSON.stringify({ refreshToken }),
            });

            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              tokenStorage.setTokens(refreshData.access_token, refreshData.refresh_token);
              isRefreshing = false;
              onTokenRefreshed(refreshData.access_token);

              // Retry original request with new access token
              headers.set('Authorization', `Bearer ${refreshData.access_token}`);
              const retryResponse = await fetch(url, { ...options, headers });
              if (retryResponse.ok) {
                return (await retryResponse.json()) as T;
              }
            } else {
              // Refresh failed, session is dead
              isRefreshing = false;
              tokenStorage.clearTokens();
            }
          } catch {
            isRefreshing = false;
            tokenStorage.clearTokens();
          }
        } else {
          // Wait for the active refresh to finish then retry
          return new Promise<T>((resolve, reject) => {
            addRefreshSubscriber(async (newToken) => {
              headers.set('Authorization', `Bearer ${newToken}`);
              try {
                const retryResponse = await fetch(url, { ...options, headers });
                if (retryResponse.ok) {
                  resolve((await retryResponse.json()) as T);
                } else {
                  const errorBody = await retryResponse.json().catch(() => ({}));
                  reject(new ApiError(errorBody, retryResponse.status));
                }
              } catch (err) {
                reject(err);
              }
            });
          });
        }
      }
    }

    // Extract standardized error envelope
    let errorPayload: ApiErrorPayload;
    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = {
        error_code: `HTTP_${response.status}`,
        message: response.statusText || 'Request failed',
        request_id: response.headers.get('x-request-id') || requestId,
      };
    }

    throw new ApiError(errorPayload, response.status);
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network failure (server down, DNS failure, CORS block)
    throw new ApiError(
      {
        error_code: 'NETWORK_ERROR',
        message: error.message || 'Unable to connect to police intelligence backend. Please verify network or server status.',
        request_id: requestId,
      },
      0,
    );
  }
}

export const apiClient = {
  get: <T = any>(endpoint: string, options?: RequestOptions) => request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(endpoint: string, body?: any, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(endpoint: string, options?: RequestOptions) => request<T>(endpoint, { ...options, method: 'DELETE' }),
};
