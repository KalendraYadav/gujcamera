import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '@/lib/auth/context';
import { tokenStorage } from '@/lib/auth/session';
import { apiClient } from '@/lib/api/client';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
}));

function ConsumerComponent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  if (isLoading) return <div data-testid="status">Loading...</div>;
  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'AUTHENTICATED' : 'ANONYMOUS'}</div>
      <div data-testid="user-email">{user?.email || 'NONE'}</div>
      <button onClick={logout} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenStorage.clearTokens();
  });

  it('initializes as anonymous when no refresh token exists in sessionStorage', async () => {
    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('ANONYMOUS');
      expect(screen.getByTestId('user-email')).toHaveTextContent('NONE');
    });
  });

  it('restores authenticated session when valid refresh token is found', async () => {
    tokenStorage.setRefreshToken('valid-refresh-token');

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      token_type: 'Bearer',
      expires_in: 900,
    });

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      user: {
        id: 'officer-99',
        email: 'investigator.demo@gujcamera.local',
        role: 'INVESTIGATOR',
        department_id: 'dept-ahmedabad',
      },
    });

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('AUTHENTICATED');
      expect(screen.getByTestId('user-email')).toHaveTextContent('investigator.demo@gujcamera.local');
    });

    expect(tokenStorage.getAccessToken()).toBe('new-access-token');
  });

  it('clears session and redirects to /login on logout', async () => {
    tokenStorage.setTokens('some-access-token', 'some-refresh-token');

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toBeInTheDocument();
    });

    const logoutBtn = screen.getByTestId('logout-btn');
    act(() => {
      logoutBtn.click();
    });

    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
