// ==============================================================================
// Live CCTV Monitoring & Stream Playback Page
// NETRAVA CCTV Intelligence Platform — Unified Interior Design System
// ==============================================================================

'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Video,
  MapPin,
  Activity,
  Shield,
  Clock,
  Layers,
  ChevronRight,
  Radio,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LivePlayer, PlaybackStatus } from '@/components/live/LivePlayer';
import { CameraSelector } from '@/components/live/CameraSelector';
import { StreamUnavailable } from '@/components/live/StreamUnavailable';
import { camerasApi } from '@/lib/api/cameras';
import { resolveCameraStream } from '@/lib/api/stream';
import { Camera } from '@/types/camera';

function LiveMonitoringContent() {
  const searchParams = useSearchParams();

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('IDLE');

  const handlePlaybackStatusChange = useCallback((st: PlaybackStatus) => {
    setPlaybackStatus(st);
  }, []);

  // Load cameras from backend API
  const loadCameras = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await camerasApi.getCameras({ limit: 50 });
      const cameraList = response.data || [];
      setCameras(cameraList);

      // Check query param camera selection
      const targetParam = searchParams.get('camera');
      if (targetParam) {
        const matched = cameraList.find(
          (c) => c.id === targetParam || c.name.toLowerCase() === targetParam.toLowerCase()
        );
        if (matched) {
          setSelectedCamera(matched);
          return;
        }
      }

      // Default to first RTSP camera or first camera in list
      const firstRtsp = cameraList.find((c) =>
        c.streams?.some((s) => s.url_or_handle?.startsWith('rtsp://'))
      );
      if (firstRtsp) {
        setSelectedCamera(firstRtsp);
      } else if (cameraList.length > 0) {
        setSelectedCamera(cameraList[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load camera registry for live monitoring.');
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  // Handle camera selection
  const handleSelectCamera = (camera: Camera) => {
    setSelectedCamera(camera);
    const newUrl = `/live?camera=${encodeURIComponent(camera.name)}`;
    window.history.replaceState(null, '', newUrl);
  };

  // Resolve stream status for selected camera
  const streamResolution = selectedCamera ? resolveCameraStream(selectedCamera) : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - var(--header-height) - 48px)',
        overflow: 'hidden',
        gap: '14px',
      }}
    >
      {/* Top Tactical Command Bar */}
      <div
        className="netrava-card"
        style={{
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Left: Breadcrumb & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              color: '#60A5FA',
              flexShrink: 0,
            }}
          >
            <Video size={16} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em', flexWrap: 'wrap' }}>
              <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>
                Command Center
              </Link>
              <ChevronRight size={11} />
              <span style={{ color: 'var(--text-secondary)' }}>Live Surveillance</span>
              <span style={{ color: 'var(--border-default)' }}>•</span>
              <span
                data-testid="live-corridor-disclosure"
                title="Demonstration Mode: Operating with representative CCTV recordings replayed over simulated RTSP gateway. Physical police NVR/VMS ready for authorized ingestion."
                style={{
                  color: '#93C5FD',
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.28)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                SIMULATED LIVE CCTV (REPRESENTATIVE CORRIDOR DEPLOYMENT)
              </span>
            </div>
            <h1
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                letterSpacing: '0.01em',
              }}
            >
              Live Video Monitoring
              {selectedCamera && (
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: '#60A5FA',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid rgba(59, 130, 246, 0.30)',
                    fontWeight: 500,
                  }}
                >
                  {selectedCamera.name}
                </span>
              )}
            </h1>
          </div>
        </div>

        {/* Right: Navigation shortcuts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {selectedCamera && (
            <Link
              href={`/map?camera=${encodeURIComponent(selectedCamera.name)}`}
              data-testid="view-on-map-link"
              className="btn-secondary"
              style={{
                padding: '6px 14px',
                fontSize: 'var(--text-sm)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <MapPin size={14} color="#60A5FA" />
              <span>GIS Map</span>
            </Link>
          )}

          <Link
            href="/cameras"
            className="btn-secondary"
            style={{
              padding: '6px 14px',
              fontSize: 'var(--text-sm)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={14} color="var(--text-secondary)" />
            <span>Camera Registry</span>
          </Link>
        </div>
      </div>

      {/* Main Monitoring Body (Split View) */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          overflow: 'hidden',
          gap: '14px',
        }}
      >
        {/* Left Column: Video Viewport & Telemetry */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
          }}
        >
          {isLoading ? (
            <div
              className="netrava-card"
              style={{
                flex: 1,
                minHeight: '440px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LoadingState message="Initializing CCTV feed gateway & stream registry..." />
            </div>
          ) : error ? (
            <div
              className="netrava-card"
              style={{
                flex: 1,
                minHeight: '440px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
              }}
            >
              <ErrorState title="Stream Registry Error" message={error} onRetry={loadCameras} />
            </div>
          ) : !selectedCamera ? (
            <div
              className="netrava-card"
              style={{
                flex: 1,
                minHeight: '440px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              No cameras available for monitoring.
            </div>
          ) : streamResolution?.playable && streamResolution.hlsUrl ? (
            /* Real Live Stream Player */
            <LivePlayer
              key={selectedCamera.id}
              streamUrl={streamResolution.hlsUrl}
              camera={selectedCamera}
              onStatusChange={handlePlaybackStatusChange}
            />
          ) : (
            /* Non-Playable Fallback */
            <StreamUnavailable
              camera={selectedCamera}
              reason={streamResolution?.reason}
              onSelectAlternative={() => {
                const rtspCam = cameras.find((c) =>
                  c.streams?.some((s) => s.url_or_handle?.startsWith('rtsp://'))
                );
                if (rtspCam) handleSelectCamera(rtspCam);
              }}
            />
          )}

          {/* Camera Metadata & Health Telemetry Card */}
          {selectedCamera && (
            <div
              data-testid="camera-telemetry-card"
              className="netrava-card"
              style={{
                padding: '14px 18px',
                borderTop: '2px solid var(--accent-primary)',
              }}
            >
              {/* Header Info */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  paddingBottom: '10px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-primary)',
                        backgroundColor: 'rgba(215, 25, 63, 0.12)',
                        border: '1px solid rgba(215, 25, 63, 0.3)',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-xs)',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {selectedCamera.id}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {selectedCamera.name}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 400,
                        color: 'var(--text-muted)',
                      }}
                    >
                      ({selectedCamera.location?.address || 'Pan-India Jurisdiction'})
                    </span>
                  </div>
                </div>

                {/* Status Badges: Distinct Camera Health vs Playback Health */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.04em' }}>
                      CAMERA HEALTH:
                    </span>
                    <StatusBadge
                      status={selectedCamera.operational_status}
                      label={selectedCamera.operational_status}
                      size="sm"
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.04em' }}>
                      PLAYBACK HEALTH:
                    </span>
                    <span data-testid="live-playback-status-pill" style={{ display: 'inline-flex' }}>
                      <StatusBadge
                        label={playbackStatus}
                        variant={
                          playbackStatus === 'PLAYING'
                            ? 'success'
                            : playbackStatus === 'ERROR' || playbackStatus === 'OFFLINE'
                            ? 'critical'
                            : 'info'
                        }
                        size="sm"
                      />
                    </span>
                  </div>
                </div>
              </div>

              {/* Telemetry Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '10px',
                  backgroundColor: 'rgba(11, 16, 32, 0.75)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '3px', textTransform: 'uppercase' }}>
                    Department
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedCamera.department_name || selectedCamera.department_id}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '3px', textTransform: 'uppercase' }}>
                    Resolution & Codec
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {selectedCamera.streams?.[0]?.resolution
                      ? `${selectedCamera.streams[0].resolution}${selectedCamera.streams[0].codec ? ` (${selectedCamera.streams[0].codec})` : ''}`
                      : 'UNAVAILABLE'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '3px', textTransform: 'uppercase' }}>
                    Frame Rate
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: '#34D399',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {selectedCamera.health?.fps_actual != null
                      ? `${selectedCamera.health.fps_actual.toFixed(1)} FPS`
                      : selectedCamera.streams?.[0]?.fps != null
                      ? `${selectedCamera.streams[0].fps} FPS`
                      : 'UNAVAILABLE'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '3px', textTransform: 'uppercase' }}>
                    Packet Loss
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color:
                        selectedCamera.health?.packet_loss && selectedCamera.health.packet_loss > 5.0
                          ? '#F87171'
                          : '#34D399',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {selectedCamera.health?.packet_loss != null
                      ? `${selectedCamera.health.packet_loss.toFixed(2)}%`
                      : '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '3px', textTransform: 'uppercase' }}>
                    Coordinates
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {selectedCamera.lat != null && selectedCamera.long != null
                      ? `${Number(selectedCamera.lat).toFixed(4)}°N, ${Number(selectedCamera.long).toFixed(4)}°E`
                      : 'UNAVAILABLE'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Camera Selector Sidebar */}
        <div style={{ height: '100%', overflow: 'hidden' }}>
          <CameraSelector
            cameras={cameras}
            selectedCameraId={selectedCamera?.id || null}
            onSelectCamera={handleSelectCamera}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

export default function LiveMonitoringPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState message="Loading live CCTV console..." />}>
        <LiveMonitoringContent />
      </Suspense>
    </AppShell>
  );
}
