// ==============================================================================
// Frontend Production Endpoints & URL Resolution Unit Tests
// Gujarat Police Innovation Challenge 2026
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getApiBaseUrl } from '@/lib/api/client';
import { resolveAlertWebSocketUrl } from '@/lib/websocket/alert-socket';

describe('Frontend Production Endpoint Resolution', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalWsUrl = process.env.NEXT_PUBLIC_WS_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_WS_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    process.env.NEXT_PUBLIC_WS_URL = originalWsUrl;
  });

  describe('getApiBaseUrl', () => {
    it('returns exact API URL when full /api/v1 path is provided', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://netravaha-backend.onrender.com/api/v1';
      expect(getApiBaseUrl()).toBe('https://netravaha-backend.onrender.com/api/v1');
    });

    it('automatically appends /api/v1 if root domain is provided', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://netravaha-backend.onrender.com';
      expect(getApiBaseUrl()).toBe('https://netravaha-backend.onrender.com/api/v1');
    });

    it('strips trailing slashes cleanly before ensuring /api/v1', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://netravaha-backend.onrender.com/api/v1/';
      expect(getApiBaseUrl()).toBe('https://netravaha-backend.onrender.com/api/v1');
    });

    it('falls back to local development URL when env var is absent in Node environment', () => {
      expect(getApiBaseUrl()).toBe('http://localhost:4000/api/v1');
    });

    it('falls back to production backend URL when running on Vercel without NEXT_PUBLIC_API_URL', () => {
      const originalWindow = global.window;
      // @ts-ignore
      global.window = {
        location: {
          hostname: 'gujcamera-bj85w3tfw-kalendrayadavs-projects.vercel.app',
          protocol: 'https:',
        },
      };

      try {
        expect(getApiBaseUrl()).toBe('https://netravaha-backend.onrender.com/api/v1');
      } finally {
        global.window = originalWindow;
      }
    });

    it('falls back to production backend URL when running on production HTTPS domain', () => {
      const originalWindow = global.window;
      // @ts-ignore
      global.window = {
        location: {
          hostname: 'netravaha.police.gov.in',
          protocol: 'https:',
        },
      };

      try {
        expect(getApiBaseUrl()).toBe('https://netravaha-backend.onrender.com/api/v1');
      } finally {
        global.window = originalWindow;
      }
    });
  });

  describe('resolveAlertWebSocketUrl', () => {
    it('honors explicitly defined NEXT_PUBLIC_WS_URL', () => {
      process.env.NEXT_PUBLIC_WS_URL = 'wss://custom-alerts.police.gov.in/ws/alerts';
      expect(resolveAlertWebSocketUrl()).toBe('wss://custom-alerts.police.gov.in/ws/alerts');
    });

    it('derives WSS URL from HTTPS NEXT_PUBLIC_API_URL when WS env var is absent', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://netravaha-backend.onrender.com/api/v1';
      expect(resolveAlertWebSocketUrl()).toBe('wss://netravaha-backend.onrender.com/ws/alerts');
    });

    it('derives WSS URL even if NEXT_PUBLIC_API_URL has trailing slash', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://netravaha-backend.onrender.com/api/v1/';
      expect(resolveAlertWebSocketUrl()).toBe('wss://netravaha-backend.onrender.com/ws/alerts');
    });

    it('derives WS URL from HTTP NEXT_PUBLIC_API_URL in local dev proxy mode', () => {
      process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:4000/api/v1';
      expect(resolveAlertWebSocketUrl()).toBe('ws://127.0.0.1:4000/ws/alerts');
    });

    it('falls back to local development WebSocket when no env vars are defined', () => {
      expect(resolveAlertWebSocketUrl()).toBe('ws://localhost:4000/ws/alerts');
    });
  });
});
