// ==============================================================================
// Token Storage & In-Memory Session Security
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 20: Security Threat Model)
// Strategy: In-memory access token (15m) + SessionStorage refresh token (isolated)
// ==============================================================================

const REFRESH_TOKEN_KEY = 'gujcamera_rt';

// In-memory reference for the short-lived access token.
// Never persisted to LocalStorage or accessible to other tabs/windows.
let inMemoryAccessToken: string | null = null;

export const tokenStorage = {
  getAccessToken(): string | null {
    return inMemoryAccessToken;
  },

  setAccessToken(token: string | null): void {
    inMemoryAccessToken = token;
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setRefreshToken(token: string | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (token) {
        window.sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
      } else {
        window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    } catch (e) {
      console.error('Failed to store refresh token in sessionStorage', e);
    }
  },

  setTokens(accessToken: string, refreshToken?: string): void {
    this.setAccessToken(accessToken);
    if (refreshToken) {
      this.setRefreshToken(refreshToken);
    }
  },

  clearTokens(): void {
    this.setAccessToken(null);
    this.setRefreshToken(null);
  },

  hasRefreshToken(): boolean {
    return !!this.getRefreshToken();
  },
};
