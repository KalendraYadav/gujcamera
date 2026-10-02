import React from 'react';

export type BadgeVariant = 'critical' | 'warning' | 'info' | 'success' | 'offline' | 'neutral';

export function getOperationalStatusVariant(status: string | undefined): BadgeVariant {
  switch (status?.toUpperCase()) {
    case 'ONLINE':
    case 'ACTIVE':
    case 'RESOLVED':
    case 'OPERATIONAL':
    case 'NORMAL':
    case 'PASS':
      return 'success';
    case 'DEGRADED':
    case 'INVESTIGATING':
    case 'ACKNOWLEDGED':
    case 'ANALYSIS':
    case 'ATTENTION':
    case 'PENDING':
    case 'WARN':
      return 'warning';
    case 'OFFLINE':
    case 'INACTIVE':
    case 'DISCONNECTED':
    case 'DISABLED':
      return 'offline';
    case 'ERROR':
    case 'CRITICAL':
    case 'WATCHLIST_HIT':
    case 'HIGH':
    case 'ALERT':
    case 'FAIL':
      return 'critical';
    case 'CONNECTING':
    case 'NEW':
    case 'ANPR_VERIFIED':
    case 'MONITORED':
    case 'PROCESSING':
      return 'info';
    default:
      return 'neutral';
  }
}

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  status?: string;
  icon?: React.ReactNode;
  pulse?: boolean;
  size?: 'sm' | 'md';
}

export function StatusBadge({
  label,
  variant = 'neutral',
  status,
  icon,
  pulse = false,
  size = 'md',
}: StatusBadgeProps) {
  const effectiveVariant =
    variant !== 'neutral' ? variant : status ? getOperationalStatusVariant(status) : 'neutral';

  const getColors = () => {
    switch (effectiveVariant) {
      case 'critical':
        return {
          bg: 'rgba(239, 68, 68, 0.12)',
          border: 'rgba(239, 68, 68, 0.35)',
          text: '#F87171',
          dot: '#EF4444',
          shape: 'square',
        };
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.12)',
          border: 'rgba(245, 158, 11, 0.32)',
          text: '#FBBF24',
          dot: '#F59E0B',
          shape: 'triangle',
        };
      case 'info':
        return {
          bg: 'rgba(59, 130, 246, 0.12)',
          border: 'rgba(59, 130, 246, 0.32)',
          text: '#60A5FA',
          dot: '#3B82F6',
          shape: 'circle',
        };
      case 'success':
        return {
          bg: 'rgba(16, 185, 129, 0.12)',
          border: 'rgba(16, 185, 129, 0.30)',
          text: '#34D399',
          dot: '#10B981',
          shape: 'circle',
        };
      case 'offline':
        return {
          bg: 'rgba(100, 116, 139, 0.12)',
          border: 'rgba(100, 116, 139, 0.28)',
          text: '#94A3B8',
          dot: '#64748B',
          shape: 'dash',
        };
      default:
        return {
          bg: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.12)',
          text: '#CBD5E1',
          dot: '#94A3B8',
          shape: 'circle',
        };
    }
  };

  const colors = getColors();
  const isSmall = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? '4px' : '6px',
        padding: isSmall ? '1px 6px' : '2px 8px',
        borderRadius: 'var(--radius-xs)', // Strict 4px
        fontSize: isSmall ? '11px' : '12px', // Rulebook BG-02 standard
        fontWeight: 600,
        height: isSmall ? '20px' : '22px',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        letterSpacing: '0.02em',
        lineHeight: 1,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {pulse ? (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            backgroundColor: colors.dot,
            animation: 'pulse 1.8s infinite',
            flexShrink: 0,
          }}
        />
      ) : icon ? (
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
      ) : (
        <span
          style={{
            width: '5px',
            height: colors.shape === 'dash' ? '2px' : '5px',
            borderRadius: colors.shape === 'circle' ? '50%' : colors.shape === 'square' ? '1px' : '0px',
            backgroundColor: colors.dot,
            flexShrink: 0,
          }}
        />
      )}
      <span>{label}</span>
    </span>
  );
}
