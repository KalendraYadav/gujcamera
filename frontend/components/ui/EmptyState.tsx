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
        padding: 'var(--space-8)',
        backgroundColor: 'var(--bg-card)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--radius-md)',
        textAlign: 'center',
        minHeight: '220px',
      }}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <Icon size={22} />
      </div>

      <h4
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {title}
      </h4>

      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          maxWidth: '420px',
          marginBottom: subtext || action ? 'var(--space-2)' : '0',
        }}
      >
        {message}
      </p>

      {subtext && (
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            maxWidth: '380px',
            marginBottom: action ? 'var(--space-4)' : '0',
          }}
        >
          {subtext}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-4)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background var(--transition-fast)',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
