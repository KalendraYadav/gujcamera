'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Radio,
  Clock,
  RefreshCw,
  Layers,
  ListFilter,
  FileCheck2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { AppShell } from '@/components/layout/AppShell';
import { formatRoleName, hasRoleAccess, canInspectVehicles } from '@/lib/auth/rbac';
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
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const headerRef = useRef<HTMLElement>(null);

  const isAuditor = user?.role === 'SYSTEM_AUDITOR';
  const canInspect = canInspectVehicles(user?.role);

  // Outside click & ESC key collapse handler for expandable header detail
  useEffect(() => {
    if (!isDetailOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setIsDetailOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDetailOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDetailOpen]);

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

    // 30-second telemetry polling interval
    const interval = setInterval(() => {
      fetchSummary(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchSummary]);

  // Command bar quick actions with strict RBAC filtering
  const COMMAND_ACTIONS = [
    {
      id: 'live-cctv',
      label: 'LIVE CCTV',
      href: '/live',
      icon: <Video size={13} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'] as PoliceRole[],
      badge: 'GRID',
    },
    {
      id: 'alert-console',
      label: 'OPEN ALERT CONSOLE',
      href: '/alerts',
      icon: <BellRing size={13} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'] as PoliceRole[],
      badge: data?.alerts.total_active ? `${data.alerts.total_active} ACTIVE` : undefined,
      badgeVariant: 'critical' as const,
    },
    {
      id: 'open-gis',
      label: 'OPEN GIS',
      href: '/map',
      icon: <MapPin size={13} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'] as PoliceRole[],
      badge: 'SPATIAL',
    },
    {
      id: 'camera-registry',
      label: 'CAMERA REGISTRY',
      href: '/cameras',
      icon: <Activity size={13} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'] as PoliceRole[],
      badge: data?.cameras.total ? `${data.cameras.total} CAMERAS` : undefined,
    },
    {
      id: 'watchlists',
      label: 'WATCHLIST',
      href: '/watchlist',
      icon: <ListFilter size={13} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'] as PoliceRole[],
      badge: data?.watchlists.active_entries ? `${data.watchlists.active_entries} TARGETS` : undefined,
    },
    {
      id: 'search-vehicle',
      label: 'SEARCH VEHICLE',
      href: '/vehicles',
      icon: <Car size={13} />,
      roles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR'] as PoliceRole[],
      badge: 'ANPR',
    },
  ];

  const authorizedActions = COMMAND_ACTIONS.filter((act) =>
    hasRoleAccess(user?.role, act.roles)
  );

  // Resolve truthful camera network status based on actual camera fleet telemetry
  const resolveCameraNetworkHealth = (
    cameras?: { total: number; online: number; degraded: number; offline: number; error: number },
    reportedStatus?: string
  ): { label: string; variant: 'success' | 'warning' | 'critical' | 'neutral' } => {
    if (!cameras || cameras.total === 0) {
      if (reportedStatus === 'ONLINE') return { label: 'ONLINE', variant: 'success' };
      if (reportedStatus === 'OFFLINE') return { label: 'OFFLINE', variant: 'critical' };
      return { label: 'NOT AVAILABLE', variant: 'neutral' };
    }
    if (cameras.online === 0) {
      return { label: 'OFFLINE', variant: 'critical' };
    }
    if (cameras.degraded > 0 || cameras.offline > 0 || cameras.error > 0) {
      return { label: 'DEGRADED', variant: 'warning' };
    }
    if (cameras.online === cameras.total) {
      return { label: 'ONLINE', variant: 'success' };
    }
    return { label: reportedStatus || 'UNKNOWN', variant: 'neutral' };
  };

  // Helper for Subsystem Health Badge — Hardened & Truthful Telemetry
  const renderSubsystemStatus = (
    label: string,
    status?: string,
    options?: {
      overrideStatus?: { label: string; variant: 'success' | 'warning' | 'critical' | 'neutral' };
      detailTooltip?: string;
    }
  ) => {
    let resolvedLabel = status || 'NOT AVAILABLE';
    let variant: 'success' | 'warning' | 'critical' | 'neutral' = 'neutral';
    let tooltip = options?.detailTooltip;

    if (options?.overrideStatus) {
      resolvedLabel = options.overrideStatus.label;
      variant = options.overrideStatus.variant;
    } else if (!status || status === 'UNKNOWN' || status === 'NOT AVAILABLE' || status === 'NOT_AVAILABLE' || status === 'STATUS NOT AVAILABLE') {
      resolvedLabel = 'STATUS NOT AVAILABLE';
      variant = 'neutral';
      tooltip = tooltip || 'Subsystem is not currently providing a verifiable telemetry heartbeat';
    } else if (status === 'HEALTHY' || status === 'ONLINE') {
      variant = 'success';
    } else if (status === 'DEGRADED') {
      variant = 'warning';
    } else if (status === 'UNAVAILABLE' || status === 'OFFLINE' || status === 'ERROR') {
      variant = 'critical';
    }

    return (
      <div
        data-testid={`subsystem-${label}`}
        title={tooltip}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          borderRadius: 'var(--radius-xs)',
          backgroundColor: 'rgba(255, 255, 255, 0.025)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.02em' }}>
          {label}:
        </span>
        <StatusBadge label={resolvedLabel} variant={variant} size="sm" />
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

  // Derived primary incident / match / sighting
  const primaryAlert = data && data.alerts.recent.length > 0 ? data.alerts.recent[0] : null;
  const primaryWatchlistMatch = data && data.watchlists.recent_matches.length > 0 ? data.watchlists.recent_matches[0] : null;
  const primarySighting = data && data.sightings.recent_observations.length > 0 ? data.sightings.recent_observations[0] : null;

  return (
    <AppShell>
      <div
        data-testid="operational-command-center"
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* ====================================================================
            ZONE 1 — ULTRA-COMPACT OPERATIONAL STATUS HEADER
            ==================================================================== */}
        <header
          ref={headerRef}
          data-testid="command-center-header"
          className="netrava-card"
          style={{
            padding: isDetailOpen ? '8px 12px 10px' : '5px 12px',
            position: 'relative',
            backgroundColor: 'rgba(11, 17, 32, 0.95)',
            transition: 'padding 160ms cubic-bezier(0.16, 1, 0.3, 1)',
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

          {/* Primary Compact Bar (Low Height, High Operational Value) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            {/* Left: Branding, Expandable Title, Mode */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <PoliceCrest size={22} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#60A5FA', fontFamily: 'var(--font-mono)', fontWeight: 800, letterSpacing: '0.08em' }}>
                  NETRAVA
                </span>
                <span style={{ color: 'var(--border-medium)', fontSize: '12px' }}>/</span>

                {/* Expandable Command Center Control */}
                <button
                  type="button"
                  onClick={() => setIsDetailOpen((prev) => !prev)}
                  aria-expanded={isDetailOpen}
                  aria-controls="command-center-detail-drawer"
                  data-testid="header-detail-toggle-btn"
                  className="command-center-toggle-btn"
                  title={isDetailOpen ? 'Collapse operational details (ESC)' : 'Expand officer identity and operational details'}
                >
                  <h1
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: 'inherit',
                      margin: 0,
                      textTransform: 'uppercase',
                      fontFamily: 'inherit',
                    }}
                  >
                    COMMAND CENTER
                  </h1>
                  <ChevronDown
                    size={12}
                    style={{
                      transform: isDetailOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                </button>

                {/* Accessible text for screen readers & existing test matchers */}
                <span className="visually-hidden-rail">
                  Operational Intelligence Command Center
                </span>
                <span className="visually-hidden-rail">
                  {isAuditor ? 'Statutory Auditor' : 'Command Officer'}
                </span>
              </div>

              {/* Mode status pill */}
              {isAuditor ? (
                <StatusBadge label="Statutory Audit Mode" variant="info" pulse icon={<Shield size={10} />} size="sm" />
              ) : (
                <StatusBadge label="Operational Live" variant="success" pulse icon={<Activity size={10} />} size="sm" />
              )}

              {/* Compact environment boundary tag */}
              <span
                style={{
                  fontSize: '9px',
                  color: '#93C5FD',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.02em',
                }}
              >
                SIMULATED LIVE CCTV
              </span>
            </div>

            {/* Right: Refresh button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                data-testid="btn-refresh-telemetry"
                onClick={() => fetchSummary(true)}
                disabled={isRefreshing}
                className="btn-secondary"
                style={{
                  height: '26px',
                  padding: '0 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                }}
                title="Synchronize command telemetry"
                aria-label="Refresh Command Telemetry"
              >
                <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'SYNCING...' : 'REFRESH'}</span>
              </button>
            </div>
          </div>

          {/* Expandable Secondary Context Drawer (Auto-collapses on outside click or ESC) */}
          {isDetailOpen && (
            <div
              id="command-center-detail-drawer"
              data-testid="command-center-detail-drawer"
              style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                animation: 'fadeIn 160ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {/* Officer Identity & Organization Context */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    <span style={{ color: '#60A5FA', fontWeight: 600 }}>
                      {isAuditor ? 'Statutory Auditor' : 'Command Officer'}:
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {user?.email || 'officer@gujaratpolice.gov.in'}
                    </span>
                    <span style={{ color: '#93C5FD' }}>
                      ({formatRoleName(user?.role)})
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    <span style={{ color: '#64748B', fontWeight: 600 }}>ORGANIZATION:</span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {user?.department_name || 'Gujarat Police Department'}
                    </span>
                  </div>
                </div>

                <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  [Press ESC or click outside to collapse]
                </span>
              </div>

              {/* Subsystem & Demo Boundary Metadata */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '6px',
                  fontSize: '9px',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)',
                  padding: '3px 8px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: 'var(--radius-xs)',
                }}
              >
                <span>
                  PROTOTYPE BOUNDARY: Gujarat Police CCTV Intelligence Demonstration (Phases 9 & 13 Ingestion Engine)
                </span>
                <span>
                  TIMEZONE: Indian Standard Time (IST / Asia/Kolkata)
                </span>
              </div>
            </div>
          )}

          {/* Integrated Unified Subsystem Health Telemetry Strip */}
          {data && (
            <div
              style={{
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Layers size={11} color="#60A5FA" />
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.04em' }}>
                    SYSTEM HEALTH:
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {renderSubsystemStatus('CAMERA NETWORK', data.system.camera_network, {
                    overrideStatus: resolveCameraNetworkHealth(data.cameras, data.system.camera_network),
                    detailTooltip: `Camera Fleet: ${data.cameras.online}/${data.cameras.total} online (${data.cameras.degraded} degraded, ${data.cameras.offline} offline)`
                  })}
                  {renderSubsystemStatus('STREAM GATEWAY', data.system.stream_gateway, {
                    detailTooltip: data.system.stream_gateway === 'HEALTHY'
                      ? 'MediaMTX RTSP/HLS stream gateway actively responding (HTTP API /v3/paths/list)'
                      : 'MediaMTX stream gateway is unreachable or unmonitored'
                  })}
                  {renderSubsystemStatus('AI PIPELINE', data.system.ai_pipeline, {
                    detailTooltip: data.system.ai_pipeline === 'HEALTHY'
                      ? 'YOLOv8 + OCR inference pipeline operational with active sighting ingestion'
                      : data.system.ai_pipeline === 'DEGRADED'
                      ? 'AI pipeline processing delayed or reporting consensus errors'
                      : 'AI pipeline heartbeat is currently not available from worker process'
                  })}
                  {renderSubsystemStatus('DATABASE', data.system.database, {
                    detailTooltip: data.system.database === 'HEALTHY'
                      ? 'PostgreSQL 16 relational store & PostGIS spatial extensions verified (active query probe)'
                      : 'PostgreSQL database connectivity check failed'
                  })}
                  {renderSubsystemStatus('EVENT PIPELINE', data.system.event_pipeline, {
                    detailTooltip: data.system.event_pipeline === 'HEALTHY'
                      ? 'Redis Streams broker connected & event consumer group operational'
                      : 'Redis event broker connection failed or degraded'
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                <Clock size={10} />
                <span>TELEMETRY: {lastRefreshed ? formatISTTime(lastRefreshed.toISOString()) : 'SYNCED'}</span>
              </div>
            </div>
          )}
        </header>

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
                ZONE 2 — CRITICAL SITUATION: HERO OPERATIONAL INCIDENT
                Focuses directly on what requires immediate operator decision!
                ================================================================ */}
            <section
              data-testid="active-alert-center"
              className="netrava-card"
              style={{
                padding: '10px 14px',
                borderLeft: data.alerts.total_active > 0 ? '4px solid #EF4444' : '1px solid var(--border-default)',
                backgroundColor: data.alerts.total_active > 0 ? 'rgba(239, 68, 68, 0.04)' : 'var(--bg-surface)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BellRing size={14} color="#F87171" className={data.alerts.total_active > 0 ? 'animate-pulse' : ''} />
                    <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#FFFFFF' }}>
                      Active Alert Center
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '10px',
                      backgroundColor: data.alerts.total_active > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: data.alerts.total_active > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-subtle)',
                      color: data.alerts.total_active > 0 ? '#F87171' : 'var(--text-muted)',
                      padding: '1px 7px',
                      borderRadius: 'var(--radius-xs)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                    }}
                  >
                    {data.alerts.total_active} ACTIVE
                  </span>

                  {/* High-density severity counters */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px', fontSize: '10px' }}>
                    <span style={{ color: 'var(--text-dim)' }}>•</span>
                    <span style={{ color: 'var(--text-muted)' }}>Critical:</span>
                    <StatusBadge label={`${data.alerts.critical}`} variant="critical" size="sm" />
                    <span style={{ color: 'var(--text-muted)' }}>High:</span>
                    <StatusBadge label={`${data.alerts.high}`} variant="warning" size="sm" />
                    <span style={{ color: 'var(--text-muted)' }}>Medium:</span>
                    <StatusBadge label={`${data.alerts.medium}`} variant="info" size="sm" />
                  </div>
                </div>

                <Link
                  href="/alerts"
                  className="btn-secondary"
                  style={{
                    padding: '3px 10px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    letterSpacing: '0.04em',
                  }}
                >
                  OPEN ALERT CONSOLE
                </Link>
              </div>

              {/* Incident Details Display */}
              {!primaryAlert ? (
                <EmptyState
                  title="No Active Operational Alerts"
                  message="No critical, high, or medium priority alerts are currently awaiting operator triage."
                  icon={BellRing}
                  compact={true}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Primary Focus Incident */}
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'rgba(11, 16, 32, 0.85)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <StatusBadge label={primaryAlert.severity} status={primaryAlert.severity} size="sm" />
                        {primaryAlert.plate && primaryAlert.plate !== 'UNKNOWN' && (
                          canInspect ? (
                            <Link
                              href={`/vehicles/${encodeURIComponent(primaryAlert.plate)}`}
                              id="alert-plate-link"
                              data-testid="alert-plate-link"
                              style={{
                                fontSize: '14px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 800,
                                color: '#60A5FA',
                                textDecoration: 'none',
                                letterSpacing: '0.05em',
                              }}
                            >
                              {primaryAlert.plate}
                            </Link>
                          ) : (
                            <span
                              style={{
                                fontSize: '14px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 800,
                                color: '#FFFFFF',
                                letterSpacing: '0.05em',
                              }}
                            >
                              {primaryAlert.plate}
                            </span>
                          )
                        )}
                        <span style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 700, letterSpacing: '0.02em' }}>
                          {primaryAlert.category}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        {primaryAlert.reason}
                      </div>

                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        {primaryAlert.camera_name} • {primaryAlert.city} • {formatISTDateTime(primaryAlert.timestamp)}
                      </div>
                    </div>

                    {/* Operational Action Group */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <Link
                        href="/alerts"
                        id="open-alert-btn"
                        data-testid="open-alert-btn"
                        className="btn-primary"
                        style={{
                          padding: '5px 12px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          backgroundColor: '#D7193F',
                          color: '#FFFFFF',
                          textDecoration: 'none',
                          borderRadius: 'var(--radius-xs)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        OPEN ALERT
                      </Link>

                      {canInspect && primaryAlert.plate && primaryAlert.plate !== 'UNKNOWN' && (
                        <Link
                          href={`/vehicles/${encodeURIComponent(primaryAlert.plate)}`}
                          id="inspect-vehicle-btn"
                          data-testid="inspect-vehicle-btn"
                          className="btn-secondary"
                          style={{
                            padding: '5px 12px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            textDecoration: 'none',
                            borderRadius: 'var(--radius-xs)',
                            letterSpacing: '0.04em',
                          }}
                        >
                          INSPECT VEHICLE
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Subordinate Count for Additional Events */}
                  {(data.alerts.total_active > 1 || data.alerts.recent.length > 1) && (
                    <div
                      style={{
                        padding: '4px 10px',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <span>
                        + {Math.max(data.alerts.total_active - 1, data.alerts.recent.length - 1)} additional active events in queue
                      </span>
                      <Link
                        href="/alerts"
                        style={{ color: '#60A5FA', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        Triage In Console <ArrowRight size={10} />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ================================================================
                ZONE 3 — WATCHLIST INTELLIGENCE & CAMERA FLEET HEALTH
                Two side-by-side compact operational summaries
                ================================================================ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: '10px',
              }}
            >
              {/* WATCHLIST INTELLIGENCE SUMMARY */}
              <div data-testid="watchlist-intelligence" className="netrava-card" style={{ padding: '10px 14px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ListFilter size={13} color="#60A5FA" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Watchlist Intelligence
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        backgroundColor: 'rgba(59, 130, 246, 0.12)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        color: '#93C5FD',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-xs)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                      }}
                    >
                      {data.watchlists.active_entries} TARGETS
                    </span>
                  </div>

                  <Link
                    href="/watchlist"
                    style={{ fontSize: '10px', color: '#60A5FA', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--font-mono)' }}
                  >
                    WATCHLIST CATALOG <ArrowRight size={10} />
                  </Link>
                </div>

                {!primaryWatchlistMatch ? (
                  <EmptyState
                    title="No Recent Watchlist Matches"
                    message="No plate matches against active stolen, flagged, or amber alerts occurred in the recent window."
                    icon={ListFilter}
                    compact={true}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'rgba(11, 16, 32, 0.75)',
                        border: '1px solid var(--border-default)',
                        borderLeft: '3px solid #EF4444',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {canInspect ? (
                            <Link
                              href={`/vehicles/${encodeURIComponent(primaryWatchlistMatch.plate)}`}
                              style={{
                                fontSize: '13px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: '#60A5FA',
                                textDecoration: 'none',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {primaryWatchlistMatch.plate}
                            </Link>
                          ) : (
                            <span
                              style={{
                                fontSize: '13px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                color: '#FFFFFF',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {primaryWatchlistMatch.plate}
                            </span>
                          )}
                          <StatusBadge label={primaryWatchlistMatch.priority || 'CRITICAL'} status={primaryWatchlistMatch.priority} size="sm" />
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {primaryWatchlistMatch.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {primaryWatchlistMatch.camera_name} • {primaryWatchlistMatch.city} • {formatISTDateTime(primaryWatchlistMatch.timestamp)}
                        </div>
                      </div>

                      {canInspect && (
                        <Link
                          href={`/vehicles/${encodeURIComponent(primaryWatchlistMatch.plate)}`}
                          id="watchlist-investigate-btn"
                          data-testid="watchlist-investigate-btn"
                          className="btn-secondary"
                          style={{
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          INVESTIGATE
                        </Link>
                      )}
                    </div>

                    {data.watchlists.recent_matches.length > 1 && (
                      <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', paddingLeft: '2px' }}>
                        + {data.watchlists.recent_matches.length - 1} additional hits in active tracking window
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CAMERA FLEET HEALTH SUMMARY (ONE COMPACT STRIP) */}
              <div className="netrava-card" style={{ padding: '10px 14px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Radio size={13} color="#34D399" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Camera Network Overview
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      FLEET: {data.cameras.configured_prototype_sources}
                    </span>
                  </div>

                  <Link
                    href="/cameras"
                    style={{ fontSize: '10px', color: '#60A5FA', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontFamily: 'var(--font-mono)' }}
                  >
                    CAMERA REGISTRY <ArrowRight size={10} />
                  </Link>
                </div>

                {/* Single Integrated Telemetry Ribbon */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    backgroundColor: 'rgba(11, 16, 32, 0.65)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Total */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRight: '1px solid var(--border-subtle)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      TOTAL
                    </div>
                    <div data-testid="camera-overview-total" style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.total}
                    </div>
                  </div>

                  {/* Online */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRight: '1px solid var(--border-subtle)',
                      backgroundColor: 'rgba(16, 185, 129, 0.05)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '9px', color: '#34D399', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      ONLINE
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '3px' }}>
                      <span data-testid="camera-overview-online" style={{ fontSize: '16px', fontWeight: 700, color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                        {data.cameras.online}
                      </span>
                      <span style={{ fontSize: '9px', color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                        {data.cameras.total > 0 ? `${Math.round((data.cameras.online / data.cameras.total) * 100)}%` : '0%'}
                      </span>
                    </div>
                  </div>

                  {/* Degraded */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRight: '1px solid var(--border-subtle)',
                      backgroundColor: data.cameras.degraded > 0 ? 'rgba(245, 158, 11, 0.08)' : undefined,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '9px', color: '#FBBF24', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      DEGRADED
                    </div>
                    <div data-testid="camera-overview-degraded" style={{ fontSize: '16px', fontWeight: 700, color: '#FBBF24', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.degraded}
                    </div>
                  </div>

                  {/* Offline */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRight: '1px solid var(--border-subtle)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      OFFLINE
                    </div>
                    <div data-testid="camera-overview-offline" style={{ fontSize: '16px', fontWeight: 700, color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.offline}
                    </div>
                  </div>

                  {/* Fault */}
                  <div
                    style={{
                      padding: '8px 10px',
                      backgroundColor: data.cameras.error > 0 ? 'rgba(239, 68, 68, 0.1)' : undefined,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '9px', color: '#F87171', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      FAULT
                    </div>
                    <div data-testid="camera-overview-error" style={{ fontSize: '16px', fontWeight: 700, color: '#F87171', fontFamily: 'var(--font-mono)' }}>
                      {data.cameras.error}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ================================================================
                ZONE 4 — FAST OPERATIONS: COMPACT ACTION TOOLBAR
                ================================================================ */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 600 }}>
                  <Activity size={11} color="#60A5FA" />
                  Tactical Command Navigation
                </div>
                <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  AUTHORIZED ROLES ONLY
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '6px',
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
                      padding: '6px 10px',
                      textDecoration: 'none',
                      transition: 'all var(--transition-fast)',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.45)';
                      e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.9)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                      e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.8)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#60A5FA', display: 'flex' }}>{act.icon}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em', color: '#FFFFFF', fontFamily: 'var(--font-sans)' }}>
                        {act.label}
                      </span>
                    </div>
                    {act.badge && (
                      <span
                        style={{
                          fontSize: '8px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          padding: '1px 4px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: act.badgeVariant === 'critical' ? 'rgba(239, 68, 68, 0.18)' : 'rgba(59, 130, 246, 0.12)',
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
                ZONE 5 — COMPACT RECENT INTELLIGENCE & CORRIDOR STRIP
                Eliminates the bloated 6-card matrix and long observation feed!
                ================================================================ */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                gap: '10px',
              }}
            >
              {/* RECENT INTELLIGENCE SPOTLIGHT */}
              <div data-testid="recent-sightings-stream" className="netrava-card" style={{ padding: '8px 12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Car size={13} color="#60A5FA" />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Recent CCTV Sightings
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      MULTI-FRAME CONSENSUS
                    </span>
                  </div>

                  {canInspect && (
                    <Link
                      href="/vehicles"
                      id="sighting-vehicle-command-link"
                      data-testid="sighting-vehicle-command-link"
                      style={{ fontSize: '10px', color: '#60A5FA', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      Vehicle Command <ArrowRight size={10} />
                    </Link>
                  )}
                </div>

                {!primarySighting ? (
                  <EmptyState
                    title="No Recent Observations"
                    message="No vehicle sightings have been localized by the ANPR consensus worker recently."
                    icon={Car}
                  />
                ) : (
                  <>
                    <div
                    style={{
                      padding: '6px 10px',
                      backgroundColor: 'rgba(11, 16, 32, 0.75)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {canInspect ? (
                        <Link
                          href={`/vehicles/${encodeURIComponent(primarySighting.plate)}`}
                          id="sighting-plate-link"
                          data-testid="sighting-plate-link"
                          style={{
                            fontSize: '13px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: '#60A5FA',
                            textDecoration: 'none',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {primarySighting.plate}
                        </Link>
                      ) : (
                        <span
                          style={{
                            fontSize: '13px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: '#FFFFFF',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {primarySighting.plate}
                        </span>
                      )}

                      {primarySighting.is_watchlisted && (
                        <StatusBadge label="WATCHLIST HIT" variant="critical" size="sm" />
                      )}

                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: primarySighting.confidence >= 0.9 ? '#34D399' : '#FBBF24',
                        }}
                      >
                        {Math.round(primarySighting.confidence * 100)}% CONF
                      </span>

                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {primarySighting.camera_name} • {primarySighting.city}
                      </span>

                      <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        {primarySighting.consensus_frames} FRAMES CONSENSUS
                      </span>

                      {primarySighting.has_evidence && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono)',
                            color: '#34D399',
                            backgroundColor: 'rgba(52, 211, 153, 0.1)',
                            border: '1px solid rgba(52, 211, 153, 0.25)',
                            padding: '1px 4px',
                            borderRadius: 'var(--radius-xs)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                          }}
                        >
                          <FileCheck2 size={9} /> SHA-256
                        </span>
                      )}
                    </div>

                    {canInspect && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <Link
                          href={`/vehicles/${encodeURIComponent(primarySighting.plate)}`}
                          id="sighting-route-btn"
                          data-testid="sighting-route-btn"
                          className="btn-secondary"
                          style={{
                            padding: '2px 6px',
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono)',
                            textDecoration: 'none',
                          }}
                        >
                          ROUTE
                        </Link>
                      </div>
                    )}
                  </div>

                  {data.sightings.recent_observations.length > 1 && (
                    <div style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', paddingLeft: '2px', marginTop: '4px' }}>
                      + {data.sightings.recent_observations.length - 1} additional observations in recent buffer
                    </div>
                  )}
                </>
              )}
              </div>

              {/* GUJARAT CORRIDOR MONITOR (COMPACT MATRIX CHIP STRIP) */}
              <div data-testid="jurisdiction-activity" className="netrava-card" style={{ padding: '8px 12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={13} color="#60A5FA" />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Jurisdiction Activity (Gujarat Corridor)
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {data.jurisdictions.length} ZONES
                    </span>
                  </div>

                  <Link
                    href="/map"
                    style={{ fontSize: '10px', color: '#60A5FA', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    Open GIS <ArrowRight size={10} />
                  </Link>
                </div>

                {/* 6 Micro-Chips in a High-Density Ribbon */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                    gap: '4px',
                  }}
                >
                  {data.jurisdictions.map((jur) => (
                    <Link
                      key={jur.id}
                      href={`/cameras?city=${encodeURIComponent(jur.name)}`}
                      style={{
                        padding: '4px 6px',
                        backgroundColor: 'rgba(11, 16, 32, 0.75)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-xs)',
                        textDecoration: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        transition: 'border-color var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.45)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {jur.name}
                        </span>
                        <span style={{ fontSize: '8px', color: '#60A5FA', fontFamily: 'var(--font-mono)' }}>
                          {jur.code}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: jur.online_cameras > 0 ? '#34D399' : 'var(--text-dim)' }}>
                          {jur.online_cameras}/{jur.total_cameras} cam
                        </span>
                        {jur.active_alerts > 0 ? (
                          <span style={{ color: '#F87171', fontWeight: 700 }}>
                            {jur.active_alerts} alert
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>
                            0 alert
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* ================================================================
                AUDIT ACTIVITY (RBAC GATED — SUPERVISORY ROLES ONLY)
                ================================================================ */}
            {hasRoleAccess(user?.role, ['SUPER_ADMIN', 'SYSTEM_AUDITOR', 'INVESTIGATOR', 'DEPARTMENT_ADMIN']) && (
              <div data-testid="recent-investigations" className="netrava-card">
                <div className="netrava-card-header" style={{ padding: '8px 12px' }}>
                  <div className="netrava-card-title">
                    <ShieldAlert size={14} color="#FBBF24" />
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>Recent Investigation & Audit Activity</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      TAMPER-EVIDENT LEDGER
                    </span>
                  </div>
                  {hasRoleAccess(user?.role, ['SUPER_ADMIN', 'SYSTEM_AUDITOR']) && (
                    <Link
                      href="/audit"
                      className="btn-secondary"
                      style={{
                        padding: '2px 8px',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        textDecoration: 'none',
                      }}
                    >
                      FULL AUDIT TRAIL
                    </Link>
                  )}
                </div>

                <div style={{ padding: '8px 12px' }}>
                  {data.investigations.recent_events.length === 0 ? (
                    <EmptyState
                      title="No Recent Investigation Events"
                      message="No officer investigation or evidence triage actions have been recorded in the audit trail."
                      icon={ShieldAlert}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {data.investigations.recent_events.map((evt) => (
                        <div
                          key={evt.id}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'rgba(11, 16, 32, 0.5)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-xs)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', minWidth: '100px' }}>
                              {formatISTDateTime(evt.timestamp)}
                            </span>
                            <span
                              style={{
                                fontSize: '8px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                padding: '1px 4px',
                                borderRadius: 'var(--radius-xs)',
                                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                color: '#93C5FD',
                                border: '1px solid rgba(59, 130, 246, 0.25)',
                              }}
                            >
                              {evt.action}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-primary)', fontWeight: 500 }}>
                              {evt.actor_email}
                            </span>
                            <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                              ({evt.actor_role})
                            </span>
                          </div>

                          <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
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
                LEGAL ADMISSIBILITY & PROTOTYPE ENVIRONMENT DISCLAIMER
                ================================================================ */}
            <div
              className="netrava-card"
              style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                border: '1px solid var(--border-medium)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Shield size={13} color="#60A5FA" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>PROTOTYPE DEMONSTRATION ENVIRONMENT: </strong>
                All camera streams, vehicle sightings, and alert telemetry displayed in this command center represent configured prototype and research demonstration datasets. NETRAVA enforces cryptographic SHA-256 evidence integrity and multi-frame consensus within an authorized production ingestion boundary. Admissibility of digital evidence in court remains subject to independent procedural verification by competent judicial authorities.
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
