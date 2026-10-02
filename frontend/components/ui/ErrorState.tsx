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
        padding: '16px 20px',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.30)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-none)',
        color: 'var(--text-primary)',
        margin: 'var(--space-4) 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <AlertCircle size={16} color="#EF4444" />
        <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: '#F87171', margin: 0 }}>
          {title}
        </h4>
        <span
          style={{
            fontSize: '11px',
            padding: '1px 6px',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 'var(--radius-xs)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: '#F87171',
          }}
        >
          {errorCode}
        </span>
      </div>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.43, margin: '0 0 8px 0' }}>
        {message}
      </p>

      {requestId && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            marginBottom: onRetry ? 'var(--space-3)' : '0',
          }}
        >
          Correlation ID: <span style={{ color: 'var(--text-secondary)' }}>{requestId}</span>
        </div>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary"
          style={{
            marginTop: '8px',
            padding: '6px 14px',
            fontSize: 'var(--text-sm)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <RefreshCw size={14} />
          <span>Retry Operation</span>
        </button>
      )}
    </div>
  );
}
