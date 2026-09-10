// ==============================================================================
// Live CCTV Player Component (HLS.js / Native HLS)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 5.2, Section 14.2)
// ==============================================================================

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
  AlertTriangle,
  Radio,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';
import { Camera, OperationalStatus } from '@/types/camera';

export type PlaybackStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'PLAYING'
  | 'BUFFERING'
  | 'RECONNECTING'
  | 'OFFLINE'
  | 'ERROR';

interface LivePlayerProps {
  streamUrl: string;
  camera: Camera;
  autoPlay?: boolean;
  onStatusChange?: (status: PlaybackStatus) => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 2000;

export const LivePlayer: React.FC<LivePlayerProps> = ({
  streamUrl,
  camera,
  autoPlay = true,
  onStatusChange,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [videoStats, setVideoStats] = useState<{
    width?: number;
    height?: number;
    fps?: number;
  }>({});

  // Propagate status changes to parent
  const updateStatus = useCallback(
    (newStatus: PlaybackStatus) => {
      setPlaybackStatus(newStatus);
      if (onStatusChange) {
        onStatusChange(newStatus);
      }
    },
    [onStatusChange]
  );

  // Clear pending timers
  const clearRetryTimer = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // Cleanly tear down HLS and video element
  const cleanupPlayer = useCallback(() => {
    clearRetryTimer();

    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
        hlsRef.current.destroy();
      } catch (err) {
        // Safe tear down
      }
      hlsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  }, [clearRetryTimer]);

  // Main stream initialization
  const initializeStream = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) {
      updateStatus('IDLE');
      return;
    }

    cleanupPlayer();
    setErrorMessage(null);
    updateStatus('CONNECTING');

