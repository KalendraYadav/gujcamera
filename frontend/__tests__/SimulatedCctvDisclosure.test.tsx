import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Header } from '@/components/layout/Header';
import { LivePlayer } from '@/components/live/LivePlayer';
import { Camera } from '@/types/camera';

// Mock auth context
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: { email: 'operator.demo@gujcamera.local', role: 'OPERATOR' },
    isAuthenticated: true,
  }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/live',
  useRouter: () => ({ push: vi.fn() }),
}));

describe('Simulated CCTV Disclosure & Truthfulness (Phase 13)', () => {
  describe('Global Header Presentation & Cleaned State', () => {
    it('does not display development telemetry badges (SIMULATED LIVE CCTV or API 200 OK) in the global header', () => {
      render(<Header />);
      expect(screen.queryByTestId('environment-simulated-indicator')).toBeNull();
      expect(screen.queryByText(/SIMULATED LIVE CCTV/i)).toBeNull();
      expect(screen.queryByText(/API 200 OK/i)).toBeNull();
    });

    it('keeps the operational tactical clock in the global header', () => {
      const { container } = render(<Header />);
      expect(container.querySelector('.tactical-clock-indicator')).toBeInTheDocument();
    });

    it('does not claim unauthorized live government CCTV connection', () => {
      render(<Header />);
      expect(screen.queryByText(/Gujarat Police Live Network Connected/i)).toBeNull();
      expect(screen.queryByText(/Government CCTV Live Feeds/i)).toBeNull();
    });
  });

  describe('LivePlayer Source & Simulated Live Badges', () => {
    const mockCamera: Camera = {
      id: 'CAM-AHM-01',
      name: 'CAM-AHM-01: SG Highway - Pakwan Crossroad',
      department_id: 'dept-ahm',
      lat: 23.0338,
      long: 72.5073,
      protocol: 'RTSP',
      operational_status: 'ONLINE',
      is_active: true,
      source_type: 'SYNTHETIC_STREAM',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      connector_type_id: 'conn-1',
      location: {
        address: 'Pakwan Crossroad, Bodakdev',
        zone: 'West Zone',
        district: 'Ahmedabad',
      },
      health: {
        status: 'ONLINE',
        fps_actual: 25,
        packet_loss: 0,
        last_heartbeat: new Date().toISOString(),
      },
      streams: [
        {
          id: 'stream-1',
          codec: 'h264',
          resolution: '1280x720',
          fps: 25,
          url_or_handle: 'rtsp://video-gateway:8554/cam-ahm-01',
        },
      ],
    };

    it('renders the SIMULATED LIVE badge on the video player overlay', () => {
      render(
        <LivePlayer
          streamUrl="http://localhost:8888/cam-ahm-01/index.m3u8"
          camera={mockCamera}
          autoPlay={false}
        />,
      );

      const simBadge = screen.getByTestId('simulated-live-badge');
      expect(simBadge).toBeInTheDocument();
      expect(simBadge).toHaveTextContent('SIMULATED LIVE');

      const sourceBadge = screen.getByTestId('source-provenance-badge');
      expect(sourceBadge).toBeInTheDocument();
      expect(sourceBadge).toHaveTextContent(/SYNTHETIC_STREAM/i);
    });
  });
});
