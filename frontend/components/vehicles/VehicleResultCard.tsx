'use client';

// ==============================================================================
// Vehicle Result Card Component
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 14.2)
//                  docs/API.md (Section 5.1)
//
// Displays a compact summary of a vehicle search result.
// Prominently surfaces watchlist status with category and priority.
// Clicking navigates to the vehicle detail page (/vehicles/[plate]).
// ==============================================================================

import React from 'react';
import Link from 'next/link';
import { Car, Clock, Eye, AlertTriangle, Shield } from 'lucide-react';
import { VehicleSearchResult, WatchlistPriority } from '@/types/vehicle';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';

interface VehicleResultCardProps {
  vehicle: VehicleSearchResult;
}

function getPriorityVariant(priority: string | null): BadgeVariant {
  switch (priority?.toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'warning';
    case 'MEDIUM':
      return 'info';
    default:
      return 'neutral';
  }
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffH < 1) return 'within last hour';
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return '1 day ago';
  return `${diffD} days ago`;
}

export function VehicleResultCard({ vehicle }: VehicleResultCardProps) {
  const hasAttrs = vehicle.attributes && Object.keys(vehicle.attributes).length > 0;

  return (
    <Link
      href={`/vehicles/${encodeURIComponent(vehicle.plate_normalized)}`}
      aria-label={`Investigate vehicle ${vehicle.plate_normalized}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        role="article"
        tabIndex={0}
        style={{
          backgroundColor: vehicle.is_watchlisted
            ? 'rgba(239, 68, 68, 0.04)'
            : 'var(--bg-surface)',
          border: `1px solid ${vehicle.is_watchlisted ? 'var(--status-critical-border)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = vehicle.is_watchlisted
            ? 'var(--status-critical)'
            : 'var(--border-default)';
          e.currentTarget.style.backgroundColor = vehicle.is_watchlisted
            ? 'rgba(239, 68, 68, 0.08)'
            : 'var(--bg-surface-hover)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = vehicle.is_watchlisted
            ? 'var(--status-critical-border)'
            : 'var(--border-subtle)';
          e.currentTarget.style.backgroundColor = vehicle.is_watchlisted
            ? 'rgba(239, 68, 68, 0.04)'
            : 'var(--bg-surface)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {/* Left accent bar for watchlisted vehicles */}
        {vehicle.is_watchlisted && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '3px',
              backgroundColor: 'var(--status-critical)',
            }}
          />
        )}

        {/* Header: plate + watchlist badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Car size={16} color={vehicle.is_watchlisted ? 'var(--status-critical)' : 'var(--accent-primary)'} />
            <span
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em',
                color: 'var(--text-primary)',
              }}
            >
              {vehicle.plate_normalized}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
            {vehicle.is_watchlisted && (
              <>
                <StatusBadge
                  label={vehicle.watchlist_priority || 'WATCHLISTED'}
                  variant={getPriorityVariant(vehicle.watchlist_priority)}
                  icon={<AlertTriangle size={10} />}
                  size="sm"
                />
                {vehicle.watchlist_category && (
                  <StatusBadge
                    label={vehicle.watchlist_category.replace(/_/g, ' ')}
                    variant="critical"
                    size="sm"
                  />
                )}
              </>
            )}
            {!vehicle.is_watchlisted && (
              <StatusBadge label="CLEAR" variant="success" icon={<Shield size={10} />} size="sm" />
            )}
          </div>
        </div>

        {/* Vehicle attributes (if available) */}
        {hasAttrs && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-3)',
            }}
          >
            {[
              vehicle.attributes?.color,
              vehicle.attributes?.make,
              vehicle.attributes?.model,
              vehicle.attributes?.type,
            ]
              .filter(Boolean)
              .map((val, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-secondary)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {val}
                </span>
              ))}
          </div>
        )}

        {/* Footer metrics */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Eye size={11} />
              <span>
                <strong style={{ color: 'var(--text-secondary)' }}>{vehicle.total_sightings}</strong>{' '}
                sighting{vehicle.total_sightings !== 1 ? 's' : ''}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={11} />
              Last seen: {formatRelativeTime(vehicle.last_seen)}
            </span>
          </div>

          <span
            style={{
              fontSize: '10px',
              color: 'var(--accent-primary)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Investigate →
          </span>
        </div>
      </div>
    </Link>
  );
}
