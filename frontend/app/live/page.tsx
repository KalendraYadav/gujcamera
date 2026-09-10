// ==============================================================================
// Live CCTV Monitoring & Stream Playback Page
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 5.2, Section 14.2)
// ==============================================================================

'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Video,
  MapPin,
  Activity,
  Shield,
  Clock,
  Layers,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
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
  const router = useRouter();

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('IDLE');

  const handlePlaybackStatusChange = useCallback((st: PlaybackStatus) => {
    setPlaybackStatus(st);
  }, []);

  // Load cameras from real backend API
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
    // Update URL query without full reload
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
        height: 'calc(100vh - 64px)',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Top Tactical Command Bar */}
      <div
        style={{
          padding: '12px 20px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Left: Breadcrumb & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
            }}
          >
            <Video size={18} color="var(--accent-blue)" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                Command Center
              </Link>
              <ChevronRight size={12} />
              <span style={{ color: 'var(--text-secondary)' }}>Live CCTV Feeds</span>
            </div>
            <h1
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              Live Monitoring & Stream Console
              {selectedCamera && (
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent-blue)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                  }}
                >
                  {selectedCamera.name}
                </span>
              )}
            </h1>
          </div>
        </div>

        {/* Right: Simulated Data Banner & Navigation shortcuts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SimulatedDataBadge />

          {selectedCamera && (
            <Link
              href={`/map?camera=${encodeURIComponent(selectedCamera.name)}`}
              data-testid="view-on-map-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                textDecoration: 'none',
              }}
            >
              <MapPin size={14} />
              GIS Map
            </Link>
          )}

          <Link
            href="/cameras"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              textDecoration: 'none',
            }}
          >
            <Layers size={14} />
            Registry
          </Link>
        </div>
      </div>

      {/* Main Monitoring Body (Split View) */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 360px',
          overflow: 'hidden',
          gap: '16px',
          padding: '16px',
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
              style={{
                flex: 1,
                minHeight: '440px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <LoadingState message="Initializing CCTV feed gateway & stream registry..." />
            </div>
          ) : error ? (
            <div
              style={{
                flex: 1,
                minHeight: '440px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                padding: '24px',
              }}
            >
              <ErrorState title="Stream Registry Error" message={error} onRetry={loadCameras} />
            </div>
          ) : !selectedCamera ? (
            <div
              style={{
                flex: 1,
                minHeight: '440px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
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
            /* Honest Non-Playable Fallback */
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
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px 20px',
              }}
            >
              {/* Header Info */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      marginBottom: '2px',
                    }}
                  >
                    IDENTIFIER: {selectedCamera.id}
                  </div>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>{selectedCamera.name}</span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 400,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      ({selectedCamera.location?.address || 'Gujarat Jurisdiction'})
                    </span>
                  </div>
                </div>

                {/* Status Badges: Distinct Camera Health vs Playback Health */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* PostgreSQL Database Telemetry Status */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '2px',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      CAMERA HEALTH:
                    </span>
                    <StatusBadge
                      status={selectedCamera.operational_status}
                      label={selectedCamera.operational_status}
                      size="sm"
                    />
                  </div>

                  {/* Browser HLS Playback Status */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '2px',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      PLAYBACK HEALTH:
                    </span>
                    <span
                      data-testid="live-playback-status-pill"
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor:
                          playbackStatus === 'PLAYING'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : playbackStatus === 'ERROR' || playbackStatus === 'OFFLINE'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(59, 130, 246, 0.15)',
                        color:
                          playbackStatus === 'PLAYING'
                            ? '#10b981'
                            : playbackStatus === 'ERROR' || playbackStatus === 'OFFLINE'
                            ? '#ef4444'
                            : '#3b82f6',
                        border: '1px solid',
                        borderColor:
                          playbackStatus === 'PLAYING'
                            ? 'rgba(16, 185, 129, 0.3)'
                            : playbackStatus === 'ERROR' || playbackStatus === 'OFFLINE'
                            ? 'rgba(239, 68, 68, 0.3)'
                            : 'rgba(59, 130, 246, 0.3)',
                      }}
                    >
                      {playbackStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Telemetry Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Department
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedCamera.department_name || selectedCamera.department_id}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Resolution & Codec
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {selectedCamera.streams?.[0]?.resolution || '1080p'} (
                    {selectedCamera.streams?.[0]?.codec || 'H.264'})
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Telemetry FPS
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {selectedCamera.health?.fps_actual != null
                      ? `${selectedCamera.health.fps_actual.toFixed(1)} FPS`
                      : `${selectedCamera.streams?.[0]?.fps || 25} FPS (Config)`}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Packet Loss
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color:
                        selectedCamera.health?.packet_loss && selectedCamera.health.packet_loss > 5.0
                          ? 'var(--color-alert)'
                          : 'var(--color-success)',
                    }}
                  >
                    {selectedCamera.health?.packet_loss != null
                      ? `${selectedCamera.health.packet_loss.toFixed(2)}%`
                      : '0.00%'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Coordinates
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {selectedCamera.lat.toFixed(4)}°N, {selectedCamera.long.toFixed(4)}°E
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
