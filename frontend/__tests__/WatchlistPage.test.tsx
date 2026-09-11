import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WatchlistPage from '@/app/watchlist/page';
import { watchlistsApi } from '@/lib/api/watchlists';
import { Watchlist, WatchlistEntry } from '@/types/watchlist';

// Mock watchlists API
vi.mock('@/lib/api/watchlists', () => ({
  watchlistsApi: {
    listWatchlists: vi.fn(),
    getWatchlist: vi.fn(),
    listEntries: vi.fn(),
    createWatchlist: vi.fn(),
    addEntry: vi.fn(),
    deactivateEntry: vi.fn(),
    activateWatchlist: vi.fn(),
    deactivateWatchlist: vi.fn(),
  },
}));

let mockUserRole = 'SUPER_ADMIN';

// Mock AuthContext
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-demo-1',
      email: 'demo@gujcamera.local',
      role: mockUserRole,
      department_name: 'Ahmedabad City Police',
    },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

// Mock Next Navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/watchlist',
  useRouter: () => ({ push: vi.fn() }),
}));

const MOCK_WATCHLISTS: Watchlist[] = [
  {
    id: 'wl-1',
    name: 'Ahmedabad Stolen Vehicles Watchlist (DEMO)',
    owner: 'Crime Branch',
    department_id: 'dept-ahm',
    created_at: '2026-09-08T00:00:00.000Z',
    entries_count: 2,
  },
  {
    id: 'wl-2',
    name: 'High-Priority Inter-District Suspects (DEMO)',
    owner: 'State Intelligence Bureau',
    department_id: 'dept-sib',
    created_at: '2026-09-08T00:00:00.000Z',
    entries_count: 1,
  },
];

const MOCK_ENTRIES: WatchlistEntry[] = [
  {
    id: 'ent-1',
    watchlist_id: 'wl-1',
    plate_normalized: 'GJ01AB1234',
    priority: 'CRITICAL',
    category: 'STOLEN',
    reason: 'FIR 104/2026 Vastrapur PS',
    added_by: 'usr-admin-1',
    expires_at: null,
    active: true,
    sightings_count: 2,
    created_at: '2026-09-08T00:00:00.000Z',
  },
  {
    id: 'ent-2',
    watchlist_id: 'wl-1',
    plate_normalized: 'GJ05CD5678',
    priority: 'HIGH',
    category: 'SUSPECT',
    reason: 'Vehicle used in armed robbery',
    added_by: 'usr-admin-1',
    expires_at: null,
    active: false,
    sightings_count: 0,
    created_at: '2026-09-08T00:00:00.000Z',
  },
];

const MOCK_ENTRIES_WL2: WatchlistEntry[] = [
  {
    id: 'ent-3',
    watchlist_id: 'wl-2',
    plate_normalized: 'GJ27EF9012',
    priority: 'CRITICAL',
    category: 'SUSPECT',
    reason: 'Inter-district armed robbery suspect',
    added_by: 'usr-admin-1',
    expires_at: null,
    active: true,
    sightings_count: 0,
    created_at: '2026-09-08T00:00:00.000Z',
  },
];

