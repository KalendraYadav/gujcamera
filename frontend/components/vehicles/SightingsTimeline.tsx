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

  const markerBg = isFirst ? '#10B981' : isLast ? '#EF4444' : '#3B82F6';
  const markerBorder = isFirst ? 'rgba(16, 185, 129, 0.4)' : isLast ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)';

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
      }}
    >
      {/* Timeline Marker */}
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
            backgroundColor: 'var(--bg-primary)',
            border: `2px solid ${markerBg}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: markerBg,
            boxShadow: `0 0 10px ${markerBg}40`,
            zIndex: 2,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>
      </div>

      {/* Sighting Content Card */}
      <div
        className="netrava-card"
        style={{
          flex: 1,
          padding: 'var(--space-3) var(--space-4)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {/* Header Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Camera size={14} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
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
            <StatusBadge label="FIRST OBSERVED" variant="success" size="sm" />
          )}
          {isLast && !isFirst && (
            <StatusBadge label="LAST OBSERVED" variant="critical" size="sm" />
          )}
        </div>

        {/* Location Info */}
        {sighting.location && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-2)',
            }}
          >
            <MapPin size={12} color="var(--text-dim)" style={{ flexShrink: 0 }} />
            <span>
              {sighting.location.address}
              {sighting.location.district ? ` &bull; ${sighting.location.district}` : ''}
            </span>
          </div>
        )}

        {/* Metrics Telemetry Row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={11} color="var(--text-dim)" />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatTimestamp(sighting.timestamp)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ScanLine size={11} color="var(--text-dim)" />
            <span>
              OCR Conf:{' '}
              <span style={{ color: confColor, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {confidencePercent}%
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              Consensus:{' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {sighting.consensus_frames} frames
              </span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
            <span>
              {sighting.coordinates.lat.toFixed(5)}, {sighting.coordinates.long.toFixed(5)}
            </span>
          </div>
        </div>

        {onExportEvidence && (
          <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              id={`verify-evidence-btn-${sighting.id}`}
              onClick={() => onExportEvidence(sighting.id)}
              className="btn-secondary"
              style={{
                fontSize: '11px',
                padding: '3px 9px',
                gap: '4px',
                color: 'var(--accent-blue)',
                borderColor: 'var(--accent-blue-border)',
              }}
            >
              <FileCheck2 size={12} /> Verify &amp; Export Evidence Package
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
        marginLeft: '13px',
        borderLeft: `2px dashed ${isImplausible ? 'var(--status-critical)' : 'var(--accent-blue-border)'}`,
        padding: 'var(--space-2) 0 var(--space-2) var(--space-3)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
      }}
    >
      <ArrowRight
        size={13}
        color={isImplausible ? 'var(--status-critical)' : 'var(--accent-blue)'}
        style={{ flexShrink: 0, marginTop: '2px' }}
      />
      <div
        style={{
          flex: 1,
          backgroundColor: isImplausible ? 'var(--status-critical-bg)' : 'var(--bg-primary)',
          border: `1px solid ${isImplausible ? 'var(--status-critical-border)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          {isImplausible && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-critical)' }}>
              <AlertTriangle size={11} />
              <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                Requires Review
              </span>
            </div>
          )}
          {!isImplausible && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--status-success)' }}>
              <CheckCircle2 size={11} />
              <span style={{ fontWeight: 600 }}>Plausible Trajectory</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Route size={11} color="var(--text-dim)" />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDistance(segment.distance_meters)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Timer size={11} color="var(--text-dim)" />
            <span style={{ fontFamily: 'var(--font-mono)' }}>{formatDuration(segment.elapsed_seconds)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Gauge size={11} color="var(--text-dim)" />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: isImplausible ? 'var(--status-critical)' : 'var(--text-primary)',
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
      {/* Summary Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
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
            className="netrava-card"
            style={{
              padding: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <stat.icon size={11} color="var(--text-dim)" />
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                }}
              >
                {stat.label}
              </span>
            </div>
            <span
              style={{
                fontSize: 'var(--text-md)',
                fontWeight: 800,
                fontFamily: stat.mono ? 'var(--font-mono)' : undefined,
                color: (stat as any).color || 'var(--text-primary)',
              }}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Implausible Hops Warning */}
      {summary.implausible_hops_count > 0 && (
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
            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--status-critical)' }}>
              {summary.implausible_hops_count} Route Segment{summary.implausible_hops_count > 1 ? 's' : ''} Flagged for Review
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Implied speed exceeds physical vehicle thresholds or timestamps indicate potential duplicate readings. Manual verification required before enforcement.
            </div>
          </div>
        </div>
      )}

      {/* Correlation Governance Notice */}
      <div
        style={{
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid var(--accent-blue-border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}
      >
        <ScanLine size={13} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>PLATE-BASED CORRELATION ONLY:</strong> Sightings are correlated by normalized license plate reads. This is not facial recognition or biometric identification. Each sighting reflects an autonomous camera detection event.
        </span>
      </div>

      {/* Chronological Timeline Feed */}
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
