import React from 'react';
import { Activity } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  subtext?: string;
}

export function LoadingState({
  message = 'Initializing Police Intelligence Interface...',
  subtext = 'Verifying session and subsystem connections',
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '220px',
        padding: '32px 24px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-none)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(215, 25, 63, 0.10)',
          border: '1px solid rgba(215, 25, 63, 0.30)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F87171',
          marginBottom: 'var(--space-3)',
        }}
      >
        <Activity size={20} style={{ animation: 'pulse 1.8s infinite' }} />
      </div>

      <h3
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-1)',
          letterSpacing: '0.01em',
        }}
      >
        {message}
      </h3>

      {subtext && (
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            maxWidth: '380px',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          {subtext}
        </p>
      )}
    </div>
  );
}
