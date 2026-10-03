import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FleetAdminPage from '@/app/admin/page';
import { camerasApi } from '@/lib/api/cameras';
import { extractCredentialsFromUrl, stripCredentialsFromUrl, sanitizeStreamUrl } from '@/lib/utils/url-sanitizer';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock Auth
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'u1111111-0000-0000-0000-000000000001',
      username: 'superadmin',
      role: 'SUPER_ADMIN',
      badge_number: 'GP-HQ-001',
      department_id: 'd1111111-0000-0000-0000-000000000001',
      department_name: 'Gujarat Police State Command HQ',
    },
    token: 'mock-jwt-token',
    refreshToken: 'mock-refresh-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
  }),
}));

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin',
}));

// Mock API
vi.mock('@/lib/api/cameras', () => ({
  camerasApi: {
    getConnectors: vi.fn().mockResolvedValue({
      connectors: [
        {
          id: 'c1111111-0000-0000-0000-000000000001',
          adapter_type: 'RTSP-Stream-Connector',
          config_ref: 'rtsp-default.json',
          created_at: '2026-03-01T00:00:00Z',
        },
      ],
      supported_protocols: ['RTSP', 'ONVIF'],
    }),
    getDepartments: vi.fn().mockResolvedValue([
      { id: 'd1111111-0000-0000-0000-000000000001', name: 'Ahmedabad City Police (HQ)' },
    ]),
    testConnection: vi.fn().mockResolvedValue({
      status: 'CONNECTED',
      protocol: 'RTSP',
      reachable: true,
      latencyMs: 18,
      streamMetadata: {
        codec: 'H264',
        resolution: '1920x1080',
        fps: 25,
        streamUri: 'rtsp://10.20.4.15:554/live',
      },
      testedAt: '2026-10-03T11:00:00Z',
    }),
    createCamera: vi.fn().mockResolvedValue({
      id: 'cam-999-new-uuid',
      name: 'CAM-AHM-07: SG Highway',
      department_id: 'd1111111-0000-0000-0000-000000000001',
      lat: 23.05128,
      long: 72.51842,
      protocol: 'RTSP',
      connector_type_id: 'c1111111-0000-0000-0000-000000000001',
      operational_status: 'ONLINE',
      is_active: true,
      credential_configured: true,
      created_at: '2026-10-03T11:00:00Z',
      updated_at: '2026-10-03T11:00:00Z',
    }),
    configureCredentials: vi.fn().mockResolvedValue({
      configured: true,
      cameraId: 'cam-999-new-uuid',
      credentialType: 'BASIC_AUTH',
    }),
    removeCredentials: vi.fn().mockResolvedValue({
      removed: true,
      cameraId: 'cam-999-new-uuid',
    }),
  },
}));

describe('URL Sanitizer Utilities', () => {
  it('extracts inline credentials and returns a clean URL', () => {
    const raw = 'rtsp://admin:SecretPass123@10.20.4.15:554/Streaming/Channels/102';
    const extracted = extractCredentialsFromUrl(raw);

    expect(extracted.hasCredentials).toBe(true);
    expect(extracted.username).toBe('admin');
    expect(extracted.password).toBe('SecretPass123');
    expect(extracted.cleanUrl).toBe('rtsp://10.20.4.15:554/Streaming/Channels/102');
  });

  it('handles clean URLs without credentials', () => {
    const clean = 'rtsp://10.20.4.15:554/Streaming/Channels/102';
    const extracted = extractCredentialsFromUrl(clean);

    expect(extracted.hasCredentials).toBe(false);
    expect(extracted.cleanUrl).toBe(clean);
  });

  it('masks credentials for safe logging or error reporting', () => {
    const raw = 'rtsp://admin:SecretPass123@10.20.4.15:554/live';
    expect(sanitizeStreamUrl(raw)).toBe('rtsp://***:***@10.20.4.15:554/live');
  });
});

describe('Frontend Password Zero-Retention Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts inline credentials on Test Connection and immediately clears password field', async () => {
    render(<FleetAdminPage />);

    await waitFor(() => {
      expect(screen.getByText(/Equipment & Department Identity/i)).toBeInTheDocument();
    });

    const streamUrlInput = screen.getByPlaceholderText(/rtsp:\/\/localhost:8554/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i) as HTMLInputElement;

    // Admin enters URL with inline credentials
    fireEvent.change(streamUrlInput, {
      target: { value: 'rtsp://police_operator:SecretPass999@10.20.4.15:554/live' },
    });
    fireEvent.change(passwordInput, {
      target: { value: 'SecretPass999' },
    });

    const testBtn = screen.getByRole('button', { name: /Test Connection \(RTSP\)/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      // Endpoint field must be sanitized immediately
      expect((streamUrlInput as HTMLInputElement).value).toBe('rtsp://10.20.4.15:554/live');
      // Password field must be immediately cleared from state
      expect(passwordInput.value).toBe('');
    });

    // testConnection called with clean endpoint
    expect(camerasApi.testConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        url_or_handle: 'rtsp://10.20.4.15:554/live',
        password: 'SecretPass999',
      }),
    );
  });

  it('submits clean endpoint and explicit credentials, then clears password and shows Credentials configured ✓', async () => {
    render(<FleetAdminPage />);

    await waitFor(() => {
      expect(screen.getByText(/Equipment & Department Identity/i)).toBeInTheDocument();
    });

    const streamUrlInput = screen.getByPlaceholderText(/rtsp:\/\/localhost:8554/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i) as HTMLInputElement;

    fireEvent.change(streamUrlInput, {
      target: { value: 'rtsp://10.20.4.15:554/live/ch1' },
    });
    fireEvent.change(passwordInput, {
      target: { value: 'CctvSecret2026' },
    });

    const submitBtn = screen.getByRole('button', { name: /Register Camera in Fleet/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(camerasApi.createCamera).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: expect.objectContaining({
            url_or_handle: 'rtsp://10.20.4.15:554/live/ch1',
          }),
          credentials: {
            username: 'admin',
            password: 'CctvSecret2026',
          },
        }),
      );
      // Password must be cleared immediately upon saving
      expect(passwordInput.value).toBe('');
      // Status badge must be visible
      expect(screen.getByText(/Credentials configured ✓/i)).toBeInTheDocument();
    });
  });
});
