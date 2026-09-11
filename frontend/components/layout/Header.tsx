'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Shield, Activity, Wifi } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { NAV_ITEMS } from '@/lib/auth/rbac';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';

export function Header() {
  const { user } = useAuth();
  const pathname = usePathname();

  const currentNav = NAV_ITEMS.find((item) => item.path === pathname) || {
    label: 'Command Center',
    phase: 'Phase 4A Foundation',
  };

  return (
    <header
      style={{
        height: 'var(--header-height)',
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-6)',
        position: 'sticky',
        top: 0,
        zIndex: 90,
      }}
    >
      {/* Active Screen Title & Subsystem Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Unified Platform /
          </span>
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {currentNav.label}
          </h2>
        </div>

        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            padding: '2px 6px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xs)',
            color: 'var(--text-muted)',
          }}
        >
          {currentNav.phase}
        </span>
      </div>

      {/* Center/Right Status Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {/* Backend API Connectivity Indicator */}
        <div
          title="Connected to Backend REST API (http://localhost:4000/api/v1)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--text-xs)',
            color: 'var(--status-success)',
            backgroundColor: 'var(--status-success-bg)',
            border: '1px solid var(--status-success-border)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Wifi size={12} />
          <span>API 200 OK</span>
        </div>

        {/* System Auditor Oversight Mode Indicator */}
        {user?.role === 'SYSTEM_AUDITOR' && (
          <div
            id="auditor-oversight-badge"
            title="Active Role: System Auditor (Statutory Read-Only Compliance Review)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--accent-primary)',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Shield size={12} />
            <span>Read-Only Oversight</span>
          </div>
        )}

        {/* Mandatory Hackathon Simulated Data Label */}
        <SimulatedDataBadge compact />
      </div>
    </header>
  );
}
