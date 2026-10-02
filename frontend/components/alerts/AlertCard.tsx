'use client';

// ==============================================================================
// Alert Card Component with Lifecycle Triage Controls
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.3, 14.2)
// Visual Language: Kit8 / Anton Fritsler Police Operations System
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
import { hasRoleAccess } from '@/lib/auth/rbac';

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

  // Vehicle investigation authorization: INVESTIGATOR, DEPARTMENT_ADMIN, SUPER_ADMIN
  const canInvestigateVehicle = hasRoleAccess(user?.role, ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR']);

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

  // Border and accent styling based on severity (controlled, not garish)
  const getSeverityStyle = (sev: AlertSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return {
          leftBorder: '3px solid var(--accent-primary)',
          badgeVariant: 'critical' as const,
        };
      case 'HIGH':
        return {
          leftBorder: '3px solid var(--status-warning)',
          badgeVariant: 'warning' as const,
        };
      case 'MEDIUM':
        return {
          leftBorder: '3px solid var(--accent-blue)',
          badgeVariant: 'info' as const,
        };
      case 'LOW':
      default:
        return {
          leftBorder: '3px solid var(--border-default)',
          badgeVariant: 'neutral' as const,
        };
    }
  };

  const getStatusBadge = (st: AlertStatus) => {
    switch (st) {
      case 'NEW':
        return <StatusBadge label="NEW" variant="critical" pulse size="sm" />;
      case 'ACKNOWLEDGED':
        return <StatusBadge label="ACKNOWLEDGED" variant="warning" size="sm" />;
      case 'INVESTIGATING':
        return <StatusBadge label="INVESTIGATING" variant="info" size="sm" />;
      case 'RESOLVED':
        return <StatusBadge label="RESOLVED" variant="success" size="sm" />;
      case 'DISMISSED':
        return <StatusBadge label="DISMISSED" variant="neutral" size="sm" />;
    }
  };

  const style = getSeverityStyle(alert.severity);
  const plate = alert.watchlist_match?.plate_normalized || alert.sighting?.vehicle?.plate_normalized || 'UNKNOWN';

  return (
    <div
      className="netrava-card"
      style={{
        borderLeft: style.leftBorder,
        padding: '16px 18px',
        marginBottom: '10px',
      }}
    >
      {/* Top Bar: Severity, Plate, Status, Timestamp */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <StatusBadge label={alert.severity} variant={style.badgeVariant} size="sm" />
          {getStatusBadge(alert.status)}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.08em',
              padding: '2px 8px',
              backgroundColor: 'rgba(5, 8, 15, 0.7)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
            }}
          >
            {plate}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          <Clock size={12} color="var(--accent-blue)" />
          <span>{new Date(alert.timestamp).toLocaleString('en-IN', { hour12: false })}</span>
        </div>
      </div>

      {/* Main Info: Watchlist & Observation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '12px',
          marginBottom: '12px',
          padding: '12px 14px',
          backgroundColor: 'rgba(5, 8, 15, 0.5)',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px', fontWeight: 700 }}>
            Watchlist Match
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {alert.watchlist_match?.watchlist?.name || 'Police Watchlist'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 700, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            {alert.watchlist_match?.category || 'FLAGGED_VEHICLE'}
          </div>
          {alert.watchlist_match?.reason && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {alert.watchlist_match.reason}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px', fontWeight: 700 }}>
            Observed On CCTV
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
            <Camera size={13} color="var(--accent-blue)" />
            <span>{alert.sighting?.camera?.name || 'CCTV Camera'}</span>
          </div>
          {alert.sighting?.camera?.location && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {alert.sighting.camera.location.address}, {alert.sighting.camera.location.district}
            </div>
          )}
        </div>
      </div>

      {/* Error Message if action fails */}
      {errorMessage && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(215, 25, 63, 0.1)',
            border: '1px solid rgba(215, 25, 63, 0.3)',
            borderRadius: '4px',
            color: 'var(--accent-primary)',
            fontSize: '11px',
            marginBottom: '10px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Dismissal Reason Note if dismissed */}
      {alert.status === 'DISMISSED' && alert.dismissal_reason && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '10px',
          }}
        >
          <strong>Dismissal Reason:</strong> {alert.dismissal_reason}
        </div>
      )}

      {/* Action Rail: Triage Workflow */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          marginTop: '6px',
        }}
      >
        {/* Left: Triage Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {canAcknowledge && (
            <button
              onClick={handleAcknowledge}
              disabled={isSubmitting}
              className="btn-primary"
              style={{
                height: '30px',
                padding: '0 12px',
                fontSize: '11px',
                letterSpacing: '0.03em',
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
              className="btn-secondary"
              style={{
                height: '30px',
                padding: '0 12px',
                fontSize: '11px',
                letterSpacing: '0.03em',
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
                height: '30px',
                padding: '0 12px',
                backgroundColor: 'var(--status-success-bg)',
                color: 'var(--status-success)',
                border: '1px solid var(--status-success-border)',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.03em',
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
              className="btn-secondary"
              style={{
                height: '30px',
                padding: '0 12px',
                fontSize: '11px',
              }}
            >
              Dismiss
            </button>
          )}

          {!canAcknowledge && !canInvestigate && !canResolve && !canDismiss && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {alert.status === 'RESOLVED' ? 'Case Resolved' : alert.status === 'DISMISSED' ? 'Dismissed' : 'No pending actions'}
            </span>
          )}
        </div>

        {/* Right: Link to Vehicle Investigation & Detail Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {canInvestigateVehicle && (
            <Link
              href={`/vehicles/${plate}`}
              id={`investigate-vehicle-${alert.id}`}
              className="btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                textDecoration: 'none',
                padding: '5px 10px',
              }}
            >
              <Search size={12} color="var(--accent-blue)" />
              <span>Investigate Vehicle</span>
              <ArrowRight size={12} />
            </Link>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            id={`toggle-alert-detail-${alert.id}`}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '5px 8px',
            }}
            title="Toggle Audit & Evidence Details"
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Audit & Officer Metadata Panel */}
      {isExpanded && (
        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '8px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div>
            <strong>Alert ID:</strong> <span style={{ color: 'var(--text-secondary)' }}>{alert.id}</span>
          </div>
          <div>
            <strong>Sighting ID:</strong> <span style={{ color: 'var(--text-secondary)' }}>{alert.sighting?.id || 'N/A'}</span>
          </div>
          <div>
            <strong>Acknowledged By:</strong> <span style={{ color: 'var(--text-secondary)' }}>{alert.acknowledged_by?.email || 'None'}</span>
          </div>
          <div>
            <strong>Resolved By:</strong> <span style={{ color: 'var(--text-secondary)' }}>{alert.resolved_by?.email || 'None'}</span>
          </div>
          <div style={{ gridColumn: '1 / -1', marginTop: '4px', color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'var(--font-sans)' }}>
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
            backgroundColor: 'rgba(5, 8, 15, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            className="netrava-card"
            style={{
              padding: '24px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', margin: 0 }}>
              Mandatory Dismissal Reason
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', marginTop: '6px' }}>
              Per Gujarat Police Audit Regulation, all dismissed watchlist hits must have a documented reason recorded in the immutable audit ledger.
            </p>

            <textarea
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g., False positive plate OCR read, authorized vehicle convoy..."
              rows={3}
              className="netrava-input"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '12px',
                resize: 'none',
                marginBottom: '16px',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowDismissModal(false);
                  setDismissReason('');
                }}
                disabled={isSubmitting}
                className="btn-secondary"
                style={{
                  padding: '7px 14px',
                  fontSize: '12px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDismiss}
                disabled={isSubmitting || !dismissReason.trim()}
                className="btn-primary"
                style={{
                  padding: '7px 16px',
                  fontSize: '12px',
                  opacity: isSubmitting || !dismissReason.trim() ? 0.5 : 1,
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
