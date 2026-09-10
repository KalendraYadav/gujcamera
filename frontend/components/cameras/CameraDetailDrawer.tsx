'use client';

import React, { useEffect, useRef } from 'react';
import {
  X,
  Camera as CameraIcon,
  MapPin,
  Activity,
  Server,
  Shield,
  Clock,
  Radio,
  Copy,
  Check,
  ExternalLink,
  WifiOff,
  AlertTriangle,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { Camera, OperationalStatus } from '@/types/camera';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';

interface CameraDetailDrawerProps {
  camera: Camera | null;
  onClose: () => void;
  onCenterOnMap?: (lat: number, long: number) => void;
}

export function CameraDetailDrawer({ camera, onClose, onCenterOnMap }: CameraDetailDrawerProps) {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap / auto-focus on open
  useEffect(() => {
    if (camera && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [camera]);

  if (!camera) return null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getStatusBadgeVariant = (status: OperationalStatus): BadgeVariant => {
    switch (status) {
      case 'ONLINE':
        return 'success';
      case 'DEGRADED':
        return 'warning';
      case 'OFFLINE':
        return 'offline';
      case 'ERROR':
        return 'critical';
      case 'CONNECTING':
        return 'info';
      default:
        return 'neutral';
    }
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return 'No heartbeat recorded';
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'Asia/Kolkata',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-detail-title"
      tabIndex={-1}
      ref={drawerRef}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '440px',
        maxWidth: '100vw',
        backgroundColor: 'var(--bg-card)',
        borderLeft: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        outline: 'none',
        animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
              flexShrink: 0,
              marginTop: '2px',
            }}
          >
            <CameraIcon size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' }}>
              <StatusBadge
                label={camera.operational_status}
                variant={getStatusBadgeVariant(camera.operational_status)}
                pulse={camera.operational_status === 'ONLINE'}
              />
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'var(--bg-surface)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {camera.protocol}
              </span>
            </div>
            <h3
              id="camera-detail-title"
              style={{
                fontSize: 'var(--text-md)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
              }}
            >
              {camera.name}
            </h3>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Close camera details"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 'var(--space-1)',
            borderRadius: 'var(--radius-xs)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <X size={20} />
        </button>
      </div>

      {/* Drawer Body - Scrollable */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        {/* Section 1: Location & GIS */}
        <section
          aria-labelledby="section-location-title"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
          }}
        >
          <div
            id="section-location-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <MapPin size={14} color="var(--accent-primary)" />
            <span>Physical Location & GIS Coordinates</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Physical Address</div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)' }}>
                {camera.location?.address || 'Street address unassigned'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: '4px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Police Zone</div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {camera.location?.zone || 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>District</div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {camera.location?.district || 'N/A'}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  WGS-84 Coordinates
                </div>
                <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {camera.lat.toFixed(6)}, {camera.long.toFixed(6)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  onClick={() => copyToClipboard(`${camera.lat},${camera.long}`, 'coords')}
                  title="Copy Coordinates"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                  }}
                >
                  {copiedField === 'coords' ? <Check size={12} color="var(--status-success)" /> : <Copy size={12} />}
                  <span>{copiedField === 'coords' ? 'Copied' : 'Copy'}</span>
                </button>

                {onCenterOnMap && (
                  <button
                    onClick={() => onCenterOnMap(camera.lat, camera.long)}
                    title="Center view on map"
                    style={{
                      background: 'var(--accent-subtle)',
                      border: '1px solid var(--accent-border)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-xs)',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={12} />
                    <span>Fly To</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Department & Authority */}
        <section
          aria-labelledby="section-dept-title"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
          }}
        >
          <div
            id="section-dept-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <Shield size={14} color="var(--accent-primary)" />
            <span>Jurisdiction & Registry Authority</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Assigned Department</div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {camera.department_name || 'Gujarat Police Headquarters'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: '4px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Active Status</div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: camera.is_active ? 'var(--status-success)' : 'var(--status-critical)' }}>
                  {camera.is_active ? 'Operational (Active)' : 'Decommissioned'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Registered Since</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {new Date(camera.created_at).toLocaleDateString('en-IN')}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-2)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Camera UUID</div>
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <span>{camera.id}</span>
                <button
                  onClick={() => copyToClipboard(camera.id, 'uuid')}
                  title="Copy UUID"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {copiedField === 'uuid' ? <Check size={11} color="var(--status-success)" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Streams & Hardware Configuration */}
        <section
          aria-labelledby="section-stream-title"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
          }}
        >
          <div
            id="section-stream-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <Server size={14} color="var(--accent-primary)" />
            <span>Hardware & Stream Configuration</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Protocol</div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {camera.protocol}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Connector ID</div>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={camera.connector_type_id}
                >
                  {camera.connector_type_id.substring(0, 12)}...
                </div>
              </div>
            </div>

            {/* Stream List */}
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                Registered Video Streams ({camera.streams?.length || 0})
              </div>

              {camera.streams && camera.streams.length > 0 ? (
                camera.streams.map((stream, idx) => (
                  <div
                    key={stream.id || idx}
                    style={{
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--bg-card)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-default)',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--accent-primary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {stream.resolution} @ {stream.fps} FPS
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          padding: '1px 5px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {stream.codec}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                        wordBreak: 'break-all',
                        backgroundColor: 'var(--bg-surface)',
                        padding: '4px 6px',
                        borderRadius: 'var(--radius-xs)',
                      }}
                    >
                      {stream.url_or_handle}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No video stream handles registered for this camera.
                </div>
              )}
            </div>

            {/* Phase 4B Notice: No Live Video Yet */}
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'flex-start',
                padding: 'var(--space-3)',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Radio size={14} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--accent-primary)' }}>Live Video Preview Disabled:</strong> Live HLS
                matrix playback and multi-camera feeds are scheduled for delivery in <strong>Phase 4C</strong>.
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Telemetry & Equipment Health */}
        <section
          aria-labelledby="section-health-title"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
          }}
        >
          <div
            id="section-health-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <Activity size={14} color="var(--accent-primary)" />
            <span>Equipment Health & Telemetry</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Measured FPS
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-md)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: camera.health?.fps_actual ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {camera.health?.fps_actual !== null && camera.health?.fps_actual !== undefined
                    ? `${camera.health.fps_actual} fps`
                    : 'N/A'}
                </div>
              </div>

              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Packet Loss
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-md)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color:
                      camera.health?.packet_loss !== null && camera.health?.packet_loss !== undefined
                        ? camera.health.packet_loss > 5
                          ? 'var(--status-critical)'
                          : 'var(--status-success)'
                        : 'var(--text-muted)',
                  }}
                >
                  {camera.health?.packet_loss !== null && camera.health?.packet_loss !== undefined
                    ? `${camera.health.packet_loss}%`
                    : '0.0%'}
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: '2px' }}>
                <Clock size={12} color="var(--text-muted)" />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last Registered Heartbeat</span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {formatTimestamp(camera.health?.last_heartbeat)}
              </div>
            </div>

            {/* Architecture Governance Note */}
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'flex-start',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <AlertTriangle size={13} color="var(--status-warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                <strong>Source-of-Truth Note:</strong> Health metrics represent registered equipment telemetry and
                heartbeat updates in PostgreSQL. They do not constitute proof that an active RTSP TCP socket is currently open.
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Drawer Footer */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-5)',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          GUJ-CCTV-P4B
        </span>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link
            href={`/live?camera=${encodeURIComponent(camera.name)}`}
            data-testid="drawer-watch-live-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--accent-primary)',
              borderRadius: 'var(--radius-sm)',
              color: '#ffffff',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <Video size={13} />
            Watch Live Feed
          </Link>
          <button
            onClick={onClose}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}
