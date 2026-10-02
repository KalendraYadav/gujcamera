'use client';

import React from 'react';
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
  TrendingUp,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { AppShell } from '@/components/layout/AppShell';
import { formatRoleName, hasRoleAccess } from '@/lib/auth/rbac';
import { PoliceRole } from '@/types/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PoliceCrest } from '@/components/auth/PoliceCrest';

export default function CommandCenterPage() {
  const { user } = useAuth();
  const isAuditor = user?.role === 'SYSTEM_AUDITOR';

  const KPI_METRICS = [
    {
      id: 'streams',
      label: 'Live Streams',
      value: '48 / 52',
      trend: '92.3% Online',
      trendVariant: 'success' as const,
      icon: <Video size={18} color="#34D399" />,
    },
    {
      id: 'anpr',
      label: 'ANPR Detections',
      value: '14,892',
      trend: '+12.4% (24h)',
      trendVariant: 'info' as const,
      icon: <Car size={18} color="#60A5FA" />,
    },
    {
      id: 'hits',
      label: 'Watchlist Hits',
      value: '3',
      trend: 'Pending Triage',
      trendVariant: 'critical' as const,
      icon: <BellRing size={18} color="#F87171" />,
    },
    {
      id: 'latency',
      label: 'Gateway Latency',
      value: '42 ms',
      trend: 'Optimal',
      trendVariant: 'success' as const,
      icon: <Activity size={18} color="#34D399" />,
    },
  ];

  const QUICK_LAUNCH_ITEMS = [
    {
      id: 'live',
      label: 'Live Video Monitoring',
      href: '/live',
      description: 'Multi-grid surveillance streams with live AI tracking.',
      icon: <Video size={18} color="#60A5FA" />,
      badge: 'Operational',
      badgeVariant: 'success' as const,
      allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'] as PoliceRole[],
    },
    {
      id: 'map',
      label: 'GIS Camera Command Map',
      href: '/map',
      description: 'Live camera locations, spatial clusters, and feed access.',
      icon: <MapPin size={18} color="#60A5FA" />,
      badge: isAuditor ? 'Read-Only' : 'Active',
      badgeVariant: 'success' as const,
      allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'] as PoliceRole[],
    },
    {
      id: 'cameras',
      label: 'CCTV Camera Registry',
      href: '/cameras',
      description: 'Camera inventory, health telemetry, and stream status.',
      icon: <Activity size={18} color="#34D399" />,
      badge: isAuditor ? 'Inventory' : 'Online',
      badgeVariant: 'success' as const,
      allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'] as PoliceRole[],
    },
    {
      id: 'alerts',
      label: 'Real-Time Alert Feed',
      href: '/alerts',
      description: 'Active alerts, speed violations, and incident triage.',
      icon: <BellRing size={18} color="#F87171" />,
      badge: 'Live',
      badgeVariant: 'critical' as const,
      allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'] as PoliceRole[],
    },
    {
      id: 'vehicles',
      label: 'Vehicle Investigation',
      href: '/vehicles',
      description: 'Plate tracking, sightings timeline, and route journeys.',
      icon: <Car size={18} color="#60A5FA" />,
      badge: 'ANPR Active',
      badgeVariant: 'info' as const,
      allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR'] as PoliceRole[],
    },
    {
      id: 'audit',
      label: 'System Audit Trail',
      href: '/audit',
      description: 'Immutable ledger of officer actions, triage, and evidence access.',
      icon: <ShieldAlert size={18} color="#FBBF24" />,
      badge: 'Statutory',
      badgeVariant: 'warning' as const,
      allowedRoles: ['SUPER_ADMIN', 'SYSTEM_AUDITOR'] as PoliceRole[],
    },
  ];

  const authorizedQuickLaunch = QUICK_LAUNCH_ITEMS.filter((item) =>
    hasRoleAccess(user?.role, item.allowedRoles)
  );

  return (
    <AppShell>
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        
        {/* Command Center Hero Card */}
        <div
          className="netrava-card"
          style={{
            padding: '20px 24px',
            position: 'relative',
          }}
        >
          {/* Top highlight line */}
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
              <PoliceCrest size={40} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h1
                    style={{
                      fontSize: 'var(--text-xl)',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      color: '#FFFFFF',
                      lineHeight: 1.2,
                      margin: 0,
                    }}
                  >
                    Command Center
                  </h1>
                  {isAuditor ? (
                    <StatusBadge label="Read-Only Oversight" variant="info" pulse icon={<Shield size={12} />} />
                  ) : (
                    <StatusBadge label="Operational" variant="success" pulse icon={<Activity size={12} />} />
                  )}
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {isAuditor
                    ? 'Independent Statutory Compliance & Security Review — Read-Only Access'
                    : 'Unified CCTV Intelligence Platform — State Control Room, Gandhinagar'}
                </p>
              </div>
            </div>

            {/* Officer Profile Badge */}
            <div
              style={{
                padding: '8px 14px',
                backgroundColor: 'rgba(11, 16, 32, 0.75)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
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
                <Shield size={16} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {isAuditor ? 'Statutory Auditor' : 'Authenticated Officer'}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {user?.email}
                </div>
                <div style={{ fontSize: '12px', color: '#60A5FA', fontWeight: 500, marginTop: '1px', fontFamily: 'var(--font-mono)' }}>
                  {formatRoleName(user?.role)} • {user?.department_name || 'Gujarat Police'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top-Level KPI Summary (DB-01 / DB-02) */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <div className="netrava-card-subtitle">
              Operational Telemetry
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              LIVE FEED
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '12px',
            }}
          >
            {KPI_METRICS.map((kpi) => (
              <div
                key={kpi.id}
                className="netrava-card"
                style={{
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '88px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {kpi.label}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    {kpi.icon}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span
                    style={{
                      fontSize: 'var(--text-2xl)',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1.1,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {kpi.value}
                  </span>
                  <StatusBadge
                    label={kpi.trend}
                    variant={kpi.trendVariant}
                    size="sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tactical Operations Navigation Quick Launch */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <div className="netrava-card-subtitle">
              {isAuditor ? 'Authorized Oversight Modules' : 'Tactical Operations Navigation'}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              AUTHORIZED ACCESS
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '12px',
            }}
          >
            {authorizedQuickLaunch.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="netrava-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px 18px',
                  textDecoration: 'none',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(215, 25, 63, 0.40)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'rgba(11, 16, 32, 0.85)',
                      border: '1px solid var(--border-medium)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.icon}
                  </div>
                  <StatusBadge label={item.badge} variant={item.badgeVariant} size="sm" />
                </div>

                <div
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{item.label}</span>
                  <ArrowRight size={14} color="var(--text-dim)" />
                </div>

                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.43, margin: 0 }}>
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* Subsystem Health Bar */}
        <div
          className="netrava-card"
          style={{
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={15} color="var(--text-dim)" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.04em' }}>
              SUBSYSTEMS:
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Vision:</span>
              <StatusBadge label="11.7 FPS" variant="success" size="sm" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Events:</span>
              <StatusBadge label="Operational" variant="info" size="sm" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Spatial GIS:</span>
              <StatusBadge label="Online" variant="success" size="sm" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Video Gateway:</span>
              <StatusBadge label="Live" variant="info" size="sm" />
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
