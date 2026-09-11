'use client';

import React from 'react';
import { MapPin, Info, Shield } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { GisCameraMap } from '@/components/cameras/GisCameraMap';
import { useAuth } from '@/lib/auth/context';

export default function GisMapPage() {
  const { user } = useAuth();
  const isAuditor = user?.role === 'SYSTEM_AUDITOR';

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <MapPin size={20} color="var(--accent-primary)" />
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                GIS Camera Command Map
              </h1>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
              {isAuditor
                ? 'Read-only spatial visualization of registered CCTV infrastructure across Gujarat Police jurisdictions'
                : 'Real-time spatial visualization of registered CCTV infrastructure across Gujarat Police jurisdictions'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {isAuditor && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: 'var(--accent-primary)',
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  padding: 'var(--space-1) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                }}
              >
                <Shield size={13} />
                <span>Read-Only Oversight</span>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                padding: 'var(--space-1) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Info size={13} color="var(--accent-primary)" />
              <span>PostGIS Spatial Viewport (WGS-84 / EPSG:4326)</span>
            </div>
          </div>
        </div>

        {/* GIS Map Core */}
        <GisCameraMap />
      </div>
    </AppShell>
  );
}
