'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Shield,
  Video,
  MapPin,
  Car,
  BellRing,
  Activity,
  ArrowRight,
  ShieldAlert,
  Server,
  Cpu,
  Database,
  Radio,
  Clock,
  RefreshCw,
  AlertTriangle,
  Layers,
  CheckCircle2,
  XCircle,
  Eye,
  ListFilter,
  FileCheck2,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { AppShell } from '@/components/layout/AppShell';
import { formatRoleName, hasRoleAccess } from '@/lib/auth/rbac';
import { PoliceRole } from '@/types/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PoliceCrest } from '@/components/auth/PoliceCrest';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { dashboardApi } from '@/lib/api/dashboard';
import { OperationalSummaryResponse } from '@/types/dashboard';

export default function OperationalCommandCenterPage() {
  const { user } = useAuth();
  const [data, setData] = useState<OperationalSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const isAuditor = user?.role === 'SYSTEM_AUDITOR';

  const fetchSummary = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      setError(null);
      const res = await dashboardApi.getOperationalSummary();
      setData(res);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to synchronize operational command telemetry';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();

    // Conservative 30-second telemetry polling interval (Section 11)
    const interval = setInterval(() => {
      fetchSummary(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchSummary]);

  // Command bar quick actions with strict RBAC filtering (Section 10 & 13)
  const COMMAND_ACTIONS = [
    {
      id: 'search-vehicle',
      label: 'SEARCH VEHICLE',
      href: '/vehicles',
      icon: <Car size={15} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR'] as PoliceRole[],
      badge: 'ANPR',
    },
    {
      id: 'alert-console',
      label: 'OPEN ALERT CONSOLE',
      href: '/alerts',
      icon: <BellRing size={15} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'] as PoliceRole[],
      badge: data?.alerts.total_active ? `${data.alerts.total_active} ACTIVE` : undefined,
      badgeVariant: 'critical' as const,
    },
    {
      id: 'open-gis',
      label: 'OPEN GIS',
      href: '/map',
      icon: <MapPin size={15} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'] as PoliceRole[],
      badge: 'SPATIAL',
    },
    {
      id: 'live-cctv',
      label: 'LIVE CCTV',
      href: '/live',
      icon: <Video size={15} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'] as PoliceRole[],
      badge: 'GRID',
    },
    {
      id: 'camera-registry',
      label: 'CAMERA REGISTRY',
      href: '/cameras',
      icon: <Activity size={15} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'] as PoliceRole[],
      badge: data?.cameras.total ? `${data.cameras.total} CAMERAS` : undefined,
    },
    {
      id: 'watchlists',
      label: 'WATCHLIST',
      href: '/watchlist',
      icon: <ListFilter size={15} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'] as PoliceRole[],
      badge: data?.watchlists.active_entries ? `${data.watchlists.active_entries} TARGETS` : undefined,
    },
  ];

  const authorizedActions = COMMAND_ACTIONS.filter((act) =>
    hasRoleAccess(user?.role, act.roles)
  );

  // Helper for Subsystem Health Badge (Section 3)
  const renderSubsystemStatus = (label: string, status?: string) => {
    if (!status) {
      return (
        <div data-testid={`subsystem-${label}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {label}:
          </span>
          <StatusBadge label="STATUS NOT AVAILABLE" variant="neutral" size="sm" />
        </div>
      );
    }

    let variant: 'success' | 'warning' | 'critical' | 'neutral' = 'neutral';
    if (status === 'HEALTHY' || status === 'ONLINE') variant = 'success';
    else if (status === 'DEGRADED') variant = 'warning';
    else if (status === 'UNAVAILABLE' || status === 'OFFLINE' || status === 'ERROR') variant = 'critical';

    return (
      <div data-testid={`subsystem-${label}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          {label}:
        </span>
        <StatusBadge label={status} variant={variant} size="sm" />
      </div>
    );
  };

  const formatISTTime = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' IST';
    } catch {
      return iso;
    }
  };

  const formatISTDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' IST';
    } catch {
      return iso;
    }
  };

  return (
    <AppShell>
      <div data-testid="operational-command-center" style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        
        {/* ====================================================================
            HEADER: NETRAVAHA OPERATIONAL INTELLIGENCE COMMAND CENTER
            ==================================================================== */}
        <div
          data-testid="command-center-header"
          className="netrava-card"
          style={{
            padding: '20px 24px',
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
              gap: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <PoliceCrest size={42} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: '#60A5FA', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em' }}>
                    NETRAVAHA
                  </span>
                  <span style={{ color: 'var(--border-medium)' }}>•</span>
                  <h1
                    style={{
                      fontSize: 'var(--text-lg)',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: '#FFFFFF',
                      lineHeight: 1.2,
                      margin: 0,
                      textTransform: 'uppercase',
                    }}
                  >
                    Operational Intelligence Command Center
                  </h1>
                  {isAuditor ? (
                    <StatusBadge label="Statutory Audit Mode" variant="info" pulse icon={<Shield size={12} />} />
                  ) : (
                    <StatusBadge label="Operational Live" variant="success" pulse icon={<Activity size={12} />} />
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Gujarat Police Innovation Challenge 2026 • State Control Room, Gandhinagar
                  </p>
                  <span style={{ color: 'var(--text-dim)' }}>|</span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#93C5FD',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      padding: '1px 8px',
                      borderRadius: 'var(--radius-xs)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    CONFIGURED PROTOTYPE SOURCES • AUTHORIZED INGESTION BOUNDARY
                  </span>
                </div>
              </div>
            </div>

            {/* Officer Profile & Telemetry Sync Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(11, 16, 32, 0.75)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60A5FA',
                    flexShrink: 0,
                  }}
                >
                  <Shield size={15} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {isAuditor ? 'Statutory Auditor' : 'Command Officer'}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {user?.email || 'officer@gujaratpolice.gov.in'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#60A5FA', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                    {formatRoleName(user?.role)} • {user?.department_name || 'State Command'}
                  </div>
                </div>
              </div>

              {/* Manual Refresh & Sync Status */}
              <button
                data-testid="btn-refresh-telemetry"
                onClick={() => fetchSummary(true)}
                disabled={isRefreshing}
                className="btn-secondary"
                style={{
                  height: '46px',
                  padding: '0 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
                title="Synchronize command telemetry"
                aria-label="Refresh Command Telemetry"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'SYNCING...' : 'REFRESH'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Loading / Error Notifications */}
        {isLoading && !data && (
          <div style={{ padding: '60px 0' }}>
            <LoadingState
              message="Synchronizing Operational Command Summary..."
              subtext="Aggregating camera state machines, alert queue, ANPR consensus, and GIS fleet telemetry"
            />
          </div>
        )}

        {error && !data && (
          <ErrorState
            title="Operational Intelligence Synchronization Failed"
            message={error}
            errorCode="COMMAND_SYNC_ERROR"
            onRetry={() => fetchSummary(true)}
          />
        )}

        {data && (
          <>
            {/* ================================================================
                SECTION 3: SYSTEM HEALTH STRIP
                Real values: CAMERA NETWORK, STREAM GATEWAY, AI PIPELINE, DATABASE, EVENT PIPELINE
                ================================================================ */}
            <div
              className="netrava-card"
              style={{
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={14} color="#60A5FA" />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.06em' }}>
                  SYSTEM HEALTH:
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {renderSubsystemStatus('CAMERA NETWORK', data.system.camera_network)}
                {renderSubsystemStatus('STREAM GATEWAY', data.system.stream_gateway)}
                {renderSubsystemStatus('AI PIPELINE', data.system.ai_pipeline)}
                {renderSubsystemStatus('DATABASE', data.system.database)}
                {renderSubsystemStatus('EVENT PIPELINE', data.system.event_pipeline)}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                <Clock size={12} />
                <span>TELEMETRY: {lastRefreshed ? formatISTTime(lastRefreshed.toISOString()) : 'SYNCED'}</span>
              </div>
            </div>

            {/* ================================================================
                SECTION 10: QUICK COMMAND ACTIONS BAR
                ================================================================ */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <div className="netrava-card-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={13} color="#60A5FA" />
                  Tactical Command Navigation
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  AUTHORIZED ROLES ONLY
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '10px',
                }}
              >
                {authorizedActions.map((act) => (
                  <Link
                    key={act.id}
                    href={act.href}
                    data-testid={`quick-action-${act.id}`}
                    className="netrava-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      textDecoration: 'none',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.45)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#60A5FA', display: 'flex' }}>{act.icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.03em', color: '#FFFFFF', fontFamily: 'var(--font-sans)' }}>
                        {act.label}
                      </span>
                    </div>
                    {act.badge && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: act.badgeVariant === 'critical' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.12)',
                          color: act.badgeVariant === 'critical' ? '#F87171' : '#93C5FD',
                          border: `1px solid ${act.badgeVariant === 'critical' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.25)'}`,
                        }}
                      >
                        {act.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* ================================================================
                SECTION 4: CAMERA NETWORK OVERVIEW
                TOTAL CAMERAS / ONLINE / DEGRADED / OFFLINE / ERROR
                ================================================================ */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <div className="netrava-card-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Radio size={13} color="#34D399" />
                  Camera Network Overview
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    CONFIGURED DEMO FLEET: {data.cameras.configured_prototype_sources} SOURCES
                  </span>
                  <Link
                    href="/cameras"
                    style={{ fontSize: '11px', color: '#60A5FA', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    View All <ArrowRight size={11} />
                  </Link>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: '10px',
                }}
              >
                <div className="netrava-card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    Total Cameras
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span data-testid="camera-overview-total" style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.total}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      Prototype
                    </span>
                  </div>
                </div>

                <div className="netrava-card" style={{ padding: '14px 16px', borderLeft: '3px solid #34D399' }}>
                  <div style={{ fontSize: '11px', color: '#34D399', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    Online Cameras
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span data-testid="camera-overview-online" style={{ fontSize: '24px', fontWeight: 700, color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.online}
                    </span>
                    <span style={{ fontSize: '11px', color: '#34D399' }}>
                      {data.cameras.total > 0 ? `${Math.round((data.cameras.online / data.cameras.total) * 100)}%` : '0%'}
                    </span>
                  </div>
                </div>

                <div className="netrava-card" style={{ padding: '14px 16px', borderLeft: '3px solid #FBBF24' }}>
                  <div style={{ fontSize: '11px', color: '#FBBF24', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    Degraded Streams
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span data-testid="camera-overview-degraded" style={{ fontSize: '24px', fontWeight: 700, color: '#FBBF24', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.degraded}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      Health Check
                    </span>
                  </div>
                </div>

                <div className="netrava-card" style={{ padding: '14px 16px', borderLeft: '3px solid #94A3B8' }}>
                  <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    Offline Cameras
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span data-testid="camera-overview-offline" style={{ fontSize: '24px', fontWeight: 700, color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.offline}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      Standby
                    </span>
                  </div>
                </div>

                <div className="netrava-card" style={{ padding: '14px 16px', borderLeft: '3px solid #F87171' }}>
                  <div style={{ fontSize: '11px', color: '#F87171', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    Error / Fault
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span data-testid="camera-overview-error" style={{ fontSize: '24px', fontWeight: 700, color: '#F87171', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.error}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      Triaged
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ================================================================
                SPLIT GRID: SECTION 5 (ACTIVE ALERTS) & SECTION 6 (WATCHLIST)
                ================================================================ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              {/* SECTION 5: ACTIVE ALERT CENTER */}
              <div data-testid="active-alert-center" className="netrava-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="netrava-card-header">
                  <div className="netrava-card-title">
                    <BellRing size={16} color="#F87171" />
                    <span>Active Alert Center</span>
                    <span
                      style={{
                        fontSize: '11px',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#F87171',
                        padding: '1px 7px',
                        borderRadius: 'var(--radius-xs)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {data.alerts.total_active} ACTIVE
                    </span>
                  </div>
                  <Link
                    href="/alerts"
                    className="btn-secondary"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      textDecoration: 'none',
                    }}
                  >
                    OPEN ALERT CONSOLE
                  </Link>
                </div>

                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '16px', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Critical:</span>
                    <StatusBadge label={`${data.alerts.critical}`} variant="critical" size="sm" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>High:</span>
                    <StatusBadge label={`${data.alerts.high}`} variant="warning" size="sm" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Medium:</span>
                    <StatusBadge label={`${data.alerts.medium}`} variant="info" size="sm" />
                  </div>
                </div>

                <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.alerts.recent.length === 0 ? (
                    <EmptyState
                      title="No Active Operational Alerts"
                      message="No critical, high, or medium priority alerts are currently awaiting operator triage."
                      icon={BellRing}
                    />
                  ) : (
                    data.alerts.recent.map((alert) => (
                      <div
                        key={alert.id}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: 'rgba(11, 16, 32, 0.7)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <StatusBadge label={alert.severity} status={alert.severity} size="sm" />
                            {alert.plate && alert.plate !== 'UNKNOWN' && (
                              <Link
                                href={`/vehicles/${encodeURIComponent(alert.plate)}`}
                                style={{
                                  fontSize: '12px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  color: '#60A5FA',
                                  textDecoration: 'none',
                                }}
                              >
                                {alert.plate}
                              </Link>
                            )}
                            <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                              {alert.category}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {alert.reason}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {alert.camera_name} • {alert.city} • {formatISTDateTime(alert.timestamp)}
                          </div>
                        </div>

                        <Link
                          href="/alerts"
                          className="btn-secondary"
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          OPEN ALERT
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* SECTION 6: WATCHLIST INTELLIGENCE */}
              <div data-testid="watchlist-intelligence" className="netrava-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="netrava-card-header">
                  <div className="netrava-card-title">
                    <ListFilter size={16} color="#60A5FA" />
                    <span>Watchlist Intelligence</span>
                    <span
                      style={{
                        fontSize: '11px',
                        backgroundColor: 'rgba(59, 130, 246, 0.12)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        color: '#93C5FD',
                        padding: '1px 7px',
                        borderRadius: 'var(--radius-xs)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {data.watchlists.active_entries} TARGETS
                    </span>
                  </div>
                  <Link
                    href="/watchlist"
                    className="btn-secondary"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      textDecoration: 'none',
                    }}
                  >
                    WATCHLIST CATALOG
                  </Link>
                </div>

                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '16px', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Catalogs:</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {data.watchlists.total_watchlists}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Monitored Plates:</span>
                    <span style={{ fontSize: '12px', color: '#60A5FA', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {data.watchlists.active_entries}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Recent Hits:</span>
                    <span style={{ fontSize: '12px', color: '#F87171', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {data.watchlists.recent_matches.length}
                    </span>
                  </div>
                </div>

                <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.watchlists.recent_matches.length === 0 ? (
                    <EmptyState
                      title="No Recent Watchlist Matches"
                      message="No plate matches against active stolen, flagged, or amber alerts occurred in the recent window."
                      icon={ListFilter}
                    />
                  ) : (
                    data.watchlists.recent_matches.map((match, idx) => (
                      <div
                        key={`${match.plate}-${idx}`}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: 'rgba(11, 16, 32, 0.7)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Link
                              href={`/vehicles/${encodeURIComponent(match.plate)}`}
                              style={{
                                fontSize: '13px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: '#60A5FA',
                                textDecoration: 'none',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {match.plate}
                            </Link>
                            <StatusBadge label={match.priority || 'CRITICAL'} status={match.priority} size="sm" />
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {match.category}
                            </span>
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {match.camera_name} • {match.city} • {formatISTDateTime(match.timestamp)}
                          </div>
                        </div>

                        <Link
                          href={`/vehicles/${encodeURIComponent(match.plate)}`}
                          className="btn-secondary"
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          INVESTIGATE
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ================================================================
                SPLIT GRID: SECTION 7 (VEHICLE SIGHTINGS) & SECTION 8 (JURISDICTION)
                ================================================================ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              {/* SECTION 7: VEHICLE INTELLIGENCE ACTIVITY (CCTV OBSERVATIONS) */}
              <div data-testid="recent-sightings-stream" className="netrava-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="netrava-card-header">
                  <div className="netrava-card-title">
                    <Car size={16} color="#60A5FA" />
                    <span>Recent CCTV Sightings</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      MULTI-FRAME CONSENSUS
                    </span>
                  </div>
                  <Link
                    href="/vehicles"
                    style={{ fontSize: '11px', color: '#60A5FA', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    Vehicle Command <ArrowRight size={11} />
                  </Link>
                </div>

                <div style={{ padding: '8px 16px', backgroundColor: 'rgba(0,0,0,0.15)', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Deterministic spatio-temporal CCTV observations. Does not represent continuous live tracking.
                </div>

                <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.sightings.recent_observations.length === 0 ? (
                    <EmptyState
                      title="No Recent Observations"
                      message="No vehicle sightings have been localized by the ANPR consensus worker recently."
                      icon={Car}
                    />
                  ) : (
                    data.sightings.recent_observations.map((sighting) => (
                      <div
                        key={sighting.id}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: 'rgba(11, 16, 32, 0.7)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Link
                              href={`/vehicles/${encodeURIComponent(sighting.plate)}`}
                              style={{
                                fontSize: '13px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: '#60A5FA',
                                textDecoration: 'none',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {sighting.plate}
                            </Link>
                            {sighting.is_watchlisted && (
                              <StatusBadge label="WATCHLIST HIT" variant="critical" size="sm" />
                            )}
                            <span
                              style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                color: sighting.confidence >= 0.9 ? '#34D399' : '#FBBF24',
                              }}
                            >
                              {Math.round(sighting.confidence * 100)}% CONF
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {sighting.camera_name} • {sighting.city}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {formatISTDateTime(sighting.timestamp)} • {sighting.consensus_frames} FRAMES CONSENSUS
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          {sighting.has_evidence && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                color: '#34D399',
                                backgroundColor: 'rgba(52, 211, 153, 0.1)',
                                border: '1px solid rgba(52, 211, 153, 0.25)',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-xs)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <FileCheck2 size={10} /> SHA-256
                            </span>
                          )}
                          <Link
                            href={`/vehicles/${encodeURIComponent(sighting.plate)}`}
                            className="btn-secondary"
                            style={{
                              padding: '2px 8px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              textDecoration: 'none',
                            }}
                          >
                            ROUTE
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* SECTION 8: JURISDICTION ACTIVITY */}
              <div data-testid="jurisdiction-activity" className="netrava-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="netrava-card-header">
                  <div className="netrava-card-title">
                    <MapPin size={16} color="#60A5FA" />
                    <span>Jurisdiction Activity (Gujarat Corridor)</span>
                  </div>
                  <Link
                    href="/map"
                    style={{ fontSize: '11px', color: '#60A5FA', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    Open GIS <ArrowRight size={11} />
                  </Link>
                </div>

                <div style={{ padding: '8px 16px', backgroundColor: 'rgba(0,0,0,0.15)', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Configured prototype camera networks across major Gujarat zones. Click jurisdiction to inspect.
                </div>

                <div style={{ padding: '12px 16px', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {data.jurisdictions.map((jur) => (
                    <Link
                      key={jur.id}
                      href={`/cameras?city=${encodeURIComponent(jur.name)}`}
                      className="netrava-card"
                      style={{
                        padding: '12px 14px',
                        textDecoration: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '8px',
                        backgroundColor: 'rgba(11, 16, 32, 0.75)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.45)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.02em' }}>
                          {jur.name}
                        </span>
                        <span style={{ fontSize: '10px', color: '#60A5FA', fontFamily: 'var(--font-mono)' }}>
                          {jur.code}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
                        <div>
                          <div style={{ color: 'var(--text-dim)', fontSize: '10px' }}>CAMERAS</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: jur.online_cameras > 0 ? '#34D399' : 'var(--text-secondary)' }}>
                            {jur.online_cameras} / {jur.total_cameras}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: 'var(--text-dim)', fontSize: '10px' }}>ALERTS</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: jur.active_alerts > 0 ? '#F87171' : 'var(--text-secondary)' }}>
                            {jur.active_alerts}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: 'var(--text-dim)', fontSize: '10px' }}>SIGHTINGS</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: jur.recent_sightings > 0 ? '#60A5FA' : 'var(--text-secondary)' }}>
                            {jur.recent_sightings}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: 'var(--text-dim)', fontSize: '10px' }}>STATUS</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: jur.online_cameras > 0 ? '#34D399' : '#94A3B8' }}>
                            {jur.online_cameras > 0 ? 'ACTIVE' : 'STANDBY'}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* ================================================================
                SECTION 9: RECENT INVESTIGATION ACTIVITY (AUDIT LOGS)
                ================================================================ */}
            {hasRoleAccess(user?.role, ['SUPER_ADMIN', 'SYSTEM_AUDITOR', 'INVESTIGATOR', 'DEPARTMENT_ADMIN']) && (
              <div data-testid="recent-investigations" className="netrava-card">
                <div className="netrava-card-header">
                  <div className="netrava-card-title">
                    <ShieldAlert size={16} color="#FBBF24" />
                    <span>Recent Investigation & Audit Activity</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      TAMPER-EVIDENT LEDGER
                    </span>
                  </div>
                  {hasRoleAccess(user?.role, ['SUPER_ADMIN', 'SYSTEM_AUDITOR']) && (
                    <Link
                      href="/audit"
                      className="btn-secondary"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        textDecoration: 'none',
                      }}
                    >
                      FULL AUDIT TRAIL
                    </Link>
                  )}
                </div>

                <div style={{ padding: '12px 16px' }}>
                  {data.investigations.recent_events.length === 0 ? (
                    <EmptyState
                      title="No Recent Investigation Events"
                      message="No officer investigation or evidence triage actions have been recorded in the audit trail."
                      icon={ShieldAlert}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {data.investigations.recent_events.map((evt) => (
                        <div
                          key={evt.id}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: 'rgba(11, 16, 32, 0.5)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-xs)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', minWidth: '120px' }}>
                              {formatISTDateTime(evt.timestamp)}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-xs)',
                                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                color: '#93C5FD',
                                border: '1px solid rgba(59, 130, 246, 0.25)',
                              }}
                            >
                              {evt.action}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                              {evt.actor_email}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                              ({evt.actor_role})
                            </span>
                          </div>

                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {evt.resource} {evt.target ? `• ${evt.target}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================================================================
                GOVERNMENT-GRADE PROTOTYPE & LEGAL ADMISSIBILITY DISCLAIMER
                (Section 15, 16 & Phase 8.1 Claim Discipline)
                ================================================================ */}
            <div
              className="netrava-card"
              style={{
                padding: '12px 18px',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                border: '1px solid var(--border-medium)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <Shield size={16} color="#60A5FA" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>PROTOTYPE DEMONSTRATION ENVIRONMENT: </strong>
                All camera streams, vehicle sightings, and alert telemetry displayed in this command center represent configured prototype and research demonstration datasets. NETRAVAHA enforces cryptographic SHA-256 evidence integrity and multi-frame consensus within an authorized production ingestion boundary. Admissibility of digital evidence in court remains subject to independent procedural verification by competent judicial authorities.
              </div>
            </div>
          </>
        )}

      </div>
    </AppShell>
  );
}
