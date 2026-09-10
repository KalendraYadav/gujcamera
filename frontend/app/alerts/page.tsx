'use client';

// ==============================================================================
// Live Alerts Feed & Triage Console (Phase 4E)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.1, 8.2: WS /ws/alerts, 14.2)
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BellRing,
  Volume2,
  VolumeX,
  Radio,
  Filter,
  RefreshCw,
  AlertOctagon,
  Shield,
  Activity,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
import { AlertCard } from '@/components/alerts/AlertCard';
import { alertAudioNotifier } from '@/components/alerts/AlertAudioNotifier';
import { AlertWebSocketClient } from '@/lib/websocket/alert-socket';
import { alertsApi } from '@/lib/api/alerts';
import {
  AlertItem,
  AlertSeverity,
  AlertStatus,
  ConnectionStatus,
} from '@/types/alert';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('OFFLINE');
  const [isAudioMuted, setIsAudioMuted] = useState(alertAudioNotifier.getMuted());

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');

  const wsClientRef = useRef<AlertWebSocketClient | null>(null);
  const pollingIntervalRef = useRef<any>(null);

  // Load initial historical alerts from REST
  const loadInitialAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await alertsApi.listAlerts({ limit: 50 });
      setAlerts(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load police alerts feed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle incoming alert from WebSocket
  const handleAlertCreated = useCallback((newAlert: AlertItem) => {
    setAlerts((prev) => {
      // Deduplicate by ID
      if (prev.some((a) => a.id === newAlert.id)) {
        return prev;
      }
      return [newAlert, ...prev];
    });

    // Audio chime for CRITICAL alerts
    if (newAlert.severity === 'CRITICAL') {
      alertAudioNotifier.playCriticalAlert();
    }
  }, []);

  // Handle alert update (e.g. status transition)
  const handleAlertUpdated = useCallback((updatedAlert: AlertItem) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a)),
    );
  }, []);

  // Polling Fallback Manager
  const startPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) return;

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const res = await alertsApi.listAlerts({ limit: 50 });
        if (res.data) {
          setAlerts((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            const newItems = res.data.filter((item) => !existingIds.has(item.id));
            if (newItems.length > 0) {
              return [...newItems, ...prev];
            }
            return prev;
          });
        }
      } catch {
        // Suppress background polling errors
      }
    }, 6000);
  }, []);

  const stopPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Setup WebSocket Connection and Polling Fallback
  useEffect(() => {
    loadInitialAlerts();

    const client = new AlertWebSocketClient({
      onAlertCreated: handleAlertCreated,
      onAlertUpdated: handleAlertUpdated,
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === 'POLLING FALLBACK') {
          startPollingFallback();
        } else if (status === 'LIVE') {
          stopPollingFallback();
        }
      },
      onError: (err) => {
        console.warn('[WS Alert Gateway Error]:', err);
      },
    });

    wsClientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      stopPollingFallback();
    };
  }, [loadInitialAlerts, handleAlertCreated, handleAlertUpdated, startPollingFallback, stopPollingFallback]);

  const toggleAudio = () => {
    const muted = alertAudioNotifier.toggleMute();
    setIsAudioMuted(muted);
  };

  // Filtered Alert List
  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
    return true;
  });

  // Severity counts
  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'NEW').length;
  const highCount = alerts.filter((a) => a.severity === 'HIGH' && a.status === 'NEW').length;

  return (
    <AppShell>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Top Header & Tactical Status Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Live Alert Feed & Triage
              </h1>
              <StatusBadge
                label={connectionStatus}
                variant={
                  connectionStatus === 'LIVE'
                    ? 'success'
                    : connectionStatus === 'RECONNECTING' || connectionStatus === 'POLLING FALLBACK'
                    ? 'warning'
                    : 'critical'
                }
                pulse={connectionStatus === 'LIVE' || connectionStatus === 'RECONNECTING'}
                icon={<Radio size={12} />}
              />
              <SimulatedDataBadge compact />
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Real-time watchlist hit notifications powered by multi-frame ANPR consensus.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {/* Audio Toggle */}
            <button
              onClick={toggleAudio}
              id="alert-sound-toggle-btn"
              title={isAudioMuted ? 'Unmute Critical Alert Sound' : 'Mute Critical Alert Sound'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: isAudioMuted ? 'var(--text-muted)' : 'var(--accent-primary)',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
              }}
            >
              {isAudioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{isAudioMuted ? 'Sound Off' : 'Sound On'}</span>
            </button>

            {/* Refresh */}
            <button
              onClick={loadInitialAlerts}
              id="refresh-alerts-btn"
              disabled={isLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
              }}
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Priority KPI Banners */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: criticalCount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-surface)',
              border: criticalCount > 0 ? '1px solid var(--status-danger)' : '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Active Critical Alerts
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: criticalCount > 0 ? 'var(--status-danger)' : 'var(--text-primary)' }}>
                {criticalCount}
              </div>
            </div>
            <AlertOctagon size={28} color={criticalCount > 0 ? 'var(--status-danger)' : 'var(--text-muted)'} />
          </div>

          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Active High Alerts
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--status-warning)' }}>
                {highCount}
              </div>
            </div>
            <Shield size={28} color="var(--status-warning)" />
          </div>

          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Connection Protocol
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                {connectionStatus === 'LIVE' ? 'Native WebSocket' : connectionStatus}
              </div>
            </div>
            <Activity size={28} color="var(--accent-primary)" />
          </div>
        </div>

        {/* Global Error Notice */}
        {error && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--status-danger)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--status-danger)',
              fontSize: 'var(--text-sm)',
              marginBottom: 'var(--space-6)',
            }}
          >
            {error}
          </div>
        )}

        {/* Filter Controls Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Filter size={14} color="var(--text-muted)" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
              Filters:
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginRight: 'var(--space-2)' }}>
                Status:
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: 'var(--space-1) var(--space-2)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="NEW">NEW</option>
                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="DISMISSED">DISMISSED</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginRight: 'var(--space-2)' }}>
                Severity:
              </label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                style={{
                  padding: 'var(--space-1) var(--space-2)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>
        </div>

        {/* Alerts Stream List */}
        {isLoading ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading live alert telemetry...
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-12)',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface)',
              border: '1px dashed var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--text-muted)',
            }}
          >
            <BellRing size={36} color="var(--text-muted)" style={{ margin: '0 auto var(--space-3)' }} />
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
              No alerts matching current filters
            </div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
              When a CCTV camera detects a vehicle matching an active watchlist, it will appear here in real time.
            </div>
          </div>
        ) : (
          <div>
            {filteredAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onStatusUpdated={handleAlertUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
