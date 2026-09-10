import React from 'react';
import { Activity } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  subtext?: string;
}

export function LoadingState({
  message = 'Initializing Police Intelligence Interface...',
  subtext = 'Verifying cryptographic session & subsystem connections',
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
        minHeight: '280px',
        padding: 'var(--space-8)',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'var(--accent-subtle)',
          border: '1px solid var(--accent-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-primary)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <Activity size={24} style={{ animation: 'pulse 1.5s infinite' }} />
      </div>

      <h3
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {message}
      </h3>

      {subtext && (
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            maxWidth: '360px',
          }}
        >
          {subtext}
        </p>
      )}
    </div>
  );
}
