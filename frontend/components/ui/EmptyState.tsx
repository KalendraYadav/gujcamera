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
}

export function EmptyState({
  title = 'No Data Available',
  message,
  subtext,
  icon: Icon = CameraOff,
  action,
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
        padding: '32px 24px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-none)',
        textAlign: 'center',
        minHeight: '200px',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-medium)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <Icon size={20} />
      </div>

      <h4
        style={{
          fontSize: 'var(--text-base)',
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
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          maxWidth: '400px',
          marginBottom: subtext || action ? 'var(--space-2)' : '0',
          lineHeight: 1.43,
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
