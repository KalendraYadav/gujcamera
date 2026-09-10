import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VehiclesPage from '@/app/vehicles/page';
import { vehiclesApi } from '@/lib/api/vehicles';
import { useAuth } from '@/lib/auth/context';
import { VehicleSearchResponse } from '@/types/vehicle';

// Mock vehicles API
vi.mock('@/lib/api/vehicles', () => ({
  vehiclesApi: {
    searchVehicles: vi.fn(),
  },
}));

// Mock Next Navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/vehicles',
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock AuthContext
vi.mock('@/lib/auth/context', () => ({
  useAuth: vi.fn(),
}));

const MOCK_VEHICLE_RESPONSE: VehicleSearchResponse = {
  data: [
    {
      plate_normalized: 'GJ01AB1234',
      attributes: {
        color: 'WHITE',
        make: 'Hyundai',
        model: 'Verna',
        type: 'SEDAN',
      },
      total_sightings: 3,
      first_seen: '2026-09-08T10:00:00.000Z',
      last_seen: '2026-09-09T14:30:00.000Z',
      is_watchlisted: true,
      watchlist_category: 'Stolen Vehicles',
      watchlist_priority: 'HIGH',
    },
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 1,
    total_pages: 1,
  },
};

describe('Vehicle Intelligence Page (/vehicles) — RBAC & Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restricts OPERATOR from accessing /vehicles and prevents search API invocation', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'usr-op-1',
        email: 'operator.demo@gujcamera.local',
        role: 'OPERATOR',
        department_id: 'dept-ahm-1',
        department_name: 'Ahmedabad City Police',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    render(<VehiclesPage />);

    expect(screen.getByText('Investigation Access Restricted')).toBeInTheDocument();
    expect(screen.getByText(/restricted to Investigator, Department Admin, and Super Admin personnel/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/GJ 01 AB 1234/i)).not.toBeInTheDocument();
    expect(vehiclesApi.searchVehicles).not.toHaveBeenCalled();
  });

  it('restricts SYSTEM_AUDITOR from accessing /vehicles', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'usr-aud-1',
        email: 'auditor.demo@gujcamera.local',
        role: 'SYSTEM_AUDITOR',
        department_id: 'dept-dgp-1',
        department_name: 'DGP Headquarters',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    render(<VehiclesPage />);

    expect(screen.getByText('Investigation Access Restricted')).toBeInTheDocument();
    expect(vehiclesApi.searchVehicles).not.toHaveBeenCalled();
  });

  it('allows INVESTIGATOR to access /vehicles and render search interface', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'usr-inv-1',
        email: 'investigator.demo@gujcamera.local',
        role: 'INVESTIGATOR',
        department_id: 'dept-ahm-1',
        department_name: 'Ahmedabad City Police',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    render(<VehiclesPage />);

    expect(screen.getByText('Vehicle Intelligence')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/GJ 01 AB 1234/i)).toBeInTheDocument();
  });

  it('allows DEPARTMENT_ADMIN to access /vehicles', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'usr-dept-1',
        email: 'deptadmin.demo@gujcamera.local',
        role: 'DEPARTMENT_ADMIN',
        department_id: 'dept-gnd-1',
        department_name: 'Gandhinagar District Police',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    render(<VehiclesPage />);

    expect(screen.getByText('Vehicle Intelligence')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/GJ 01 AB 1234/i)).toBeInTheDocument();
  });

  it('allows SUPER_ADMIN to access /vehicles', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'usr-admin-1',
        email: 'admin.demo@gujcamera.local',
        role: 'SUPER_ADMIN',
        department_id: 'dept-dgp-1',
        department_name: 'DGP Headquarters',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    render(<VehiclesPage />);

    expect(screen.getByText('Vehicle Intelligence')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/GJ 01 AB 1234/i)).toBeInTheDocument();
  });

  it('executes vehicle search for GJ01AB1234 when authorized and renders result card', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'usr-inv-1',
        email: 'investigator.demo@gujcamera.local',
        role: 'INVESTIGATOR',
        department_id: 'dept-ahm-1',
        department_name: 'Ahmedabad City Police',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      error: null,
    });

    vi.mocked(vehiclesApi.searchVehicles).mockResolvedValue(MOCK_VEHICLE_RESPONSE);

    render(<VehiclesPage />);

    const searchInput = screen.getByPlaceholderText(/GJ 01 AB 1234/i);
    fireEvent.change(searchInput, { target: { value: 'GJ01AB1234' } });

    const form = searchInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(vehiclesApi.searchVehicles).toHaveBeenCalledWith({
        q: 'GJ01AB1234',
        page: 1,
        limit: 20,
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('GJ01AB1234').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Hyundai')).toBeInTheDocument();
      expect(screen.getByText('Verna')).toBeInTheDocument();
    });
  });
});
