'use client';

// ==============================================================================
// Live Alerts Feed & Triage Console (Phase 4E)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.1, 8.2: WS /ws/alerts, 14.2)
// Visual Language: Kit8 / Anton Fritsler Police Operations System
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

    // Audio chime for CRITICAL alerts (suppressed for historical backfill matches)
    if (
      newAlert.severity === 'CRITICAL' &&
      !newAlert.is_historical &&
      newAlert.match_type !== 'HISTORICAL_BACKFILL'
    ) {
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
      } catch (err) {
        console.error('Alert polling fallback error:', err);
      }
    }, 5000);
  }, []);

  const stopPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Setup WebSocket Client lifecycle
  useEffect(() => {
    loadInitialAlerts();

    const wsClient = new AlertWebSocketClient({
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
    });

    wsClientRef.current = wsClient;
    wsClient.connect();

    return () => {
      wsClient.disconnect();
      stopPollingFallback();
    };
  }, [handleAlertCreated, handleAlertUpdated, loadInitialAlerts, startPollingFallback, stopPollingFallback]);

  // Audio mute toggle
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

  // Active alert severity counts (NEW, ACKNOWLEDGED, INVESTIGATING per Section 6.3)
  const isAlertActive = (status: string) => status !== 'RESOLVED' && status !== 'DISMISSED';
  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL' && isAlertActive(a.status)).length;
  const highCount = alerts.filter((a) => a.severity === 'HIGH' && isAlertActive(a.status)).length;

  return (
    <AppShell>
      <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Top Header & Tactical Status Bar */}
        <div
          className="netrava-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            padding: '14px 20px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BellRing size={15} color="#F87171" />
              </div>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.01em', margin: 0 }}>
                Live Alert Feed & Triage
              </h1>
              <StatusBadge
                status={connectionStatus === 'LIVE' ? 'ONLINE' : connectionStatus === 'RECONNECTING' || connectionStatus === 'POLLING FALLBACK' ? 'DEGRADED' : 'OFFLINE'}
                label={connectionStatus}
                size="sm"
              />
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
              Real-time watchlist hits and ANPR detection alerts.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Audio Toggle */}
            <button
              onClick={toggleAudio}
              id="alert-sound-toggle-btn"
              title={isAudioMuted ? 'Unmute Critical Alert Sound' : 'Mute Critical Alert Sound'}
              className="btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: 'var(--text-sm)',
              }}
            >
              {isAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} color="#60A5FA" />}
              <span>{isAudioMuted ? 'Sound Muted' : 'Sound Active'}</span>
            </button>

            {/* Refresh */}
            <button
              onClick={loadInitialAlerts}
              id="refresh-alerts-btn"
              disabled={isLoading}
              className="btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: 'var(--text-sm)',
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
            gap: 'var(--space-3)',
          }}
        >
          <div
            className="netrava-card"
            style={{
              padding: '14px 16px',
              borderLeft: criticalCount > 0 ? '3px solid #EF4444' : '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: '88px',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>
                Active Critical Alerts
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: criticalCount > 0 ? '#F87171' : 'var(--text-primary)' }}>
                {criticalCount}
              </div>
            </div>
            <AlertOctagon size={22} color={criticalCount > 0 ? '#F87171' : 'var(--text-dim)'} />
          </div>

          <div
            className="netrava-card"
            style={{
              padding: '14px 16px',
              borderLeft: highCount > 0 ? '3px solid #F59E0B' : '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: '88px',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>
                Active High Alerts
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: highCount > 0 ? '#FBBF24' : 'var(--text-primary)' }}>
                {highCount}
              </div>
            </div>
            <Shield size={22} color={highCount > 0 ? '#FBBF24' : 'var(--text-dim)'} />
          </div>

          <div
            className="netrava-card"
            style={{
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: '88px',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>
                Connection Protocol
              </div>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                {connectionStatus === 'LIVE' ? 'Native WebSocket' : connectionStatus}
              </div>
            </div>
            <Activity size={22} color="#60A5FA" />
          </div>
        </div>

        {/* Global Error Notice */}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(215, 25, 63, 0.1)',
              border: '1px solid rgba(215, 25, 63, 0.3)',
              borderRadius: '6px',
              color: 'var(--accent-primary)',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        {/* Filter Controls Bar */}
        <div
          className="netrava-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '10px 16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={13} color="var(--text-muted)" />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Filters:
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Status:
              </label>
              <select
                id="alert-status-filter"
                className="netrava-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Severity:
              </label>
              <select
                id="alert-severity-filter"
                className="netrava-input"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
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
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            Loading live alert telemetry...
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div
            className="netrava-card"
            style={{
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              No Active Watchlist Matches
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              No alerts match the selected status or severity filters.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
