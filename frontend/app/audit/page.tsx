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
  if (upper.includes('BREACH') || upper.includes('FAILED') || upper.includes('DELETE') || upper.includes('FAILURE')) {
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
      };
      if (actionFilter) filter.action = actionFilter;
      if (resourceFilter) filter.resource = resourceFilter;

      const response = await auditApi.getAuditLogs(filter);
      let list = response.data || [];
      if (statusFilter) {
        list = list.filter((log) => log.status === statusFilter);
      }
      setLogs(list);
      setTotalPages(response.meta?.totalPages || 1);
      setTotalCount(response.meta?.total || list.length);
    } catch (err: any) {
      setError(err?.message || 'Failed to retrieve immutable audit ledger records.');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, resourceFilter, statusFilter, page]);

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
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Page Header Card */}
        <div
          className="netrava-card"
          style={{
            padding: '16px 20px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'var(--highlight-gradient)',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: '4px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FBBF24',
                    flexShrink: 0,
                  }}
                >
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.01em', margin: 0 }}>
                      System Security &amp; Compliance Audit Trail
                    </h1>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: '#60A5FA',
                        backgroundColor: 'rgba(59, 130, 246, 0.12)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-xs)',
                      }}
                    >
                      IMMUTABLE LEDGER
                    </span>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                    Cryptographically indexed records of officer actions, plate lookups, and evidence chain of custody.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <button
                onClick={fetchLogs}
                disabled={loading}
                className="btn-secondary"
                style={{
                  padding: '6px 14px',
                  fontSize: 'var(--text-sm)',
                  gap: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Refresh Ledger</span>
              </button>
            </div>
          </div>
        </div>

        {/* Accountability & Statutory Governance Banner */}
        <div
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 'var(--radius-xs)',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <Info size={16} color="#60A5FA" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text-primary)' }}>STATUTORY AUDIT GOVERNANCE:</strong> All alert triage dispositions, vehicle license plate lookups, and evidentiary exports are recorded synchronously alongside the authenticated officer badge and client IP. Records are append-only and cryptographically indexed.
          </div>
        </div>

        {/* Filter Toolbar */}
        <div
          className="netrava-card"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={13} color="var(--text-dim)" />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
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
              padding: '4px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              colorScheme: 'dark',
            }}
          >
            <option value="">All Actions</option>
            <option value="USER_LOGIN_SUCCESS">USER_LOGIN_SUCCESS</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="LOGIN_FAILURE">LOGIN_FAILURE</option>
            <option value="VEHICLE_SEARCH">VEHICLE_SEARCH</option>
            <option value="VEHICLE_DETAIL_VIEW">VEHICLE_DETAIL_VIEW</option>
            <option value="VEHICLE_TIMELINE_SEARCH">VEHICLE_TIMELINE_SEARCH</option>
            <option value="ALERT_STATUS_CHANGED">ALERT_STATUS_CHANGED</option>
            <option value="EVIDENCE_EXPORTED">EVIDENCE_EXPORTED</option>
            <option value="EVIDENCE_TAMPER_ALERT">EVIDENCE_TAMPER_ALERT</option>
            <option value="WATCHLIST_PLATE_ADDED">WATCHLIST_PLATE_ADDED</option>
            <option value="SYSTEM_INITIALIZATION">SYSTEM_INITIALIZATION</option>
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
              padding: '4px 10px',
              fontSize: '11px',
              colorScheme: 'dark',
            }}
          >
            <option value="">All Resources</option>
            <option value="Vehicle">Vehicle</option>
            <option value="Auth">Auth</option>
            <option value="Alert">Alert</option>
            <option value="Evidence">Evidence</option>
            <option value="Watchlist">Watchlist</option>
            <option value="Camera">Camera</option>
            <option value="System">System</option>
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
              padding: '4px 10px',
              fontSize: '11px',
              colorScheme: 'dark',
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
                color: 'var(--accent-blue)',
                fontSize: '11px',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontWeight: 600,
              }}
            >
              Reset Filters
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            Showing {logs.length} of {totalCount} events
          </div>
        </div>

        {/* Content View */}
        {loading ? (
          <div className="netrava-card" style={{ padding: 'var(--space-10)' }}>
            <LoadingState message="Retrieving compliance audit records..." />
          </div>
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
            className="netrava-card"
            style={{
              overflow: 'hidden',
            }}
          >
            <table
              id="audit-logs-table"
              className="netrava-table"
            >
              <thead>
                <tr>
                  <th style={{ padding: '10px 14px' }}>Timestamp</th>
                  <th style={{ padding: '10px 14px' }}>Action</th>
                  <th style={{ padding: '10px 14px' }}>Officer / Actor</th>
                  <th style={{ padding: '10px 14px' }}>Resource Target</th>
                  <th style={{ padding: '10px 14px' }}>Origin IP</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '11px' }}>
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <StatusBadge
                        label={log.action}
                        variant={getActionBadgeVariant(log.action)}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {log.user ? (
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>
                            {log.user.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            Badge: {log.user.badge_number} &bull; {log.user.role}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          System Pipeline
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '12px' }}>
                        {log.resource_type}
                      </div>
                      {log.resource_id && (
                        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                          {log.resource_id.length > 18 ? `${log.resource_id.substring(0, 18)}...` : log.resource_id}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: '11px' }}>
                      {log.ip_address || 'Internal RPC'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          color: log.status === 'SUCCESS' ? 'var(--status-success)' : 'var(--status-critical)',
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="btn-secondary"
                        style={{
                          padding: '3px 10px',
                          fontSize: '11px',
                          color: 'var(--accent-blue)',
                          borderColor: 'var(--accent-blue-border)',
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--bg-primary)',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '11px',
                color: 'var(--text-muted)',
              }}
            >
              <div>
                Page <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{page}</span> of{' '}
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{totalPages}</span>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    opacity: page <= 1 ? 0.4 : 1,
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ChevronLeft size={13} />
                  <span>Previous</span>
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-secondary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    opacity: page >= totalPages ? 0.4 : 1,
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span>Next</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Audit Event Payload Inspector Modal */}
        {selectedLog && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'var(--bg-overlay)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 'var(--space-4)',
            }}
          >
            <div
              className="netrava-card"
              style={{
                maxWidth: '640px',
                width: '100%',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: 'var(--shadow-elevated)',
                padding: 'var(--space-5)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-4)',
                  paddingBottom: 'var(--space-3)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <FileCode size={18} color="var(--accent-blue)" />
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Audit Event Payload Inspector
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Event ID:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{selectedLog.id}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Action:</span>
                  <span>
                    <StatusBadge label={selectedLog.action} variant={getActionBadgeVariant(selectedLog.action)} size="sm" />
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Officer Identity:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {selectedLog.user ? `${selectedLog.user.name} (${selectedLog.user.badge_number})` : 'System Pipeline'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>IP / Socket:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{selectedLog.ip_address || 'Internal RPC'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Timestamp:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{selectedLog.timestamp}</span>
                </div>

                <div style={{ marginTop: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 'var(--space-1)', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>
                    Cryptographic Payload &amp; Context:
                  </span>
                  <pre
                    style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-xs)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      overflowX: 'auto',
                      maxHeight: '220px',
                    }}
                  >
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="btn-secondary"
                  style={{
                    padding: '6px 16px',
                    fontSize: 'var(--text-xs)',
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
