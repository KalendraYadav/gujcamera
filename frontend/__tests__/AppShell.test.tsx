import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { PoliceUser } from '@/types/auth';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
}));

let mockAuthState: {
  user: PoliceUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
} = {
  user: {
    id: 'user-1',
    email: 'operator.demo@gujcamera.local',
    role: 'OPERATOR' as const,
    department_id: 'dept-1',
    department_name: 'Ahmedabad City Police Commissionerate',
  },
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn(),
};

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => mockAuthState,
}));

describe('AppShell Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      user: {
        id: 'user-1',
        email: 'operator.demo@gujcamera.local',
        role: 'OPERATOR' as const,
        department_id: 'dept-1',
        department_name: 'Ahmedabad City Police Commissionerate',
      },
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    };
  });

  it('renders persistent navigation rail, header, and main children when authenticated', () => {
    render(
      <AppShell>
        <div data-testid="test-child">Command Center Content</div>
      </AppShell>,
    );

    expect(screen.getByText('NETRAVA')).toBeInTheDocument();
    expect(screen.getByText('Command Center Content')).toBeInTheDocument();
    expect(screen.getByText('operator.demo@gujcamera.local')).toBeInTheDocument();
    expect(screen.getByText('OPERATOR')).toBeInTheDocument();
    expect(screen.getByText('Ahmedabad City Police Commissionerate')).toBeInTheDocument();
    expect(screen.getAllByText('SIMULATED DATA').length).toBeGreaterThan(0);
  });

  it('renders loading state when authentication is initializing', () => {
    mockAuthState.isLoading = true;

    render(
      <AppShell>
        <div>Content</div>
      </AppShell>,
    );

    expect(screen.getByText('Authenticating Police Identity...')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.user = null;

    render(
      <AppShell>
        <div>Protected Content</div>
      </AppShell>,
    );

    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
