'use client';

// ==============================================================================
// Sightings Timeline Component
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 10, 14.2)
//                  docs/API.md (Section 5.3 & 5.4)
//
// Displays chronological sighting events and route segment analytics.
// Each sighting row includes camera name, timestamp, confidence, consensus frames.
// Route segment rows show PostGIS geodesic distance, elapsed time, and speed.
// Plausibility flags are prominently displayed for REQUIRES_REVIEW segments.
//
// GOVERNANCE:
//   - All data here is PLATE-BASED cross-camera correlation ONLY.
//   - "Confidence" refers to ANPR OCR confidence of the plate character match.
//   - "Consensus frames" is the number of AI-worker video frames that agreed on
//     the plate read before the backend committed the sighting record.
//   - Do NOT label this as "face recognition" or "visual re-identification".
// ==============================================================================

import React from 'react';
import {
  Camera,
  Clock,
  MapPin,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Route,
  Timer,
  ScanLine,
  FileCheck2,
} from 'lucide-react';
import { TimelineSighting, RouteSegment, RouteSummary } from '@/types/vehicle';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PoliceRole } from '@/types/auth';
import { canExportEvidence } from '@/lib/auth/rbac';

interface SightingsTimelineProps {
  sightings: TimelineSighting[];
  routeSegments: RouteSegment[];
  summary: RouteSummary;
  routePlausibilityScore: number;
  onExportEvidence?: (sightingId: string) => void;
  userRole?: PoliceRole;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

interface SightingRowProps {
  sighting: TimelineSighting;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onExportEvidence?: (sightingId: string) => void;
}

function SightingRow({ sighting, index, isFirst, isLast, onExportEvidence }: SightingRowProps) {
  const confidencePercent = Math.round(sighting.confidence * 100);
  const confColor =
    confidencePercent >= 90
      ? 'var(--status-success)'
      : confidencePercent >= 75
      ? 'var(--status-warning)'
      : 'var(--status-critical)';

  const markerBg = isFirst ? '#10b981' : isLast ? '#ef4444' : '#2563eb';
  const markerBorder = isFirst ? '#6ee7b7' : isLast ? '#fca5a5' : '#93c5fd';

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
      }}
    >
      {/* Timeline marker */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          flexShrink: 0,
        }}
      >
        <div
          aria-label={`Sighting ${index + 1}`}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: markerBg,
            border: `2px solid ${markerBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: '#fff',
            boxShadow: `0 0 8px ${markerBg}60`,
            zIndex: 2,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>
      </div>

      {/* Sighting content */}
      <div
        style={{
          flex: 1,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Camera size={13} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {sighting.camera_name}
            </span>
          </div>
          {isFirst && (
            <StatusBadge label="FIRST" variant="success" size="sm" />
          )}
          {isLast && !isFirst && (
            <StatusBadge label="LAST" variant="critical" size="sm" />
          )}
        </div>

        {/* Location */}
        {sighting.location && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-2)',
            }}
          >
            <MapPin size={11} style={{ flexShrink: 0 }} />
            <span>
              {sighting.location.address}
              {sighting.location.district ? ` — ${sighting.location.district}` : ''}
            </span>
          </div>
        )}

        {/* Metrics row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={11} />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatTimestamp(sighting.timestamp)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ScanLine size={11} />
            <span>
              ANPR Conf:{' '}
              <span style={{ color: confColor, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {confidencePercent}%
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              Frames consensus:{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                {sighting.consensus_frames}
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)' }}>
            <span>
              {sighting.coordinates.lat.toFixed(5)}, {sighting.coordinates.long.toFixed(5)}
            </span>
          </div>
        </div>

        {onExportEvidence && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <button
              id={`verify-evidence-btn-${sighting.id}`}
              onClick={() => onExportEvidence(sighting.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--accent-primary)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <FileCheck2 size={12} /> Verify & Export Evidence Package
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface RouteHopRowProps {
  segment: RouteSegment;
  index: number;
}

function RouteHopRow({ segment, index }: RouteHopRowProps) {
  const isImplausible = !segment.is_plausible;

  return (
    <div
      style={{
        marginLeft: '14px',
        borderLeft: `2px dashed ${isImplausible ? 'var(--status-critical)' : 'var(--accent-border)'}`,
        padding: 'var(--space-2) 0 var(--space-2) var(--space-3)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
      }}
    >
      <ArrowRight
        size={14}
        color={isImplausible ? 'var(--status-critical)' : 'var(--accent-primary)'}
        style={{ flexShrink: 0, marginTop: '1px' }}
      />
      <div
        style={{
          flex: 1,
          backgroundColor: isImplausible ? 'var(--status-critical-bg)' : 'var(--bg-secondary)',
          border: `1px solid ${isImplausible ? 'var(--status-critical-border)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          {isImplausible && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-critical)' }}>
              <AlertTriangle size={11} />
              <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Requires Review
              </span>
              <span style={{ fontWeight: 400 }}>—</span>
            </div>
          )}
          {!isImplausible && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-success)' }}>
              <CheckCircle2 size={11} />
              <span style={{ fontWeight: 600 }}>Plausible</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Route size={11} />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDistance(segment.distance_meters)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Timer size={11} />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDuration(segment.elapsed_seconds)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Gauge size={11} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: isImplausible ? 'var(--status-critical)' : 'var(--text-secondary)',
              }}
            >
              {segment.estimated_speed_kmh.toFixed(1)} km/h
            </span>
          </div>
        </div>

        {isImplausible && segment.plausibility_reason && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '10px',
              color: 'var(--status-critical)',
              fontStyle: 'italic',
            }}
          >
            {segment.plausibility_reason}
          </div>
        )}
      </div>
    </div>
  );
}

