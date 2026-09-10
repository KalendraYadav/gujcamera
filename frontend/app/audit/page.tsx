'use client';

// ==============================================================================
// Audit Trail Viewer — /audit
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.2 & Section 14.2)
//
// Read-only immutable audit trail viewer for System Auditors & Administrators.
// Provides accountability, chain-of-custody tracking, and operational oversight.
// ==============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Activity,
  Layers,
  FileCode,
  X,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { auditApi } from '@/lib/api/audit';
import { AuditLogItem, AuditQueryFilter } from '@/types/audit';

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function getActionBadgeVariant(action: string): BadgeVariant {
  const upper = action.toUpperCase();
  if (upper.includes('BREACH') || upper.includes('FAILED') || upper.includes('DELETE')) {
    return 'critical';
  }
  if (upper.includes('EXPORT') || upper.includes('STATUS') || upper.includes('DISMISS')) {
    return 'warning';
  }
  if (upper.includes('LOGIN') || upper.includes('VERIFIED') || upper.includes('SUCCESS')) {
    return 'success';
  }
  return 'info';
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('');
  const [resourceFilter, setResourceFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filter: AuditQueryFilter = {
        page,
        limit: 15,
        sort_order: 'desc',
      };
      if (actionFilter) filter.action = actionFilter;
      if (resourceFilter) filter.resource_type = resourceFilter;
      if (statusFilter) filter.status = statusFilter;

      const response = await auditApi.getAuditLogs(filter);
      setLogs(response.data || []);
      setTotalPages(response.meta?.totalPages || 1);
      setTotalCount(response.meta?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve audit trail records.');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, resourceFilter, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClearFilters = () => {
    setActionFilter('');
    setResourceFilter('');
    setStatusFilter('');
    setPage(1);
  };

  return (
    <AppShell>
      <div style={{ padding: 'var(--space-6)', maxWidth: '1440px', margin: '0 auto' }}>
        {/* Header section */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <ShieldCheck size={24} color="var(--accent-primary)" />
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                System Security & Compliance Audit Trail
              </h1>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
              Immutable legal audit logs tracking officer actions, alert status transitions, and evidence access.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <SimulatedDataBadge />
            <button
              id="refresh-audit-btn"
              onClick={fetchLogs}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Accountability notice */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <Info size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            <strong>STATUTORY AUDIT GOVERNANCE:</strong> In compliance with Section 7.2 of the master architecture and police oversight standards, every alert triage decision, vehicle lookup, and evidence package export is recorded synchronously with officer credentials. These records are write-once and cryptographically indexed.
          </div>
        </div>

        {/* Filter bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Filter size={14} color="var(--text-muted)" />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Filters:
            </span>
          </div>

          {/* Action Filter */}
          <select
            id="audit-action-filter"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: 'var(--space-1) var(--space-2)',
              fontSize: 'var(--text-xs)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">All Actions</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="LOGIN_FAILURE">LOGIN_FAILURE</option>
            <option value="ALERT_STATUS_CHANGED">ALERT_STATUS_CHANGED</option>
            <option value="VEHICLE_DETAIL_VIEW">VEHICLE_DETAIL_VIEW</option>
            <option value="VEHICLE_TIMELINE_SEARCH">VEHICLE_TIMELINE_SEARCH</option>
            <option value="EVIDENCE_EXPORTED">EVIDENCE_EXPORTED</option>
            <option value="EVIDENCE_TAMPER_ALERT">EVIDENCE_TAMPER_ALERT</option>
            <option value="WATCHLIST_PLATE_ADDED">WATCHLIST_PLATE_ADDED</option>
          </select>

          {/* Resource Filter */}
          <select
            id="audit-resource-filter"
            value={resourceFilter}
            onChange={(e) => {
              setResourceFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: 'var(--space-1) var(--space-2)',
              fontSize: 'var(--text-xs)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">All Resources</option>
            <option value="Alert">Alert</option>
            <option value="Evidence">Evidence</option>
            <option value="Vehicle">Vehicle</option>
            <option value="Watchlist">Watchlist</option>
            <option value="Auth">Auth</option>
          </select>

          {/* Status Filter */}
          <select
            id="audit-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: 'var(--space-1) var(--space-2)',
              fontSize: 'var(--text-xs)',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="FAILURE">FAILURE</option>
          </select>

          {(actionFilter || resourceFilter || statusFilter) && (
            <button
              onClick={handleClearFilters}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Reset Filters
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Showing {logs.length} of {totalCount} events
          </div>
        </div>

        {/* Content View */}
        {loading ? (
          <LoadingState message="Retrieving compliance audit records..." />
        ) : error ? (
          <ErrorState
            title="Failed to Load Audit Logs"
            message={error}
            onRetry={fetchLogs}
          />
        ) : logs.length === 0 ? (
          <EmptyState
            title="No Audit Records Found"
            message="No system activity matches the current filter criteria."
            action={{
              label: 'Reset Filters',
              onClick: handleClearFilters,
            }}
          />
        ) : (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <table
              id="audit-logs-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontSize: '10px',
                  }}
                >
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Timestamp</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Action</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Actor / Officer</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Resource</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>IP Address</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Status</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background-color var(--transition-fast)',
                    }}
                  >
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <StatusBadge
                        label={log.action}
                        variant={getActionBadgeVariant(log.action)}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      {log.user ? (
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {log.user.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            Badge: {log.user.badge_number} • {log.user.role}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>System Pipeline</span>
                      )}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {log.resource_type}
                      </div>
                      {log.resource_id && (
                        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {log.resource_id.length > 18 ? `${log.resource_id.substring(0, 18)}...` : log.resource_id}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {log.ip_address || '—'}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: log.status === 'SUCCESS' ? 'var(--status-success)' : 'var(--status-critical)',
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedLog(log)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          color: 'var(--accent-primary)',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--bg-surface-elevated)',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  id="audit-prev-page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: page <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  id="audit-next-page"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Audit Log Details & Diff Inspector */}
        {selectedLog && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 'var(--space-4)',
            }}
          >
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                maxWidth: '680px',
                width: '100%',
                maxHeight: '90vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Modal header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-4)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <FileCode size={18} color="var(--accent-primary)" />
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
                    Audit Event Payload Inspector
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div style={{ padding: 'var(--space-4)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Event ID: </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLog.id}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Timestamp: </span>
                    <span>{formatTimestamp(selectedLog.timestamp)}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Action: </span>
                    <strong>{selectedLog.action}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Resource: </span>
                    <span>{selectedLog.resource_type} ({selectedLog.resource_id || 'Global'})</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Officer: </span>
                    <span>{selectedLog.user?.name || 'System'} ({selectedLog.user?.badge_number || 'N/A'})</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>IP / Source: </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedLog.ip_address || 'Internal Service'}</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Raw Context & Payload Details
                  </div>
                  <pre
                    style={{
                      backgroundColor: 'var(--bg-base)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 'var(--space-3)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                      overflowX: 'auto',
                      maxHeight: '300px',
                    }}
                  >
                    {JSON.stringify(selectedLog.details, null, 2) || '// No additional payload metadata'}
                  </pre>
                </div>
              </div>

              {/* Modal footer */}
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{
                    padding: 'var(--space-2) var(--space-4)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
