'use client';

// ==============================================================================
// Vehicle Intelligence Search Page — /vehicles
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 14.2)
//                  docs/API.md (Section 5.1)
//
// Authorization: INVESTIGATOR, DEPARTMENT_ADMIN, SUPER_ADMIN only.
// Any unauthorized role will receive a 403 from the backend and see an error.
// All searches are audit-logged server-side (VEHICLE_SEARCH event).
// ==============================================================================

import React, { useState, useCallback } from 'react';
import {
  Car,
  Search,
  Shield,
  AlertTriangle,
  Database,
  ScanLine,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { VehicleSearchBar } from '@/components/vehicles/VehicleSearchBar';
import { VehicleResultCard } from '@/components/vehicles/VehicleResultCard';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { vehiclesApi } from '@/lib/api/vehicles';
import { VehicleSearchResult, VehicleSearchResponse } from '@/types/vehicle';
import { useAuth } from '@/lib/auth/context';
import { hasRoleAccess } from '@/lib/auth/rbac';
import { useRouter } from 'next/navigation';

type SearchState = 'idle' | 'loading' | 'error' | 'results';

export default function VehiclesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const isAuthorized = hasRoleAccess(user?.role, ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR']);

  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [searchedPlate, setSearchedPlate] = useState<string>('');
  const [results, setResults] = useState<VehicleSearchResult[]>([]);
  const [pagination, setPagination] = useState<VehicleSearchResponse['pagination'] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const performSearch = useCallback(async (plate: string, page = 1) => {
    if (!plate.trim()) return;

    setSearchState('loading');
    setSearchedPlate(plate);
    setErrorMessage('');

    try {
      const response = await vehiclesApi.searchVehicles({
        q: plate,
        page,
        limit: 20,
      });
      setResults(response.data);
      setPagination(response.pagination);
      setCurrentPage(page);
      setSearchState('results');
    } catch (err: any) {
      console.error('Vehicle search error:', err);
      const msg = err.message || 'Vehicle search failed. Check your authorization and network status.';
      setErrorMessage(msg);
      setSearchState('error');
    }
  }, []);

  const handleSearch = (plate: string) => {
    performSearch(plate, 1);
  };

  const handleRetry = () => {
    if (searchedPlate) performSearch(searchedPlate, currentPage);
  };

  const handlePageChange = (newPage: number) => {
    performSearch(searchedPlate, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const watchlistedCount = results.filter((v) => v.is_watchlisted).length;

  if (authLoading) {
    return (
      <AppShell>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: 'var(--space-6)' }}>
          <LoadingState
            message="Verifying investigation credentials..."
            subtext="Checking cryptographic session and officer RBAC role"
          />
        </div>
      </AppShell>
    );
  }

  if (!isAuthorized) {
    return (
      <AppShell>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: 'var(--space-6)' }}>
          <ErrorState
            title="Investigation Access Restricted"
            message="Vehicle intelligence search and cross-camera tracking are restricted to Investigator, Department Admin, and Super Admin personnel."
            errorCode="403_FORBIDDEN"
            onRetry={() => router.push('/')}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        {/* Page Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Car size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <h1
                style={{
                  fontSize: 'var(--text-2xl)',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                Vehicle Intelligence
              </h1>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                Plate-based cross-camera correlation · PostGIS route reconstruction · Watchlist matching
              </p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <SimulatedDataBadge compact />
            </div>
          </div>

          {/* Role notice */}
          <div
            style={{
              backgroundColor: 'var(--status-info-bg)',
              border: '1px solid var(--status-info-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2) var(--space-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}
          >
            <Shield size={12} color="var(--status-info)" />
            <span>
              <strong style={{ color: 'var(--status-info)' }}>Investigation access required.</strong> All
              searches are synchronously audit-logged (VEHICLE_SEARCH). Authorized roles: INVESTIGATOR,
              DEPARTMENT_ADMIN, SUPER_ADMIN.
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <VehicleSearchBar
          onSearch={handleSearch}
          isLoading={searchState === 'loading'}
          initialValue=""
        />

        {/* Results Section */}
        {searchState === 'idle' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
              gap: 'var(--space-4)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Search size={28} color="var(--accent-primary)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Enter a license plate to begin investigation
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                Search by full plate (GJ01AB1234) or partial prefix (GJ01)
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                justifyContent: 'center',
                fontSize: '11px',
                color: 'var(--text-muted)',
              }}
            >
              {[
                { icon: Database, text: `${39}+ active plate records` },
                { icon: ScanLine, text: 'ANPR plate-based correlation only' },
                { icon: Shield, text: 'Audit-logged investigative access' },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  <Icon size={11} color="var(--text-muted)" />
                  {text}
                </div>
              ))}
            </div>
          </div>
        )}

        {searchState === 'loading' && (
          <div style={{ padding: 'var(--space-12)' }}>
            <LoadingState
              message={`Searching vehicle records for "${searchedPlate}"…`}
              subtext="Querying ANPR plate database and watchlist correlations"
            />
          </div>
        )}

        {searchState === 'error' && (
          <ErrorState
            title="Vehicle Search Failed"
            message={errorMessage}
            onRetry={handleRetry}
          />
        )}

        {searchState === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Results header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {pagination?.total ?? results.length} result{(pagination?.total ?? results.length) !== 1 ? 's' : ''} for{' '}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-primary)',
                      fontSize: 'var(--text-md)',
                    }}
                  >
                    {searchedPlate}
                  </span>
                </span>

                {watchlistedCount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      backgroundColor: 'var(--status-critical-bg)',
                      border: '1px solid var(--status-critical-border)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--status-critical)',
                    }}
                  >
                    <AlertTriangle size={11} />
                    {watchlistedCount} watchlisted
                  </div>
                )}
              </div>

              {pagination && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Page {currentPage} of {pagination.total_pages}
                </span>
              )}
            </div>

            {results.length === 0 ? (
              <div
                style={{
                  padding: 'var(--space-10)',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <Car size={32} color="var(--text-muted)" style={{ margin: '0 auto var(--space-3)' }} />
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  No vehicles found for "{searchedPlate}"
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  No camera sightings have been recorded for this plate in the system.
                </div>
              </div>
            ) : (
              <div
                role="feed"
                aria-label="Vehicle search results"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                {results.map((vehicle) => (
                  <VehicleResultCard key={vehicle.plate_normalized} vehicle={vehicle} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.total_pages > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-4)',
                }}
              >
                <button
                  id="vehicle-search-prev-page"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    color: currentPage <= 1 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>

                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {currentPage} / {pagination.total_pages}
                </span>

                <button
                  id="vehicle-search-next-page"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= pagination.total_pages}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    color: currentPage >= pagination.total_pages ? 'var(--text-disabled)' : 'var(--text-secondary)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    cursor: currentPage >= pagination.total_pages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
