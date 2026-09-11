'use client';

// ==============================================================================
// Vehicle Detail Page — /vehicles/[plate]
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 10, 14.2)
//                  docs/API.md (Section 5.2, 5.3, 5.4)
//
// Three-tab layout:
//   Tab 1 — Overview: vehicle attributes, watchlist details, first/last sighting
//   Tab 2 — Sighting Timeline: chronological table + route hop analytics
//   Tab 3 — Route Map: MapLibre GL GIS polyline + sighting markers
//
// Authorization: INVESTIGATOR, DEPARTMENT_ADMIN, SUPER_ADMIN only.
// Every page load triggers backend audit events:
//   VEHICLE_DETAIL_VIEW + VEHICLE_TIMELINE_SEARCH
//
// GOVERNANCE:
//   Correlation is PLATE-BASED ANPR ONLY. Not visual re-ID. Not face recognition.
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Car,
  ArrowLeft,
  AlertTriangle,
  Shield,
  Clock,
  MapPin,
  ScanLine,
  Map,
  List,
  Eye,
  Info,
  FileArchive,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { SightingsTimeline } from '@/components/vehicles/SightingsTimeline';
import { RouteMap } from '@/components/vehicles/RouteMap';
import { EvidenceExportModal } from '@/components/evidence/EvidenceExportModal';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { vehiclesApi } from '@/lib/api/vehicles';
import { VehicleDetail, VehicleTimelineResponse } from '@/types/vehicle';
import { useAuth } from '@/lib/auth/context';
import { hasRoleAccess, canExportEvidence } from '@/lib/auth/rbac';