    // 1. Check MSE / HLS.js support (Chrome, Edge, Firefox, modern browsers)
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 15,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
        manifestLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 8000,
      });

      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) {
          video
            .play()
            .then(() => {
              setIsPlaying(true);
            })
            .catch(() => {
              // Browser autoplay policy might require explicit interaction or muting
              setIsPlaying(false);
            });
        }
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        const streamDetails = camera.streams?.[0];
        setVideoStats({
          width: data.details.totalduration ? undefined : 1920,
          fps: streamDetails?.fps || 25,
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Network error: attempt bounded exponential backoff retry
              setRetryAttempt((prev) => {
                const nextAttempt = prev + 1;
                if (nextAttempt <= MAX_RECONNECT_ATTEMPTS) {
                  updateStatus('RECONNECTING');
                  const delay = nextAttempt * RECONNECT_BASE_DELAY_MS;
                  setErrorMessage(
                    `Stream connection interrupted. Reconnecting (attempt ${nextAttempt}/${MAX_RECONNECT_ATTEMPTS}) in ${delay / 1000}s...`
                  );

                  retryTimeoutRef.current = setTimeout(() => {
                    if (hlsRef.current) {
                      hlsRef.current.startLoad();
                    }
                  }, delay);
                } else {
                  updateStatus('OFFLINE');
                  setErrorMessage(
                    `Stream unreachable at ${streamUrl} after ${MAX_RECONNECT_ATTEMPTS} attempts. MediaMTX gateway or simulator may be offline.`
                  );
                  cleanupPlayer();
                }
                return nextAttempt;
              });
              break;

            case Hls.ErrorTypes.MEDIA_ERROR:
              // Non-network media codec stall
              hls.recoverMediaError();
              break;

            default:
              updateStatus('ERROR');
              setErrorMessage(`Fatal HLS playback error: ${data.details}`);
              cleanupPlayer();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // 2. Native HLS support (Safari)
      video.src = streamUrl;
      if (autoPlay) {
        video.play().catch(() => setIsPlaying(false));
      }
    } else {
      // 3. Neither supported
      updateStatus('ERROR');
      setErrorMessage(
        'Your browser does not support HLS stream playback. Please use a modern browser.'
      );
    }
  }, [streamUrl, autoPlay, camera, cleanupPlayer, updateStatus]);

  // Handle streamUrl changes
  useEffect(() => {
    setRetryAttempt(0);
    initializeStream();

    return () => {
      cleanupPlayer();
    };
  }, [streamUrl, initializeStream, cleanupPlayer]);

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlaying = () => {
      updateStatus('PLAYING');
      setIsPlaying(true);
      setRetryAttempt(0);
      setErrorMessage(null);
    };

    const handleWaiting = () => {
      if (playbackStatus === 'PLAYING') {
        updateStatus('BUFFERING');
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleLoadedMetadata = () => {
      if (video.videoWidth && video.videoHeight) {
        setVideoStats((prev) => ({
          ...prev,
          width: video.videoWidth,
          height: video.videoHeight,
        }));
      }
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [playbackStatus, updateStatus]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Controls
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleManualRetry = () => {
    setRetryAttempt(0);
    initializeStream();
  };

  // Helper for status badge styling
  const getStatusBadge = () => {
    switch (playbackStatus) {
      case 'PLAYING':
        return {
          bg: 'rgba(16, 185, 129, 0.2)',
          color: '#10b981',
          border: 'rgba(16, 185, 129, 0.4)',
          text: 'LIVE',
          icon: <Radio size={13} style={{ animation: 'pulse 1.5s infinite' }} />,
        };
      case 'CONNECTING':
        return {
          bg: 'rgba(59, 130, 246, 0.2)',
          color: '#3b82f6',
          border: 'rgba(59, 130, 246, 0.4)',
          text: 'CONNECTING...',
          icon: <Radio size={13} />,
        };
      case 'BUFFERING':
        return {
          bg: 'rgba(245, 158, 11, 0.2)',
          color: '#f59e0b',
          border: 'rgba(245, 158, 11, 0.4)',
          text: 'BUFFERING',
          icon: <RotateCcw size={13} style={{ animation: 'spin 2s linear infinite' }} />,
        };
      case 'RECONNECTING':
        return {
          bg: 'rgba(245, 158, 11, 0.25)',
          color: '#f59e0b',
          border: 'rgba(245, 158, 11, 0.5)',
          text: `RECONNECTING (${retryAttempt}/${MAX_RECONNECT_ATTEMPTS})`,
          icon: <RotateCcw size={13} style={{ animation: 'spin 1.5s linear infinite' }} />,
        };
      case 'OFFLINE':
        return {
          bg: 'rgba(100, 116, 139, 0.25)',
          color: '#94a3b8',
          border: 'rgba(100, 116, 139, 0.4)',
          text: 'STREAM OFFLINE',
          icon: <WifiOff size={13} />,
        };
      case 'ERROR':
        return {
          bg: 'rgba(239, 68, 68, 0.2)',
          color: '#ef4444',
          border: 'rgba(239, 68, 68, 0.4)',
          text: 'STREAM ERROR',
          icon: <AlertTriangle size={13} />,
        };
      default:
        return {
          bg: 'rgba(100, 116, 139, 0.15)',
          color: '#94a3b8',
          border: 'rgba(100, 116, 139, 0.3)',
          text: 'IDLE',
          icon: null,
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      ref={containerRef}
      data-testid="live-player-container"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        backgroundColor: '#000000',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Real HTML5 Video Element */}
      <video
        ref={videoRef}
        data-testid="live-video-element"
        autoPlay={autoPlay}
        muted={isMuted}
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          backgroundColor: '#000000',
        }}
      />

      {/* Top Header Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          right: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {/* Left: Stream Status Pill */}
        <div
          data-testid="playback-status-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: statusBadge.bg,
            border: `1px solid ${statusBadge.border}`,
            color: statusBadge.color,
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            backdropFilter: 'blur(4px)',
            pointerEvents: 'auto',
          }}
        >
          {statusBadge.icon}
          <span>{statusBadge.text}</span>
        </div>

        {/* Right: Technical Specs Overlay */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: 'rgba(10, 15, 25, 0.8)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <span>{videoStats.width ? `${videoStats.width}x${videoStats.height || 1080}` : '1080p'}</span>
          <span style={{ color: 'var(--border-default)' }}>•</span>
          <span>{camera.streams?.[0]?.codec || 'H.264'}</span>
          <span style={{ color: 'var(--border-default)' }}>•</span>
          <span>{camera.health?.fps_actual ? `${camera.health.fps_actual.toFixed(0)} FPS` : `${videoStats.fps || 25} FPS`}</span>
        </div>
      </div>

      {/* Center States: Loading / Buffering / Error / Offline */}
      {(playbackStatus === 'CONNECTING' ||
        playbackStatus === 'BUFFERING' ||
        playbackStatus === 'RECONNECTING' ||
        playbackStatus === 'OFFLINE' ||
        playbackStatus === 'ERROR') && (
        <div
          data-testid="player-state-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(5, 8, 15, 0.82)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            zIndex: 5,
            backdropFilter: 'blur(2px)',
          }}
        >
          {playbackStatus === 'CONNECTING' && (
            <>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '3px solid rgba(59, 130, 246, 0.2)',
                  borderTopColor: 'var(--accent-blue)',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '16px',
                }}
              />
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Connecting to Live Stream
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {streamUrl}
              </div>
            </>
          )}

          {playbackStatus === 'BUFFERING' && (
            <>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: '3px solid rgba(245, 158, 11, 0.2)',
                  borderTopColor: 'var(--color-warning)',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '12px',
                }}
              />
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-warning)' }}>
                Buffering Live Feed...
              </div>
            </>
          )}

          {playbackStatus === 'RECONNECTING' && (
            <>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '3px solid rgba(245, 158, 11, 0.2)',
                  borderTopColor: 'var(--color-warning)',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '16px',
                }}
              />
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-warning)', marginBottom: '6px' }}>
                Stream Disconnected — Reconnecting
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '420px', marginBottom: '16px' }}>
                {errorMessage}
              </div>
              <button
                type="button"
                data-testid="manual-reconnect-button"
                onClick={handleManualRetry}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RotateCcw size={14} />
                Retry Immediately
              </button>
            </>
          )}

          {(playbackStatus === 'OFFLINE' || playbackStatus === 'ERROR') && (
            <>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}
              >
                <AlertTriangle size={24} color="var(--color-alert)" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                {playbackStatus === 'OFFLINE' ? 'Stream Unavailable' : 'Stream Playback Error'}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  maxWidth: '480px',
                  lineHeight: '1.5',
                  marginBottom: '20px',
                }}
              >
                {errorMessage || 'Failed to establish connection with video streaming gateway.'}
              </div>
              <button
                type="button"
                data-testid="manual-reconnect-button"
                onClick={handleManualRetry}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'var(--accent-blue)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <RotateCcw size={15} />
                Reconnect Stream
              </button>
            </>
          )}
        </div>
      )}

      {/* Bottom Control Bar */}
      <div
        data-testid="player-control-bar"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '10px 14px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        {/* Left Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            aria-label={isPlaying ? 'Pause live playback' : 'Resume live playback'}
            data-testid="player-play-pause-button"
            onClick={togglePlay}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button
            type="button"
            aria-label={isMuted ? 'Unmute stream' : 'Mute stream'}
            data-testid="player-mute-button"
            onClick={toggleMute}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          <button
            type="button"
            aria-label="Reload live stream"
            data-testid="player-reload-button"
            onClick={handleManualRetry}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            {camera.name}
          </div>

          <button
            type="button"
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            data-testid="player-fullscreen-button"
            onClick={toggleFullscreen}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Maximize2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
