import React from 'react';
import { LucideIcon, Clock, Layers, CheckCircle2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface PlaceholderPageProps {
  title: string;
  phase: string;
  icon: LucideIcon;
  description: string;
  masterArchitectureSection: string;
  backendReadiness: string;
  featuresList: string[];
}

export function PlaceholderPage({
  title,
  phase,
  icon: Icon,
  description,
  masterArchitectureSection,
  backendReadiness,
  featuresList,
}: PlaceholderPageProps) {
  return (
    <div
      style={{
        padding: 'var(--space-6)',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-5)',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--accent-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-primary)',
            flexShrink: 0,
          }}
        >
          <Icon size={28} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
              {title}
            </h1>
            <StatusBadge label={phase} variant="warning" icon={<Clock size={12} />} />
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {description}
          </p>
        </div>
      </div>

      {/* Honest Status Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <Layers size={16} color="var(--accent-primary)" />
            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Architecture Reference
            </h4>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {masterArchitectureSection}
          </p>
        </div>

        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <CheckCircle2 size={16} color="var(--status-success)" />
            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Subsystem Foundation Status
            </h4>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--status-success)' }}>
            {backendReadiness}
          </p>
        </div>
      </div>

      {/* Planned Feature Specification */}
      <div
        style={{
          padding: 'var(--space-5)',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <h3
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-4)',
          }}
        >
          Scheduled Capabilities for this Vertical Slice
        </h3>

        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {featuresList.map((feat, idx) => (
            <li
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-primary)',
                  marginTop: '8px',
                  flexShrink: 0,
                }}
              />
              <span>{feat}</span>
            </li>
          ))}
        </ul>

        <div
          style={{
            marginTop: 'var(--space-6)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          <strong>Governance Notice:</strong> Per Phase 4A implementation rules, mock data and fabricated UI components are strictly forbidden. This module will be fully integrated against live services during its designated Phase 4 vertical slice.
        </div>
      </div>
    </div>
  );
}
