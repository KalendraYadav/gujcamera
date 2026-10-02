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
        maxWidth: '1080px',
        margin: '0 auto',
      }}
    >
      {/* Header Banner */}
      <div
        className="netrava-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#93C5FD',
            flexShrink: 0,
          }}
        >
          <Icon size={22} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
            <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
              {title}
            </h1>
            <StatusBadge label={phase} variant="warning" icon={<Clock size={11} />} />
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {description}
          </p>
        </div>
      </div>

      {/* Status Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div
          className="netrava-card"
          style={{ padding: 'var(--space-4)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <Layers size={16} color="#3B82F6" />
            <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Architecture Reference
            </h4>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {masterArchitectureSection}
          </p>
        </div>

        <div
          className="netrava-card"
          style={{ padding: 'var(--space-4)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <CheckCircle2 size={16} color="#10B981" />
            <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Subsystem Status
            </h4>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: '#6EE7B7' }}>
            {backendReadiness}
          </p>
        </div>
      </div>

      {/* Planned Feature Specification */}
      <div
        className="netrava-card"
        style={{ padding: 'var(--space-5)' }}
      >
        <div className="netrava-card-subtitle" style={{ marginBottom: 'var(--space-4)' }}>
          Scheduled Capabilities for this Vertical Slice
        </div>

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
                  backgroundColor: '#D7193F',
                  marginTop: '6px',
                  flexShrink: 0,
                  boxShadow: '0 0 6px #D7193F',
                }}
              />
              <span>{feat}</span>
            </li>
          ))}
        </ul>

        <div
          style={{
            marginTop: 'var(--space-5)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-dim)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--text-muted)' }}>Governance Notice:</strong> Deterministic CCTV synthetic fixtures and simulated video feeds are active.
        </div>
      </div>
    </div>
  );
}
