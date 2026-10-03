'use client';

// ==============================================================================
// Investigation Audit Trail Component — Investigation Command Center
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7, 14.2)
//                  Phase 8 Investigation Command Center Specification
//
// Displays real immutable audit ledger entries generated during vehicle investigation.
// Never fabricates records. Shows real backend events:
//   VEHICLE_SEARCH, VEHICLE_DETAIL_VIEW, VEHICLE_TIMELINE_SEARCH,
//   VEHICLE_SIGHTINGS_VIEW, EVIDENCE_VIEW, ALERT_CREATE
// ==============================================================================

import React from 'react';
import {
  FileText,
  User,
  Clock,
  RefreshCw,
  Search,
  Eye,
  AlertTriangle,
  FileCheck2,
  Route,
  Hash,
} from 'lucide-react';
import { VehicleAuditRecord } from '@/types/vehicle';

interface InvestigationAuditTrailProps {
  plateNormalized: string;
  auditRecords: VehicleAuditRecord[];
  loading: boolean;
  onRefresh?: () => void;
}

function getActionIcon(action: string) {
  switch (action?.toUpperCase()) {
    case 'VEHICLE_SEARCH':
      return <Search size={12} color="#60A5FA" />;
    case 'VEHICLE_DETAIL_VIEW':
    case 'VEHICLE_SIGHTINGS_VIEW':
      return <Eye size={12} color="#34D399" />;
    case 'VEHICLE_TIMELINE_SEARCH':
      return <Route size={12} color="#A78BFA" />;
    case 'ALERT_CREATE':
      return <AlertTriangle size={12} color="#F87171" />;
    case 'EVIDENCE_VIEW':
    case 'EVIDENCE_EXPORTED':
      return <FileCheck2 size={12} color="#FBBF24" />;
    default:
      return <FileText size={12} color="var(--text-dim)" />;
  }
}

function getActionColor(action: string) {
  switch (action?.toUpperCase()) {
    case 'VEHICLE_SEARCH':
      return { bg: 'rgba(59, 130, 246, 0.1)', text: '#60A5FA', border: 'rgba(59, 130, 246, 0.25)' };
    case 'VEHICLE_DETAIL_VIEW':
    case 'VEHICLE_SIGHTINGS_VIEW':
      return { bg: 'rgba(16, 185, 129, 0.1)', text: '#34D399', border: 'rgba(16, 185, 129, 0.25)' };
    case 'VEHICLE_TIMELINE_SEARCH':
      return { bg: 'rgba(168, 85, 247, 0.1)', text: '#C084FC', border: 'rgba(168, 85, 247, 0.25)' };
    case 'ALERT_CREATE':
      return { bg: 'rgba(239, 68, 68, 0.1)', text: '#F87171', border: 'rgba(239, 68, 68, 0.25)' };
    case 'EVIDENCE_VIEW':
    case 'EVIDENCE_EXPORTED':
      return { bg: 'rgba(245, 158, 11, 0.1)', text: '#FBBF24', border: 'rgba(245, 158, 11, 0.25)' };
    default:
      return { bg: 'var(--bg-primary)', text: 'var(--text-secondary)', border: 'var(--border-subtle)' };
  }
}

export function InvestigationAuditTrail({
  plateNormalized,
  auditRecords,
  loading,
  onRefresh,
}: InvestigationAuditTrailProps) {
  return (
    <div
      className="netrava-card"
      style={{
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <FileText size={16} color="var(--accent-blue)" />
          <h2
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Investigation Audit Trail ({auditRecords.length})
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              letterSpacing: '0.04em',
            }}
          >
            IMMUTABLE SYSTEM LEDGER
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="btn-secondary"
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                gap: '4px',
              }}
              title="Refresh audit log events"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              <span>Sync</span>
            </button>
          )}
        </div>
      </div>

      {loading && auditRecords.length === 0 ? (
        <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <RefreshCw
            size={18}
            className="animate-spin"
            color="var(--accent-primary)"
            style={{ margin: '0 auto 6px' }}
          />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Retrieving vehicle investigation audit events…
          </div>
        </div>
      ) : auditRecords.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-6)',
            textAlign: 'center',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--text-dim)',
              letterSpacing: '0.08em',
              marginBottom: '4px',
            }}
          >
            NO AUDIT RECORDS FOUND
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            No audit log entries have been committed for plate registration {plateNormalized} yet.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '380px',
            overflowY: 'auto',
          }}
        >
          {auditRecords.map((record, idx) => {
            const style = getActionColor(record.action);
            return (
              <div
                key={record.id || idx}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  fontSize: '11px',
                }}
              >
                {/* Event Top Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-xs)',
                        backgroundColor: style.bg,
                        border: `1px solid ${style.border}`,
                        color: style.text,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {getActionIcon(record.action)}
                      {record.action}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>&bull;</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
                      {record.resource}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                    }}
                  >
                    <Clock size={10} />
                    <span>{new Date(record.ts).toLocaleString('en-IN', { hour12: false })}</span>
                  </div>
                </div>

                {/* Actor & Correlation Info */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '6px',
                    color: 'var(--text-secondary)',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <User size={10} color="var(--text-dim)" />
                    <span style={{ color: 'var(--text-primary)' }}>{record.actor_email}</span>
                    <span style={{ color: 'var(--text-dim)' }}>
                      ({record.actor_role} &bull; {record.actor_department})
                    </span>
                  </div>

                  {record.correlation_id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text-dim)' }}>
                      <Hash size={9} />
                      <span title={`Correlation ID: ${record.correlation_id}`}>
                        ID: {record.correlation_id.substring(0, 8)}…
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
