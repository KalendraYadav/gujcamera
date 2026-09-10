'use client';

// ==============================================================================
// Authentication Context & Session Lifecycle Provider
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 14 & Section 20)
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { PoliceUser, LoginResponse, RefreshResponse } from '@/types/auth';
import { ApiError } from '@/types/api';
import { apiClient } from '@/lib/api/client';
import { tokenStorage } from '@/lib/auth/session';

interface AuthContextType {
  user: PoliceUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<PoliceUser>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PoliceUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const clearError = useCallback(() => setError(null), []);

  // Restore authenticated session on initial app load
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        // Exchange refresh token for fresh in-memory access token
        const refreshData = await apiClient.post<RefreshResponse>(
          '/auth/refresh',
          { refreshToken },
          { requiresAuth: false },
        );

        if (!isMounted) return;
        tokenStorage.setTokens(refreshData.access_token, refreshData.refresh_token);

        // Fetch validated user profile
        const profileRes = await apiClient.get<{ user: PoliceUser }>('/auth/me');
        if (isMounted) {
          setUser(profileRes.user);
        }
      } catch (err) {
        tokenStorage.clearTokens();
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<PoliceUser> => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiClient.post<LoginResponse>(
        '/auth/login',
        { email, password },
        { requiresAuth: false },
      );

      tokenStorage.setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      setIsLoading(false);

      // Transition to intended route or Command Center
      router.push('/');
      return data.user;
    } catch (err: any) {
      setIsLoading(false);
      const errorMessage = err instanceof ApiError ? err.message : 'Authentication failed. Please check network connection.';
      setError(errorMessage);
      throw err;
    }
  };

  const logout = useCallback(() => {
    tokenStorage.clearTokens();
    setUser(null);
    setError(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
