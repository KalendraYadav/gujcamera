'use client';

import React from 'react';
import Link from 'next/link';
import {
  Shield,
  Video,
  MapPin,
  Car,
  BellRing,
  CheckCircle2,
  Cpu,
  Layers,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { AppShell } from '@/components/layout/AppShell';
import { formatRoleName } from '@/lib/auth/rbac';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default function CommandCenterPage() {
  const { user } = useAuth();

  return (
    <AppShell>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Welcome & Tactical Identity Banner */}
        <div
          style={{
            padding: 'var(--space-6)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
            marginBottom: 'var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Command Center
              </h1>
              <StatusBadge label="Operational" variant="success" pulse icon={<Activity size={12} />} />
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Unified CCTV Intelligence Platform — State Control Room, Gandhinagar
            </p>
          </div>

          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <Shield size={22} color="var(--accent-primary)" />
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Authenticated Officer</div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {user?.email}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 500 }}>
                {formatRoleName(user?.role)} • {user?.department_name || 'Gujarat Police'}
              </div>
            </div>
          </div>
        </div>

        {/* Subsystem Pipeline Readiness Grid */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Subsystem Infrastructure & Intelligence Pipeline Status
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Vision Engine</span>
                <StatusBadge label="11.7 FPS CPU" variant="success" />
              </div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                YOLOv8n + OCR Consensus
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Multi-frame consensus (5–8 frames), MinIO S3 evidence store with exact-byte SHA-256 integrity verification.
              </p>
            </div>

            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Event Ingestion</span>
                <StatusBadge label="Redis Streams" variant="info" />
              </div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                Event Boundary v1.0
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Consumer groups, atomic PostgreSQL $transaction persistence, and duplicate delivery idempotency.
              </p>
            </div>

            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Spatial DB</span>
                <StatusBadge label="PostGIS 3.4" variant="success" />
              </div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                Camera Registry & GIS
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Spatial bounding box queries (`ST_DWithin`, `ST_MakeEnvelope`), route velocity reconstruction.
              </p>
            </div>

            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Frontend UI</span>
                <StatusBadge label="Active" variant="warning" />
              </div>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                Base Design System & Shell
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Dark-first control-room aesthetic, RBAC-aware navigation, in-memory session security, and SIMULATED DATA banners.
              </p>
            </div>
          </div>
        </div>

        {/* Tactical Navigation Quick Launch */}
        <div>
          <h2
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Tactical Operations Navigation
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <Link
              href="/live"
              style={{
                display: 'block',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <Video size={20} color="var(--accent-primary)" />
                <StatusBadge label="Live" variant="success" />
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                Live Video Monitoring
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Deterministic CCTV HLS streams powered by MediaMTX.
              </p>
            </Link>

            <Link
              href="/map"
              style={{
                display: 'block',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <MapPin size={20} color="var(--status-info)" />
                <StatusBadge label="Live" variant="success" />
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                GIS Camera Command Map
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Interactive MapLibre GL map with PostGIS spatial viewport bounding-box queries.
              </p>
            </Link>

            <Link
              href="/cameras"
              style={{
                display: 'block',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <Activity size={20} color="var(--accent-primary)" />
                <StatusBadge label="Live" variant="success" />
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                CCTV Camera Registry
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Equipment inventory, operational telemetry status, and hardware stream profiles.
              </p>
            </Link>

            <Link
              href="/vehicles"
              style={{
                display: 'block',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <Car size={20} color="var(--accent-primary)" />
                <StatusBadge label="Live" variant="success" />
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                Vehicle Investigation
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Plate-based ANPR search, cross-camera sightings, and MapLibre GIS route reconstruction.
              </p>
            </Link>

            <Link
              href="/alerts"
              style={{
                display: 'block',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <BellRing size={20} color="var(--status-critical)" />
                <StatusBadge label="Live" variant="success" />
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                Real-Time Alert Feed
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                WebSocket alert engine with 5-second polling fallback.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