export function SightingsTimeline({
  sightings,
  routeSegments,
  summary,
  routePlausibilityScore,
  onExportEvidence,
  userRole,
}: SightingsTimelineProps) {
  const isExportAuthorized = !userRole || canExportEvidence(userRole);
  const effectiveOnExport = isExportAuthorized ? onExportEvidence : undefined;
  const plausibilityPct = Math.round(routePlausibilityScore * 100);
  const plausColor =
    plausibilityPct === 100
      ? 'var(--status-success)'
      : plausibilityPct >= 70
      ? 'var(--status-warning)'
      : 'var(--status-critical)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Summary Stats Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        {[
          {
            label: 'Total Distance',
            value: formatDistance(summary.total_distance_meters),
            icon: Route,
            mono: true,
          },
          {
            label: 'Total Duration',
            value: formatDuration(summary.total_elapsed_seconds),
            icon: Timer,
            mono: true,
          },
          {
            label: 'Avg Speed',
            value: `${summary.average_speed_kmh.toFixed(1)} km/h`,
            icon: Gauge,
            mono: true,
          },
          {
            label: 'Camera Hops',
            value: `${summary.hops_count}`,
            icon: Route,
            mono: false,
          },
          {
            label: 'Route Score',
            value: `${plausibilityPct}%`,
            icon: CheckCircle2,
            mono: true,
            color: plausColor,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <stat.icon size={11} color="var(--text-muted)" />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {stat.label}
              </span>
            </div>
            <span
              style={{
                fontSize: 'var(--text-md)',
                fontWeight: 700,
                fontFamily: stat.mono ? 'var(--font-mono)' : undefined,
                color: (stat as any).color || 'var(--text-primary)',
              }}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Implausible hops warning */}
      {summary.implausible_hops_count > 0 && (
        <div
          style={{
            backgroundColor: 'var(--status-critical-bg)',
            border: '1px solid var(--status-critical-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-2)',
          }}
        >
          <AlertTriangle size={16} color="var(--status-critical)" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--status-critical)' }}>
              {summary.implausible_hops_count} route segment{summary.implausible_hops_count > 1 ? 's' : ''} flagged for review
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Implied speed exceeds threshold or timestamps indicate physical impossibility. Manual investigative verification required before enforcement action.
            </div>
          </div>
        </div>
      )}

      {/* Correlation governance notice */}
      <div
        style={{
          backgroundColor: 'var(--status-info-bg)',
          border: '1px solid var(--status-info-border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}
      >
        <ScanLine size={13} color="var(--status-info)" style={{ flexShrink: 0 }} />
        <span>
          <strong style={{ color: 'var(--status-info)' }}>Plate-Based Correlation Only</strong> — Sightings are linked by
          normalized license plate ANPR reads. This is NOT visual re-identification or face recognition.
          Each sighting is an independent camera observation event.
        </span>
      </div>

      {/* Chronological timeline with hop segments */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {sightings.map((sighting, index) => {
          const segment = routeSegments[index]; // segment[i] connects sighting[i] → sighting[i+1]
          return (
            <React.Fragment key={sighting.id}>
              <SightingRow
                sighting={sighting}
                index={index}
                isFirst={index === 0}
                isLast={index === sightings.length - 1}
                onExportEvidence={effectiveOnExport}
              />
              {segment && <RouteHopRow segment={segment} index={index} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
