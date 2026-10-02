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
        <div
          className="netrava-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            padding: '14px 20px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MapPin size={15} color="#60A5FA" />
              </div>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.01em', margin: 0 }}>
                GIS Camera Command Map
              </h1>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '3px', margin: 0 }}>
              {isAuditor
                ? 'Read-only spatial camera distribution across Gujarat Police jurisdictions.'
                : 'Geospatial camera distribution across Gujarat Police jurisdictions.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isAuditor && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: '#60A5FA',
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-xs)',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                <Shield size={12} />
                <span>Read-Only Oversight</span>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              <Info size={12} color="#60A5FA" />
              <span>WGS-84 / EPSG:4326</span>
            </div>
          </div>
        </div>

        {/* GIS Map Core */}
        <GisCameraMap />
      </div>
    </AppShell>
  );
}
