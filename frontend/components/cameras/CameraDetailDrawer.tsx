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
        width: '450px',
        maxWidth: '100vw',
        backgroundColor: 'rgba(11, 17, 32, 0.98)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-modal)',
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
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(5, 8, 15, 0.6)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              backgroundColor: 'rgba(215, 25, 63, 0.12)',
              border: '1px solid rgba(215, 25, 63, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
              flexShrink: 0,
              marginTop: '2px',
            }}
          >
            <CameraIcon size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <StatusBadge
                status={camera.operational_status}
                label={camera.operational_status}
                size="sm"
              />
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {camera.protocol}
              </span>
            </div>
            <h3
              id="camera-detail-title"
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1.3,
                margin: 0,
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
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <X size={18} />
        </button>
      </div>

      {/* Drawer Body - Scrollable */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Section 1: Location & GIS */}
        <section
          aria-labelledby="section-location-title"
          className="netrava-card"
          style={{
            padding: '14px 16px',
          }}
        >
          <div
            id="section-location-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              marginBottom: '12px',
            }}
          >
            <MapPin size={14} color="var(--accent-blue)" />
            <span>Physical Location & GIS Coordinates</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Physical Address</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                {camera.location?.address || 'Street address unassigned'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Police Zone</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {camera.location?.zone || 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>District</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {camera.location?.district || 'N/A'}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '8px',
                padding: '8px 12px',
                backgroundColor: 'rgba(5, 8, 15, 0.6)',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  WGS-84 Coordinates
                </div>
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: '2px' }}>
                  {camera.lat.toFixed(6)}, {camera.long.toFixed(6)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => copyToClipboard(`${camera.lat},${camera.long}`, 'coords')}
                  title="Copy Coordinates"
                  className="btn-secondary"
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedField === 'coords' ? <Check size={12} color="var(--status-success)" /> : <Copy size={12} />}
                  <span>{copiedField === 'coords' ? 'Copied' : 'Copy'}</span>
                </button>

                {onCenterOnMap && (
                  <button
                    onClick={() => onCenterOnMap(camera.lat, camera.long)}
                    title="Center view on map"
                    className="btn-secondary"
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
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
          className="netrava-card"
          style={{
            padding: '14px 16px',
          }}
        >
          <div
            id="section-dept-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              marginBottom: '12px',
            }}
          >
            <Shield size={14} color="var(--accent-blue)" />
            <span>Jurisdiction & Registry Authority</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assigned Department</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                {camera.department_name || 'Gujarat Police Headquarters'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Status</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: camera.is_active ? 'var(--status-success)' : 'var(--status-critical)', marginTop: '2px' }}>
                  {camera.is_active ? 'Operational (Active)' : 'Decommissioned'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registered Since</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {new Date(camera.created_at).toLocaleDateString('en-IN')}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '4px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Camera UUID</div>
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '2px',
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
          className="netrava-card"
          style={{
            padding: '14px 16px',
          }}
        >
          <div
            id="section-stream-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              marginBottom: '12px',
            }}
          >
            <Server size={14} color="var(--accent-primary)" />
            <span>Hardware & Stream Configuration</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Protocol</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {camera.protocol}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Connector ID</div>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}
                  title={camera.connector_type_id}
                >
                  {camera.connector_type_id.substring(0, 12)}...
                </div>
              </div>
            </div>

            {/* Stream List */}
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                Registered Video Streams ({camera.streams?.length || 0})
              </div>

              {camera.streams && camera.streams.length > 0 ? (
                camera.streams.map((stream, idx) => (
                  <div
                    key={stream.id || idx}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: 'rgba(5, 8, 15, 0.6)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      marginBottom: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--accent-blue)',
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
                          borderRadius: '3px',
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
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
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {stream.url_or_handle}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No video stream handles registered for this camera.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 4: Telemetry & Equipment Health */}
        <section
          aria-labelledby="section-health-title"
          className="netrava-card"
          style={{
            padding: '14px 16px',
          }}
        >
          <div
            id="section-health-title"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              marginBottom: '12px',
            }}
          >
            <Activity size={14} color="var(--accent-blue)" />
            <span>Equipment Health & Telemetry</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(5, 8, 15, 0.6)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Measured FPS
                </div>
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: camera.health?.fps_actual ? 'var(--text-primary)' : 'var(--text-muted)',
                    marginTop: '2px',
                  }}
                >
                  {camera.health?.fps_actual !== null && camera.health?.fps_actual !== undefined
                    ? `${camera.health.fps_actual} fps`
                    : 'N/A'}
                </div>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(5, 8, 15, 0.6)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Packet Loss
                </div>
                <div
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color:
                      camera.health?.packet_loss !== null && camera.health?.packet_loss !== undefined
                        ? camera.health.packet_loss > 5
                          ? 'var(--status-critical)'
                          : 'var(--status-success)'
                        : 'var(--text-muted)',
                    marginTop: '2px',
                  }}
                >
                  {camera.health?.packet_loss !== null && camera.health?.packet_loss !== undefined
                    ? `${camera.health.packet_loss}%`
                    : '0.0%'}
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                <Clock size={12} color="var(--text-muted)" />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last Registered Heartbeat</span>
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {formatTimestamp(camera.health?.last_heartbeat)}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Drawer Footer */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(5, 8, 15, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          GUJ-CCTV-NETRAVA
        </span>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Link
            href={`/live?camera=${encodeURIComponent(camera.name)}`}
            data-testid="drawer-watch-live-btn"
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              fontSize: '11px',
              textDecoration: 'none',
            }}
          >
            <Video size={13} />
            Watch Live Feed
          </Link>
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{
              padding: '7px 14px',
              fontSize: '11px',
            }}
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}
