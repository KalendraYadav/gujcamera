'use client';

import React from 'react';
import { MapPin, Info } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { GisCameraMap } from '@/components/cameras/GisCameraMap';

export default function GisMapPage() {
  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <MapPin size={20} color="var(--accent-primary)" />
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                GIS Camera Command Map
              </h1>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
              Real-time spatial visualization of registered CCTV infrastructure across Gujarat Police jurisdictions
            </p>
          </div>

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

        {/* GIS Map Core */}
        <GisCameraMap />
      </div>
    </AppShell>
  );
}
