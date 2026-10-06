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
  Activity,
  Layers,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { VehicleSearchBar } from '@/components/vehicles/VehicleSearchBar';
import { VehicleResultCard } from '@/components/vehicles/VehicleResultCard';
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
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: 'var(--space-6)' }}>
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
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: 'var(--space-6)' }}>
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
          maxWidth: '1080px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        {/* Page Header Banner */}
        <div
          className="netrava-card"
          style={{
            padding: '16px 20px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'var(--highlight-gradient)',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Car size={18} color="#60A5FA" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <h1
                    style={{
                      fontSize: 'var(--text-lg)',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      letterSpacing: '0.01em',
                      margin: 0,
                    }}
                  >
                    Vehicle Intelligence
                  </h1>
                  <span
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      color: '#60A5FA',
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-xs)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    ANPR CORRELATION
                  </span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                  Plate correlation &bull; Spatial trajectory reconstruction &bull; Watchlist matching
                </p>
              </div>
            </div>

          </div>

          {/* Role & Governance Notice */}
          <div
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: 'var(--radius-xs)',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            <Shield size={13} color="#60A5FA" style={{ flexShrink: 0 }} />
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>SECURE ACCESS:</strong> All searches logged to immutable audit ledger (<code style={{ fontFamily: 'var(--font-mono)', color: '#60A5FA' }}>VEHICLE_SEARCH</code>). Authorized: INVESTIGATOR, DEPARTMENT_ADMIN, SUPER_ADMIN.
            </span>
          </div>
        </div>

        {/* Search Bar Component */}
        <VehicleSearchBar
          onSearch={handleSearch}
          isLoading={searchState === 'loading'}
          initialValue=""
        />

        {/* Results Section */}
        {searchState === 'idle' && (
          <div
            className="netrava-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-10) var(--space-6)',
              gap: 'var(--space-4)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(59, 130, 246, 0.2)',
              }}
            >
              <Search size={24} color="#60A5FA" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-primary)', marginBottom: '4px' }}>
                Enter License Plate to Begin Investigation
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Full plate (<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>GJ01AB1234</span>) or prefix (<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>GJ01</span>)
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
                { icon: Database, text: '39+ Registered Plate Records' },
                { icon: ScanLine, text: 'ANPR Plate-Based Correlation' },
                { icon: Shield, text: 'Audit-Logged Access' },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-xs)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                  }}
                >
                  <Icon size={11} color="var(--accent-blue)" />
                  {text}
                </div>
              ))}
            </div>
          </div>
        )}

        {searchState === 'loading' && (
          <div className="netrava-card" style={{ padding: 'var(--space-10)' }}>
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
            {/* Results Header Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-1)',
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
                    {watchlistedCount} Watchlisted Target{watchlistedCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {pagination && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Page {currentPage} of {pagination.total_pages}
                </span>
              )}
            </div>

            {results.length === 0 ? (
              <div
                className="netrava-card"
                style={{
                  padding: 'var(--space-10)',
                  textAlign: 'center',
                }}
              >
                <Car size={32} color="var(--text-dim)" style={{ margin: '0 auto var(--space-3)' }} />
                <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  No vehicles found matching "{searchedPlate}"
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  No camera sightings have been recorded for this plate in the active CCTV telemetry feed.
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

            {/* Pagination Controls */}
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
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    opacity: currentPage <= 1 ? 0.4 : 1,
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
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    opacity: currentPage >= pagination.total_pages ? 0.4 : 1,
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
