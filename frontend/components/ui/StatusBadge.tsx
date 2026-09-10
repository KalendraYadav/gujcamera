import React from 'react';

export type BadgeVariant = 'critical' | 'warning' | 'info' | 'success' | 'offline' | 'neutral';

export function getOperationalStatusVariant(status: string | undefined): BadgeVariant {
  switch (status?.toUpperCase()) {
    case 'ONLINE':
      return 'success';
    case 'DEGRADED':
      return 'warning';
    case 'OFFLINE':
      return 'offline';
    case 'ERROR':
      return 'critical';
    case 'CONNECTING':
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
          bg: 'var(--status-critical-bg)',
          border: 'var(--status-critical-border)',
          text: 'var(--status-critical)',
        };
      case 'warning':
        return {
          bg: 'var(--status-warning-bg)',
          border: 'var(--status-warning-border)',
          text: 'var(--status-warning)',
        };
      case 'info':
        return {
          bg: 'var(--status-info-bg)',
          border: 'var(--status-info-border)',
          text: 'var(--status-info)',
        };
      case 'success':
        return {
          bg: 'var(--status-success-bg)',
          border: 'var(--status-success-border)',
          text: 'var(--status-success)',
        };
      case 'offline':
        return {
          bg: 'var(--status-offline-bg)',
          border: 'var(--status-offline-border)',
          text: 'var(--status-offline)',
        };
      default:
        return {
          bg: 'var(--bg-surface)',
          border: 'var(--border-default)',
          text: 'var(--text-secondary)',
        };
    }
  };

  const colors = getColors();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size === 'sm' ? '4px' : '6px',
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        borderRadius: 'var(--radius-sm)',
        fontSize: size === 'sm' ? '10px' : 'var(--text-xs)',
        fontWeight: 600,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
      }}
    >
      {pulse && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: colors.text,
            animation: 'pulse 1.5s infinite',
          }}
        />
      )}
      {icon}
      <span>{label}</span>
    </span>
  );
}
