import React from 'react';
import { CameraOff, LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message: string;
  subtext?: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
  compact?: boolean;
}

export function EmptyState({
  title = 'No Data Available',
  message,
  subtext,
  icon: Icon = CameraOff,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '18px 16px' : '32px 24px',
        backgroundColor: compact ? 'rgba(255, 255, 255, 0.015)' : 'var(--bg-surface)',
        border: compact ? '1px dashed rgba(255, 255, 255, 0.08)' : '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-none)',
        textAlign: 'center',
        minHeight: compact ? '110px' : '200px',
      }}
    >
      <div
        style={{
          width: compact ? '30px' : '40px',
          height: compact ? '30px' : '40px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-medium)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          marginBottom: compact ? 'var(--space-2)' : 'var(--space-3)',
        }}
      >
        <Icon size={compact ? 15 : 20} />
      </div>

      <h4
        style={{
          fontSize: compact ? '12px' : 'var(--text-base)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-1)',
          letterSpacing: '0.01em',
        }}
      >
        {title}
      </h4>

      <p
        style={{
          fontSize: compact ? '11px' : 'var(--text-sm)',
          color: 'var(--text-secondary)',
          maxWidth: compact ? '320px' : '400px',
          marginBottom: subtext || action ? 'var(--space-2)' : '0',
          lineHeight: 1.4,
        }}
      >
        {message}
      </p>

      {subtext && (
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-dim)',
            maxWidth: '380px',
            marginBottom: action ? 'var(--space-4)' : '0',
            lineHeight: 1.4,
          }}
        >
          {subtext}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="btn-secondary"
          style={{
            marginTop: 'var(--space-3)',
            padding: '6px 14px',
            fontSize: 'var(--text-sm)',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
