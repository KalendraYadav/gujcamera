import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommandCenterPage from '@/app/page';
import { PoliceRole } from '@/types/auth';

let mockUserRole: PoliceRole = 'OPERATOR';

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: `${mockUserRole.toLowerCase()}@gujcamera.local`,
      role: mockUserRole,
      department_name: 'Gujarat State Police HQ',
    },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

describe('Command Center RBAC UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'OPERATOR';
  });

  it('renders operational mode and tactical navigation for OPERATOR', () => {
    mockUserRole = 'OPERATOR';
    render(<CommandCenterPage />);

    expect(screen.getByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('Tactical Operations Navigation')).toBeInTheDocument();
    expect(screen.getByText('Live Video Monitoring')).toBeInTheDocument();
    expect(screen.getByText('GIS Camera Command Map')).toBeInTheDocument();
    expect(screen.getByText('CCTV Camera Registry')).toBeInTheDocument();
    expect(screen.getByText('Real-Time Alert Feed')).toBeInTheDocument();

    // OPERATOR must NOT see Vehicle Investigation or System Audit Trail
    expect(screen.queryByText('Vehicle Investigation')).not.toBeInTheDocument();
    expect(screen.queryByText('System Audit Trail')).not.toBeInTheDocument();
  });

  it('renders Read-Only Oversight context and authorized modules for SYSTEM_AUDITOR', () => {
    mockUserRole = 'SYSTEM_AUDITOR';
    render(<CommandCenterPage />);

    // Oversight banner indicators
    expect(screen.getAllByText('Read-Only Oversight').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('Independent Statutory Compliance & Security Review — Read-Only Access')
    ).toBeInTheDocument();
    expect(screen.getByText('Authorized Oversight Modules')).toBeInTheDocument();

    // Auditor must see Audit Trail, GIS Map, Camera Registry
    expect(screen.getByText('System Audit Trail')).toBeInTheDocument();
    expect(screen.getByText('GIS Camera Command Map')).toBeInTheDocument();
    expect(screen.getByText('CCTV Camera Registry')).toBeInTheDocument();

    // Auditor must NOT see operational/tactical mutation cards
    expect(screen.queryByText('Live Video Monitoring')).not.toBeInTheDocument();
    expect(screen.queryByText('Vehicle Investigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Real-Time Alert Feed')).not.toBeInTheDocument();
  });

  it('renders both tactical and audit modules for SUPER_ADMIN', () => {
    mockUserRole = 'SUPER_ADMIN';
    render(<CommandCenterPage />);

    expect(screen.getByText('Operational')).toBeInTheDocument();
    expect(screen.getByText('Tactical Operations Navigation')).toBeInTheDocument();

    // Super Admin has access to all cards
    expect(screen.getByText('System Audit Trail')).toBeInTheDocument();
    expect(screen.getByText('Live Video Monitoring')).toBeInTheDocument();
    expect(screen.getByText('GIS Camera Command Map')).toBeInTheDocument();
    expect(screen.getByText('CCTV Camera Registry')).toBeInTheDocument();
    expect(screen.getByText('Vehicle Investigation')).toBeInTheDocument();
    expect(screen.getByText('Real-Time Alert Feed')).toBeInTheDocument();
  });
});
