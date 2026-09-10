import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  errorCode?: string;
  requestId?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Command Subsystem Error',
  message,
  errorCode = 'OPERATION_FAILED',
  requestId,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: 'var(--space-5)',
        backgroundColor: 'var(--status-critical-bg)',
        border: '1px solid var(--status-critical-border)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-primary)',
        margin: 'var(--space-4) 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
        <AlertCircle size={20} color="var(--status-critical)" />
        <h4 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--status-critical)' }}>
          {title}
        </h4>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            padding: '2px 6px',
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: 'var(--radius-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
          }}
        >
          {errorCode}
        </span>
      </div>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
        {message}
      </p>

      {requestId && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            marginBottom: onRetry ? 'var(--space-4)' : '0',
          }}
        >
          Correlation ID: <span style={{ color: 'var(--text-secondary)' }}>{requestId}</span>
        </div>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
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
          <RefreshCw size={13} />
          Retry Operation
        </button>
      )}
    </div>
  );
}