describe('Watchlist Management Page (Phase 4E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'SUPER_ADMIN';
    vi.mocked(watchlistsApi.listWatchlists).mockResolvedValue(MOCK_WATCHLISTS);
    vi.mocked(watchlistsApi.listEntries).mockImplementation(async (watchlistId) => {
      if (watchlistId === 'wl-2') return MOCK_ENTRIES_WL2;
      return MOCK_ENTRIES;
    });
  });

  it('renders watchlist catalog and handles selection of a watchlist', async () => {
    render(<WatchlistPage />);

    // Verify header and simulated data badge
    expect(screen.getByText('Watchlist Registry')).toBeInTheDocument();
    expect(screen.getAllByText('SIMULATED DATA').length).toBeGreaterThanOrEqual(1);

    expect(watchlistsApi.listWatchlists).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByText('Loading watchlists...')).not.toBeInTheDocument();
    });

    // Check what is rendered now
    expect(screen.getAllByText('Ahmedabad Stolen Vehicles Watchlist (DEMO)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2 plates')).toBeInTheDocument();

    // Verify entries rendered in details panel
    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
      expect(screen.getByText('FIR 104/2026 Vastrapur PS')).toBeInTheDocument();
      expect(screen.getByText('GJ05CD5678')).toBeInTheDocument();
    });
  });

  it('derives accurate plate counts with singular and plural formatting from authoritative data', async () => {
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading watchlists...')).not.toBeInTheDocument();
    });

    // Verify 2 plates for Ahmedabad Stolen Vehicles Watchlist (DEMO)
    expect(screen.getByText('2 plates')).toBeInTheDocument();
    // Verify 1 plate for High-Priority Inter-District Suspects (DEMO)
    expect(screen.getByText('1 plate')).toBeInTheDocument();
  });

  it('filters watchlists by search term and restores all watchlists when cleared', async () => {
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Ahmedabad Stolen Vehicles Watchlist (DEMO)').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('High-Priority Inter-District Suspects (DEMO)')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search watchlists...');

    // Type "Ahmedabad" into search input
    fireEvent.change(searchInput, { target: { value: 'Ahmedabad' } });

    expect(screen.getAllByText('Ahmedabad Stolen Vehicles Watchlist (DEMO)').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('High-Priority Inter-District Suspects (DEMO)')).not.toBeInTheDocument();

    // Clear search input
    fireEvent.change(searchInput, { target: { value: '' } });

    expect(screen.getAllByText('Ahmedabad Stolen Vehicles Watchlist (DEMO)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('High-Priority Inter-District Suspects (DEMO)')).toBeInTheDocument();
  });

  it('re-fetches authoritative data and maintains counts on refresh', async () => {
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Ahmedabad Stolen Vehicles Watchlist (DEMO)').length).toBeGreaterThanOrEqual(1);
    });

    expect(watchlistsApi.listWatchlists).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByTitle('Refresh watchlists');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(watchlistsApi.listWatchlists).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText('2 plates')).toBeInTheDocument();
    expect(screen.getByText('1 plate')).toBeInTheDocument();
  });

  it('allows switching selection between watchlists and updating the detail table', async () => {
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    // Select the second watchlist
    const secondWatchlist = screen.getByText('High-Priority Inter-District Suspects (DEMO)');
    fireEvent.click(secondWatchlist);

    await waitFor(() => {
      expect(screen.getByText('GJ27EF9012')).toBeInTheDocument();
      expect(screen.getByText('Inter-district armed robbery suspect')).toBeInTheDocument();
    });
  });

  it('allows authorized users (ADMIN/INVESTIGATOR) to see action buttons', async () => {
    mockUserRole = 'SUPER_ADMIN';
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getByText('New Watchlist')).toBeInTheDocument();
      expect(screen.getByText('Flag License Plate')).toBeInTheDocument();
    });
  });

  it('hides creation action buttons for unauthorized roles (OPERATOR)', async () => {
    mockUserRole = 'OPERATOR';
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Ahmedabad Stolen Vehicles Watchlist (DEMO)').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText('New Watchlist')).not.toBeInTheDocument();
    expect(screen.queryByText('Flag License Plate')).not.toBeInTheDocument();
  });

  it('displays empty state when no watchlists are returned', async () => {
    vi.mocked(watchlistsApi.listWatchlists).mockResolvedValue([]);
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getByText('No watchlists found.')).toBeInTheDocument();
    });
  });

  it('displays error state when API fails to fetch watchlists', async () => {
    vi.mocked(watchlistsApi.listWatchlists).mockRejectedValue(new Error('PostgreSQL connection timeout'));
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getByText('PostgreSQL connection timeout')).toBeInTheDocument();
    });
  });

  it('allows deactivating an active entry', async () => {
    vi.mocked(watchlistsApi.deactivateEntry).mockResolvedValue({
      ...MOCK_ENTRIES[0],
      active: false,
    });

    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    const deactivateBtn = screen.getByTitle('Deactivate plate');
    fireEvent.click(deactivateBtn);

    await waitFor(() => {
      expect(watchlistsApi.deactivateEntry).toHaveBeenCalledWith('ent-1');
    });
  });

  it('clearly distinguishes targets with camera sightings vs zero sightings and provides tracking route', async () => {
    render(<WatchlistPage />);

    await waitFor(() => {
      expect(screen.getByText('GJ01AB1234')).toBeInTheDocument();
    });

    // Plate with sightings (GJ01AB1234, sightings: 2)
    const plateLink = screen.getByRole('link', { name: /GJ01AB1234/i });
    expect(plateLink).toBeInTheDocument();
    expect(plateLink).toHaveAttribute('href', '/vehicles/GJ01AB1234');

    expect(screen.getByText('2 camera sightings recorded')).toBeInTheDocument();

    const trackBtn = screen.getByRole('link', { name: /^Track$/i });
    expect(trackBtn).toBeInTheDocument();
    expect(trackBtn).toHaveAttribute('href', '/vehicles/GJ01AB1234');

    // Plate without sightings (GJ05CD5678, sightings: 0)
    expect(screen.getByText('GJ05CD5678')).toBeInTheDocument();
    expect(screen.getByText('No camera sightings recorded')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /GJ05CD5678/i })).not.toBeInTheDocument();
  });
});
