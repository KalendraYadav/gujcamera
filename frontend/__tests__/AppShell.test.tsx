import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { NavigationProvider } from '@/lib/navigation/context';
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
    localStorage.clear();
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

  it('renders Read-Only Oversight badge in header for SYSTEM_AUDITOR', () => {
    mockAuthState.user = {
      id: 'usr-auditor-1',
      email: 'auditor.demo@gujcamera.local',
      role: 'SYSTEM_AUDITOR',
      department_id: 'dept-hq',
      department_name: 'Gujarat State Police HQ',
    };

    render(
      <AppShell>
        <div>Auditor Review Content</div>
      </AppShell>,
    );

    expect(screen.getByText('Read-Only Oversight')).toBeInTheDocument();
  });

  it('does not render Read-Only Oversight badge for operational roles like OPERATOR', () => {
    render(
      <AppShell>
        <div>Operator Content</div>
      </AppShell>,
    );

    expect(screen.queryByText('Read-Only Oversight')).not.toBeInTheDocument();
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

  it('renders collapsed navigation rail by default and expands main content width', () => {
    render(
      <NavigationProvider>
        <AppShell>
          <div>Operational Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    const sidebar = screen.getByTestId('netrava-sidebar');
    expect(sidebar).toHaveClass('collapsed');

    const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute('aria-label', 'Expand navigation');

    // Main layout container receives sidebar-collapsed class for maximal horizontal space
    const mainContainer = document.querySelector('.netrava-main-layout');
    expect(mainContainer).toHaveClass('sidebar-collapsed');
  });

  it('smoothly toggles between collapsed rail and expanded drawer upon clicking toggle control', () => {
    render(
      <NavigationProvider>
        <AppShell>
          <div>Operational Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    const sidebar = screen.getByTestId('netrava-sidebar');
    const mainContainer = document.querySelector('.netrava-main-layout');
    const toggleBtn = screen.getByTestId('sidebar-toggle-btn');

    // Initial state: Collapsed
    expect(sidebar).toHaveClass('collapsed');
    expect(mainContainer).toHaveClass('sidebar-collapsed');

    // Click toggle button to EXPAND
    act(() => {
      fireEvent.click(toggleBtn);
    });

    expect(sidebar).not.toHaveClass('collapsed');
    expect(mainContainer).not.toHaveClass('sidebar-collapsed');

    // Toggle button in expanded state has aria-label to collapse
    const collapseBtn = screen.getByTestId('sidebar-toggle-btn');
    expect(collapseBtn).toHaveAttribute('aria-label', 'Collapse navigation');

    // Click toggle button again to COLLAPSE
    act(() => {
      fireEvent.click(collapseBtn);
    });

    expect(sidebar).toHaveClass('collapsed');
    expect(mainContainer).toHaveClass('sidebar-collapsed');
  });

  it('persists navigation collapse preference to localStorage', () => {
    render(
      <NavigationProvider>
        <AppShell>
          <div>Operational Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
    act(() => {
      fireEvent.click(toggleBtn); // Expand
    });

    expect(localStorage.getItem('netravaha_sidebar_collapsed')).toBe('false');

    const collapseBtn = screen.getByTestId('sidebar-toggle-btn');
    act(() => {
      fireEvent.click(collapseBtn); // Collapse
    });

    expect(localStorage.getItem('netravaha_sidebar_collapsed')).toBe('true');
  });

  it('preserves strict RBAC authorization in both collapsed and expanded states', () => {
    // Current role: OPERATOR (mockAuthState default)
    const { unmount } = render(
      <NavigationProvider>
        <AppShell>
          <div>Operator Workspace</div>
        </AppShell>
      </NavigationProvider>,
    );

    // Operator can see authorized operational items
    expect(screen.getByTestId('nav-item-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-live')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-map')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-cameras')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-watchlist')).toBeInTheDocument();

    // Operator CANNOT access Vehicle Tracking or Administration routes
    expect(screen.queryByTestId('nav-item-vehicles')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-item-audit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-item-admin')).not.toBeInTheDocument();

    unmount();

    // Change role to SUPER_ADMIN
    mockAuthState.user = {
      id: 'admin-1',
      email: 'admin.super@gujcamera.local',
      role: 'SUPER_ADMIN',
      department_id: 'dept-hq',
      department_name: 'State Command HQ',
    };

    render(
      <NavigationProvider>
        <AppShell>
          <div>Admin Workspace</div>
        </AppShell>
      </NavigationProvider>,
    );

    // Super Admin sees vehicles and admin items
    expect(screen.getByTestId('nav-item-vehicles')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-audit')).toBeInTheDocument();
    expect(screen.getByTestId('nav-item-admin')).toBeInTheDocument();
  });

  it('maintains active route indicator on current operational page', () => {
    render(
      <NavigationProvider>
        <AppShell>
          <div>Command Center Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    // With pathname '/', the dashboard nav link is marked active
    const dashboardLink = screen.getByTestId('nav-item-dashboard');
    expect(dashboardLink).toHaveClass('active');
    expect(dashboardLink).toHaveAttribute('aria-current', 'page');
  });

  it('renders user identity panel with avatar, organization, and handles sign out in both collapsed and expanded states', async () => {
    render(
      <NavigationProvider>
        <AppShell>
          <div>Main Dashboard Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    // Verify User Identity in DOM
    expect(screen.getByText('operator.demo@gujcamera.local')).toBeInTheDocument();
    expect(screen.getByText('OPERATOR')).toBeInTheDocument();
    expect(screen.getByTitle('Officer Session Active')).toBeInTheDocument();

    // Verify Organization Group
    expect(screen.getByText('ORGANIZATION')).toBeInTheDocument();
    expect(screen.getByText('Ahmedabad City Police Commissionerate')).toBeInTheDocument();

    // Verify Sign Out Button works in Collapsed Rail
    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    expect(signOutBtn).toBeInTheDocument();
    act(() => {
      signOutBtn.click();
    });
    expect(mockAuthState.logout).toHaveBeenCalledTimes(1);

    // Expand sidebar drawer
    const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
    act(() => {
      fireEvent.click(toggleBtn);
    });

    // In expanded drawer, verify sign out is also present and clickable
    const expandedSignOutBtn = screen.getByRole('button', { name: /sign out/i });
    expect(expandedSignOutBtn).toBeInTheDocument();
    act(() => {
      expandedSignOutBtn.click();
    });
    expect(mockAuthState.logout).toHaveBeenCalledTimes(2);
  });

  it('verifies collapsed rail has ONLY ONE toggle button and no duplicate clickable crest', () => {
    render(
      <NavigationProvider>
        <AppShell>
          <div>Main Dashboard Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    const sidebar = screen.getByTestId('netrava-sidebar');
    expect(sidebar).toHaveClass('collapsed');

    // Exactly one toggle button in sidebar header
    const toggleButtons = screen.getAllByTestId('sidebar-toggle-btn');
    expect(toggleButtons).toHaveLength(1);
    expect(toggleButtons[0]).toHaveAttribute('aria-label', 'Expand navigation');

    // Ensure no duplicate crest expansion button
    expect(screen.queryByLabelText('Expand navigation drawer')).not.toBeInTheDocument();
  });

  it('manages profile detail panel interaction states: open from rail avatar, open from compact row, auto-close on outside click and ESC', () => {
    render(
      <NavigationProvider>
        <AppShell>
          <div data-testid="outside-operational-area">Main Dashboard Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    const profilePanel = screen.getByTestId('profile-detail-panel');
    expect(profilePanel).not.toHaveClass('open');

    // STATE H: In collapsed rail, click avatar to open profile detail panel
    const railAvatarBtn = screen.getByTestId('sidebar-rail-profile-btn');
    expect(railAvatarBtn).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      fireEvent.click(railAvatarBtn);
    });

    expect(profilePanel).toHaveClass('open');
    expect(railAvatarBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Operator Demo')).toBeInTheDocument();
    expect(screen.getByText('Control Room Operator')).toBeInTheDocument();
    expect(screen.getByText('State Control Room, Gandhinagar')).toBeInTheDocument();
    expect(screen.getByText('Account Settings')).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();

    // STATE D: Clicking inside profile panel keeps it open
    act(() => {
      fireEvent.mouseDown(profilePanel);
    });
    expect(profilePanel).toHaveClass('open');

    // STATE E: Clicking outside closes it immediately
    const outsideArea = screen.getByTestId('outside-operational-area');
    act(() => {
      fireEvent.mouseDown(outsideArea);
    });
    expect(profilePanel).not.toHaveClass('open');

    // Expand sidebar drawer
    const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
    act(() => {
      fireEvent.click(toggleBtn);
    });

    // STATE C: In expanded sidebar, click compact profile row to open profile panel
    const compactProfileBtn = screen.getByTestId('sidebar-compact-profile-btn');
    expect(compactProfileBtn).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      fireEvent.click(compactProfileBtn);
    });

    expect(profilePanel).toHaveClass('open');
    expect(compactProfileBtn).toHaveAttribute('aria-expanded', 'true');

    // STATE F: Press ESC to close profile panel
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(profilePanel).not.toHaveClass('open');

    // Reopen and test STATE G: Click navigation link closes profile panel
    act(() => {
      fireEvent.click(compactProfileBtn);
    });
    expect(profilePanel).toHaveClass('open');

    const liveNavLink = screen.getByTestId('nav-item-live');
    act(() => {
      fireEvent.click(liveNavLink);
    });
    expect(profilePanel).not.toHaveClass('open');
  });

  it('renders clean page title in global header without redundant NETRAVA / prefix', () => {
    render(
      <NavigationProvider>
        <AppShell>
          <div>Main Dashboard Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    // Global header renders the page title directly
    const headerTitle = screen.getByRole('heading', { level: 2 });
    expect(headerTitle).toHaveTextContent('Command Center');

    // Redundant "NETRAVA /" prefix is NOT present in the header
    expect(screen.queryByText(/NETRAVA \//i)).not.toBeInTheDocument();
  });

  it('renders clean top-right global header with tactical clock and without dev/telemetry badges', () => {
    const { container } = render(
      <NavigationProvider>
        <AppShell>
          <div>Main Dashboard Content</div>
        </AppShell>
      </NavigationProvider>,
    );

    // Tactical clock is rendered in global header
    expect(container.querySelector('.tactical-clock-indicator')).toBeInTheDocument();

    // Dev/telemetry badges are NOT rendered in the global header
    expect(screen.queryByText('API 200 OK')).not.toBeInTheDocument();
    expect(screen.queryByText('SIMULATED LIVE CCTV')).not.toBeInTheDocument();
  });
});