type PageState = 'loading' | 'error' | 'loaded';
type ActiveTab = 'overview' | 'timeline' | 'map';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getPriorityVariant(priority: string | null | undefined): BadgeVariant {
  switch (priority?.toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'warning';
    case 'MEDIUM':
      return 'info';
    default:
      return 'neutral';
  }
}

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function DetailField({ label, value, mono }: DetailFieldProps) {
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function VehicleDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isAuthorized = hasRoleAccess(user?.role, ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR']);
  const isEvidenceExportAuthorized = canExportEvidence(user?.role);

  const params = useParams();
  const router = useRouter();
  const rawPlate = Array.isArray(params.plate) ? params.plate[0] : params.plate || '';
  const plate = decodeURIComponent(rawPlate);

  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [vehicleDetail, setVehicleDetail] = useState<VehicleDetail | null>(null);
  const [timeline, setTimeline] = useState<VehicleTimelineResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [evidenceSightingId, setEvidenceSightingId] = useState<string | null>(null);

  const loadData = async () => {
    if (!plate || authLoading || !isAuthorized) return;

    setPageState('loading');
    setErrorMessage('');

    try {
      // Fetch both in parallel
      const [detail, tl] = await Promise.all([
        vehiclesApi.getVehicleByPlate(plate),
        vehiclesApi.getVehicleTimeline(plate),
      ]);

      setVehicleDetail(detail);
      setTimeline(tl);
      setPageState('loaded');
    } catch (err: any) {
      console.error('Vehicle detail load error:', err);
      const code = err.statusCode;
      if (code === 404) {
        setErrorMessage(`Vehicle "${plate}" has no records in the CCTV system. This plate has never been observed by any registered camera.`);
      } else if (code === 403) {
        setErrorMessage('Access denied. Vehicle investigation requires INVESTIGATOR, DEPARTMENT_ADMIN, or SUPER_ADMIN role.');
      } else {
        setErrorMessage(err.message || 'Failed to load vehicle data. Verify backend connectivity.');
      }
      setPageState('error');
    }
  };

  useEffect(() => {
    if (!authLoading && isAuthorized) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate, authLoading, isAuthorized]);

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

  const tabs = [
    { id: 'overview' as ActiveTab, label: 'Overview', icon: Info },
    { id: 'timeline' as ActiveTab, label: 'Sighting Timeline', icon: List },
    { id: 'map' as ActiveTab, label: 'Route Map', icon: Map },
  ];

  return (
    <AppShell>
      <div
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        {/* Back navigation */}
        <button
          id="vehicle-detail-back"
          onClick={() => router.push('/vehicles')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            padding: 0,
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={14} />
          Back to Vehicle Search
        </button>

        {pageState === 'loading' && (
          <div style={{ padding: 'var(--space-12)' }}>
            <LoadingState
              message={`Loading vehicle record for ${plate}…`}
              subtext="Fetching sighting history and route trajectory from PostGIS backend"
            />
          </div>
        )}

        {pageState === 'error' && (
          <ErrorState
            title="Vehicle Record Unavailable"
            message={errorMessage}
            onRetry={loadData}
          />
        )}

        {pageState === 'loaded' && vehicleDetail && timeline && (
          <>
            {/* Vehicle Header Card */}
            <div
              style={{
                backgroundColor: vehicleDetail.is_watchlisted ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-card)',
                border: `1px solid ${vehicleDetail.is_watchlisted ? 'var(--status-critical-border)' : 'var(--border-default)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5) var(--space-6)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              {/* Top row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
                  flexWrap: 'wrap',
                  marginBottom: vehicleDetail.is_watchlisted ? 'var(--space-4)' : 'var(--space-3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: vehicleDetail.is_watchlisted ? 'var(--status-critical-bg)' : 'var(--accent-subtle)',
                      border: `1px solid ${vehicleDetail.is_watchlisted ? 'var(--status-critical-border)' : 'var(--accent-border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Car size={22} color={vehicleDetail.is_watchlisted ? 'var(--status-critical)' : 'var(--accent-primary)'} />
                  </div>
                  <div>
                    <h1
                      style={{
                        fontSize: 'var(--text-3xl)',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.12em',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {vehicleDetail.plate_normalized}
                    </h1>
                    {vehicleDetail.attributes && (
                      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: '4px' }}>
                        {[
                          vehicleDetail.attributes.color,
                          vehicleDetail.attributes.make,
                          vehicleDetail.attributes.model,
                          vehicleDetail.attributes.type,
                        ]
                          .filter(Boolean)
                          .map((val, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 'var(--text-xs)',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                backgroundColor: 'var(--bg-surface)',
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-xs)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              {val}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
                  <SimulatedDataBadge compact />
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    {vehicleDetail.is_watchlisted ? (
                      <>
                        <StatusBadge
                          label={vehicleDetail.watchlist_details?.priority || 'WATCHLISTED'}
                          variant={getPriorityVariant(vehicleDetail.watchlist_details?.priority)}
                          icon={<AlertTriangle size={11} />}
                        />
                        {vehicleDetail.watchlist_details?.category && (
                          <StatusBadge
                            label={vehicleDetail.watchlist_details.category.replace(/_/g, ' ')}
                            variant="critical"
                          />
                        )}
                      </>
                    ) : (
                      <StatusBadge label="WATCHLIST CLEAR" variant="success" icon={<Shield size={11} />} />
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Eye size={11} />
                    {vehicleDetail.total_sightings} sighting{vehicleDetail.total_sightings !== 1 ? 's' : ''} recorded
                  </span>
                  {isEvidenceExportAuthorized && ((vehicleDetail.last_known_sighting?.id) || (timeline?.sightings?.[0]?.id)) && (
                    <button
                      id="header-export-evidence-btn"
                      onClick={() => {
                        const targetId = vehicleDetail.last_known_sighting?.id || timeline?.sightings?.[0]?.id;
                        if (targetId) setEvidenceSightingId(targetId);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--accent-primary)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginTop: '4px',
                      }}
                    >
                      <FileArchive size={13} /> Export Evidence Package
                    </button>
                  )}
                </div>
              </div>

              {/* Watchlist details box */}
              {vehicleDetail.is_watchlisted && vehicleDetail.watchlist_details && (
                <div
                  style={{
                    backgroundColor: 'var(--status-critical-bg)',
                    border: '1px solid var(--status-critical-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3) var(--space-4)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-3)',
                  }}
                >
                  <AlertTriangle size={16} color="var(--status-critical)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--status-critical)', marginBottom: '4px' }}>
                      WATCHLIST ALERT — {vehicleDetail.watchlist_details.category?.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      {vehicleDetail.watchlist_details.reason}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Flagged at: {formatTimestamp(vehicleDetail.watchlist_details.flagged_at)}
                    </div>
                    <div
                      style={{
                        marginTop: 'var(--space-2)',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                        borderTop: '1px solid var(--status-critical-border)',
                        paddingTop: 'var(--space-2)',
                      }}
                    >
                      A watchlist plate match confirms only that a camera captured a vehicle bearing this plate. It does NOT confirm driver or occupant identity. Corroborating evidence and authorized verification are required before enforcement action.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tab Navigation */}
            <div
              style={{
                display: 'flex',
                gap: 0,
                borderBottom: '1px solid var(--border-default)',
              }}
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`vehicle-tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'none',
                      border: 'none',
                      borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      marginBottom: '-1px',
                    }}
                  >
                    <tab.icon size={14} />
                    {tab.label}
                    {tab.id === 'timeline' && (
                      <span
                        style={{
                          fontSize: '10px',
                          backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                          color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                          border: '1px solid',
                          borderColor: isActive ? 'var(--accent-border)' : 'var(--border-subtle)',
                          borderRadius: 'var(--radius-full)',
                          padding: '0 6px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                        }}
                      >
                        {timeline.total_sightings}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div style={{ minHeight: '300px' }}>

              {/* === OVERVIEW TAB === */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  {/* Sighting period */}
                  <section>
                    <h2
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginBottom: 'var(--space-3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <Clock size={13} />
                      Observation Window
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                      <DetailField
                        label="First Sighting"
                        value={formatTimestamp(vehicleDetail.first_seen)}
                        mono
                      />
                      <DetailField
                        label="Last Sighting"
                        value={formatTimestamp(vehicleDetail.last_seen)}
                        mono
                      />
                    </div>
                  </section>

                  {/* First / last camera */}
                  {(vehicleDetail.first_known_sighting || vehicleDetail.last_known_sighting) && (
                    <section>
                      <h2
                        style={{
                          fontSize: 'var(--text-sm)',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: 'var(--space-3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <MapPin size={13} />
                        First &amp; Last Known Locations
                      </h2>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        {vehicleDetail.first_known_sighting && (
                          <div
                            style={{
                              padding: 'var(--space-4)',
                              backgroundColor: 'var(--status-success-bg)',
                              border: '1px solid var(--status-success-border)',
                              borderRadius: 'var(--radius-md)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: 'var(--status-success)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                marginBottom: 'var(--space-2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <ScanLine size={11} /> First Observation
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: '4px' }}>
                              {vehicleDetail.first_known_sighting.camera_name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              {vehicleDetail.first_known_sighting.location}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {formatTimestamp(vehicleDetail.first_known_sighting.timestamp)}
                            </div>
                          </div>
                        )}
                        {vehicleDetail.last_known_sighting && (
                          <div
                            style={{
                              padding: 'var(--space-4)',
                              backgroundColor: 'rgba(239, 68, 68, 0.06)',
                              border: '1px solid var(--status-critical-border)',
                              borderRadius: 'var(--radius-md)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: 'var(--status-critical)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                marginBottom: 'var(--space-2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <ScanLine size={11} /> Last Observation
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: '4px' }}>
                              {vehicleDetail.last_known_sighting.camera_name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              {vehicleDetail.last_known_sighting.location}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {formatTimestamp(vehicleDetail.last_known_sighting.timestamp)}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Route summary preview */}
                  {timeline.sightings.length >= 2 && (
                    <section>
                      <h2
                        style={{
                          fontSize: 'var(--text-sm)',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: 'var(--space-3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <Map size={13} />
                        Route Summary
                      </h2>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
                        <DetailField
                          label="Total Distance"
                          value={
                            timeline.summary.total_distance_meters < 1000
                              ? `${Math.round(timeline.summary.total_distance_meters)} m`
                              : `${(timeline.summary.total_distance_meters / 1000).toFixed(2)} km`
                          }
                          mono
                        />
                        <DetailField
                          label="Avg Speed"
                          value={`${timeline.summary.average_speed_kmh.toFixed(1)} km/h`}
                          mono
                        />
                        <DetailField
                          label="Camera Hops"
                          value={String(timeline.summary.hops_count)}
                          mono
                        />
                        <DetailField
                          label="Route Score"
                          value={
                            <span style={{ color: timeline.route_plausibility_score === 1 ? 'var(--status-success)' : 'var(--status-warning)' }}>
                              {Math.round(timeline.route_plausibility_score * 100)}%
                            </span>
                          }
                        />
                      </div>
                      <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)' }}>
                        <button
                          onClick={() => setActiveTab('timeline')}
                          style={{
                            padding: 'var(--space-2) var(--space-4)',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <List size={13} /> View Timeline
                        </button>
                        <button
                          onClick={() => setActiveTab('map')}
                          style={{
                            padding: 'var(--space-2) var(--space-4)',
                            backgroundColor: 'var(--accent-subtle)',
                            border: '1px solid var(--accent-border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--accent-primary)',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Map size={13} /> View Route Map
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}

              {/* === TIMELINE TAB === */}
              {activeTab === 'timeline' && (
                <SightingsTimeline
                  sightings={timeline.sightings}
                  routeSegments={timeline.route_segments}
                  summary={timeline.summary}
                  routePlausibilityScore={timeline.route_plausibility_score}
                  onExportEvidence={isEvidenceExportAuthorized ? (sightingId) => setEvidenceSightingId(sightingId) : undefined}
                  userRole={user?.role}
                />
              )}

              {/* === MAP TAB === */}
              {activeTab === 'map' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <RouteMap
                    sightings={timeline.sightings}
                    routeSegments={timeline.route_segments}
                    disclaimer={timeline.disclaimer}
                    plateNormalized={vehicleDetail.plate_normalized}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Evidence Verification & Export Package Modal */}
        {isEvidenceExportAuthorized && evidenceSightingId && vehicleDetail && (
          <EvidenceExportModal
            sightingId={evidenceSightingId}
            plateNormalized={vehicleDetail.plate_normalized}
            isOpen={true}
            onClose={() => setEvidenceSightingId(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
