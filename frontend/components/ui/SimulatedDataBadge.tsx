import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface SimulatedDataBadgeProps {
  compact?: boolean;
}

export function SimulatedDataBadge({ compact = false }: SimulatedDataBadgeProps) {
  return (
    <div
      role="status"
      aria-label="Simulated Data Environment Indicator"
      title="Gujarat Police Innovation Challenge 2026: Deterministic CCTV synthetic fixtures and simulated video feeds are active. Not a genuine government production feed."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: compact ? '3px 8px' : '4px 10px',
        backgroundColor: 'var(--simulated-bg)',
        border: '1px solid var(--simulated-border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--simulated-text)',
        fontSize: compact ? 'var(--text-xs)' : 'var(--text-sm)',
        fontWeight: 700,
        letterSpacing: '0.04em',
        userSelect: 'none',
      }}
    >
      <AlertTriangle size={compact ? 13 : 15} style={{ flexShrink: 0 }} />
      <span>SIMULATED DATA</span>
      {!compact && (
        <span style={{ opacity: 0.8, fontWeight: 500, fontSize: 'var(--text-xs)' }}>
          (DEMO FIXTURES)
        </span>
      )}
    </div>
  );
}
