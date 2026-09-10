'use client';

// ==============================================================================
// Alert Card Component with Lifecycle Triage Controls
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.3, 14.2)
// ==============================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Camera,
  Clock,
  Shield,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AlertItem, AlertSeverity, AlertStatus } from '@/types/alert';
import { alertsApi } from '@/lib/api/alerts';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/lib/auth/context';

interface AlertCardProps {
  alert: AlertItem;
  onStatusUpdated?: (updatedAlert: AlertItem) => void;
}

export function AlertCard({ alert, onStatusUpdated }: AlertCardProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  const role = user?.role;
  const isOperator = role === 'OPERATOR';
  const isInvestigator = role === 'INVESTIGATOR';
  const isAdmin = role === 'SUPER_ADMIN' || role === 'DEPARTMENT_ADMIN';
  const isSuperAdmin = role === 'SUPER_ADMIN';

  // State machine role permissions
  const canAcknowledge =
    alert.status === 'NEW' && (isOperator || isSuperAdmin);
  const canInvestigate =
    alert.status === 'ACKNOWLEDGED' && (isInvestigator || isSuperAdmin);
  const canResolve =
    alert.status === 'INVESTIGATING' && (isInvestigator || isSuperAdmin);
  const canDismiss =
    (alert.status === 'NEW' && (isOperator || isSuperAdmin)) ||
    (alert.status === 'ACKNOWLEDGED' && (isInvestigator || isSuperAdmin)) ||
    (alert.status === 'INVESTIGATING' && (isInvestigator || isSuperAdmin));

  const handleAcknowledge = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await alertsApi.acknowledgeAlert(alert.id);
      if (onStatusUpdated) onStatusUpdated(updated);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to acknowledge alert');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvestigate = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await alertsApi.investigateAlert(alert.id);
      if (onStatusUpdated) onStatusUpdated(updated);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to transition to investigating');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await alertsApi.resolveAlert(alert.id, 'Investigation completed by officer');
      if (onStatusUpdated) onStatusUpdated(updated);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resolve alert');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDismiss = async () => {
    if (!dismissReason.trim()) {
      setErrorMessage('A mandatory dismissal reason is required by police audit policy.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await alertsApi.dismissAlert(alert.id, dismissReason.trim());
      setShowDismissModal(false);
      setDismissReason('');
      if (onStatusUpdated) onStatusUpdated(updated);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dismiss alert');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Border and accent styling based on severity
  const getSeverityStyle = (sev: AlertSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return {
          borderColor: 'var(--status-danger)',
          background: 'rgba(239, 68, 68, 0.05)',
          badgeVariant: 'critical' as const,
        };
      case 'HIGH':
        return {
          borderColor: 'var(--status-warning)',
          background: 'rgba(245, 158, 11, 0.04)',
          badgeVariant: 'warning' as const,
        };
      case 'MEDIUM':
        return {
          borderColor: 'var(--status-info)',
          background: 'rgba(59, 130, 246, 0.03)',
          badgeVariant: 'info' as const,
        };
      case 'LOW':
      default:
        return {
          borderColor: 'var(--border-subtle)',
          background: 'var(--bg-surface)',
          badgeVariant: 'neutral' as const,
        };
    }
  };

  const getStatusBadge = (st: AlertStatus) => {
    switch (st) {
      case 'NEW':
        return <StatusBadge label="NEW" variant="critical" pulse />;
      case 'ACKNOWLEDGED':
        return <StatusBadge label="ACKNOWLEDGED" variant="warning" />;
      case 'INVESTIGATING':
        return <StatusBadge label="INVESTIGATING" variant="info" />;
      case 'RESOLVED':
        return <StatusBadge label="RESOLVED" variant="success" />;
      case 'DISMISSED':
        return <StatusBadge label="DISMISSED" variant="neutral" />;
    }
  };

  const style = getSeverityStyle(alert.severity);
  const plate = alert.watchlist_match?.plate_normalized || alert.sighting?.vehicle?.plate_normalized || 'UNKNOWN';

  return (
    <div
      style={{
        backgroundColor: style.background,
        border: `1px solid ${style.borderColor}`,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        marginBottom: 'var(--space-4)',
        boxShadow: alert.severity === 'CRITICAL' ? '0 0 15px rgba(239, 68, 68, 0.15)' : 'var(--shadow-card)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Top Bar: Severity, Plate, Status, Timestamp */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <StatusBadge label={alert.severity} variant={style.badgeVariant} />
          {getStatusBadge(alert.status)}
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 'var(--text-lg)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.05em',
            }}
          >
            {plate}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <Clock size={13} />
          <span>{new Date(alert.timestamp).toLocaleString()}</span>
        </div>
      </div>

      {/* Main Info: Watchlist & Observation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-3)',
          padding: 'var(--space-3)',
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
            Watchlist Match
          </div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {alert.watchlist_match?.watchlist?.name || 'Police Watchlist'}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--status-danger)', fontWeight: 500, marginTop: '2px' }}>
            {alert.watchlist_match?.category || 'FLAGGED_VEHICLE'}
          </div>
          {alert.watchlist_match?.reason && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
              {alert.watchlist_match.reason}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
            Observed On CCTV
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            <Camera size={14} color="var(--accent-primary)" />
            <span>{alert.sighting?.camera?.name || 'CCTV Camera'}</span>
          </div>
          {alert.sighting?.camera?.location && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
              {alert.sighting.camera.location.address}, {alert.sighting.camera.location.district}
            </div>
          )}
        </div>
      </div>

      {/* Error Message if action fails */}
      {errorMessage && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--status-danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--status-danger)',
            fontSize: 'var(--text-xs)',
            marginBottom: 'var(--space-3)',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Dismissal Reason Note if dismissed */}
      {alert.status === 'DISMISSED' && alert.dismissal_reason && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <strong>Dismissal Reason:</strong> {alert.dismissal_reason}
        </div>
      )}

      {/* Actions & Triage Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          paddingTop: 'var(--space-2)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        {/* Left: Triage State Transitions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {canAcknowledge && (
            <button
              onClick={handleAcknowledge}
              disabled={isSubmitting}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--status-warning)',
                color: '#000',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              Acknowledge
            </button>
          )}

          {canInvestigate && (
            <button
              onClick={handleInvestigate}
              disabled={isSubmitting}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--status-info)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              Open Investigation
            </button>
          )}

          {canResolve && (
            <button
              onClick={handleResolve}
              disabled={isSubmitting}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--status-success)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              Resolve Alert
            </button>
          )}

          {canDismiss && (
            <button
              onClick={() => setShowDismissModal(true)}
              disabled={isSubmitting}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          )}

          {!canAcknowledge && !canInvestigate && !canResolve && !canDismiss && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {alert.status === 'RESOLVED' ? 'Case Resolved' : alert.status === 'DISMISSED' ? 'Dismissed' : 'No pending actions'}
            </span>
          )}
        </div>

        {/* Right: Link to Vehicle Investigation & Detail Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Link
            href={`/vehicles/${plate}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              fontSize: 'var(--text-xs)',
              color: 'var(--accent-primary)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <Search size={13} />
            <span>Investigate Vehicle</span>
            <ArrowRight size={13} />
          </Link>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 'var(--space-1)',
            }}
            title="Toggle Audit & Evidence Details"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Audit & Officer Metadata Panel */}
      {isExpanded && (
        <div
          style={{
            marginTop: 'var(--space-3)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px dashed var(--border-subtle)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          <div>
            <strong>Alert ID:</strong> {alert.id}
          </div>
          <div>
            <strong>Sighting ID:</strong> {alert.sighting?.id || 'N/A'}
          </div>
          <div>
            <strong>Acknowledged By:</strong> {alert.acknowledged_by?.email || 'None'}
          </div>
          <div>
            <strong>Resolved By:</strong> {alert.resolved_by?.email || 'None'}
          </div>
          <div style={{ gridColumn: '1 / -1', marginTop: 'var(--space-1)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Disclaimer: {alert.disclaimer || 'Watchlist plate match does not confirm suspect guilt; corroborating physical evidence required.'}
          </div>
        </div>
      )}

      {/* Dismiss Reason Modal */}
      {showDismissModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
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
              maxWidth: '460px',
              width: '100%',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              Dismiss Alert
            </h3>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
              Gujarat Police compliance policy requires a recorded justification for dismissing flagged vehicle alerts.
            </p>

            <textarea
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Enter official reason (e.g., False positive OCR misread, verified innocent vehicle, resolved FIR)..."
              style={{
                width: '100%',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                marginBottom: 'var(--space-4)',
                resize: 'vertical',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button
                onClick={() => {
                  setShowDismissModal(false);
                  setErrorMessage(null);
                }}
                disabled={isSubmitting}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDismiss}
                disabled={isSubmitting || !dismissReason.trim()}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'var(--status-danger)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: isSubmitting || !dismissReason.trim() ? 0.6 : 1,
                }}
              >
                {isSubmitting ? 'Recording...' : 'Confirm Dismissal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
