// ==============================================================================
// Camera Selector Sidebar Component
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 5.2, Section 14.2)
// Visual Language: Kit8 / Anton Fritsler Police Operations System
// ==============================================================================

'use client';

import React, { useState, useMemo } from 'react';
import { Search, Video, Wifi, WifiOff, AlertCircle, Filter } from 'lucide-react';
import { Camera, OperationalStatus } from '@/types/camera';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface CameraSelectorProps {
  cameras: Camera[];
  selectedCameraId: string | null;
  onSelectCamera: (camera: Camera) => void;
  isLoading?: boolean;
}

export const CameraSelector: React.FC<CameraSelectorProps> = ({
  cameras,
  selectedCameraId,
  onSelectCamera,
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OperationalStatus>('ALL');

  // Filter cameras
  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      // Status filter
      if (statusFilter !== 'ALL' && cam.operational_status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = cam.name.toLowerCase().includes(q);
        const matchAddr = cam.location?.address?.toLowerCase().includes(q);
        const matchZone = cam.location?.zone?.toLowerCase().includes(q);
        const matchDept = cam.department_name?.toLowerCase().includes(q);
        return matchName || matchAddr || matchZone || matchDept;
      }

      return true;
    });
  }, [cameras, searchQuery, statusFilter]);

  return (
    <div
      data-testid="camera-selector-panel"
      className="netrava-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        padding: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(11, 17, 32, 0.75)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Video size={14} color="var(--accent-blue)" />
            <span>Surveillance Feeds</span>
          </div>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {filteredCameras.length} / {cameras.length}
          </span>
        </div>

        {/* Search Box */}
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <Search
            size={13}
            color="var(--text-muted)"
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            data-testid="camera-search-input"
            type="text"
            className="netrava-input"
            placeholder="Search feed, zone, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '32px',
              paddingTop: '6px',
              paddingBottom: '6px',
              fontSize: '11px',
            }}
          />
        </div>

        {/* Status Filter Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            overflowX: 'auto',
            paddingBottom: '2px',
          }}
        >
          {(['ALL', 'ONLINE', 'DEGRADED', 'OFFLINE'] as const).map((st) => (
            <button
              key={st}
              type="button"
              data-testid={`filter-${st.toLowerCase()}`}
              onClick={() => setStatusFilter(st)}
              className={`netrava-tab-button ${statusFilter === st ? 'active' : ''}`}
              style={{
                padding: '3px 9px',
                fontSize: '10px',
                height: '24px',
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Camera Feed List */}
      <div
        data-testid="camera-list"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {isLoading ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px',
            }}
          >
            Loading registered cameras...
          </div>
        ) : filteredCameras.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px',
            }}
          >
            No cameras match your search filter.
          </div>
        ) : (
          filteredCameras.map((camera) => {
            const isSelected = camera.id === selectedCameraId;
            const primaryStream = camera.streams?.[0];
            const isRtsp = primaryStream?.url_or_handle?.startsWith('rtsp://');

            return (
              <button
                key={camera.id}
                type="button"
                data-testid={`camera-item-${camera.name}`}
                onClick={() => onSelectCamera(camera)}
                className={`netrava-nav-link ${isSelected ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: '5px',
                  padding: '10px 12px',
                  textAlign: 'left',
                }}
              >
                {/* Top Row: Camera Name & Status */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: 'inherit',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {camera.name}
                    </span>
                    {isRtsp ? (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          backgroundColor: 'var(--status-success-bg)',
                          color: 'var(--status-success)',
                          border: '1px solid var(--status-success-border)',
                          flexShrink: 0,
                          letterSpacing: '0.04em',
                        }}
                      >
                        LIVE HLS
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-subtle)',
                          flexShrink: 0,
                        }}
                      >
                        {camera.protocol}
                      </span>
                    )}
                  </div>

                  <StatusBadge
                    status={camera.operational_status}
                    label={camera.operational_status}
                    size="sm"
                  />
                </div>

                {/* Middle Row: Location & Department */}
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {camera.location?.address || 'Location unspecified'}
                  {camera.location?.zone ? ` • Zone: ${camera.location.zone}` : ''}
                </div>

                {/* Bottom Row: Stream Specs */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {primaryStream ? (
                    <>
                      <span>{primaryStream.resolution}</span>
                      <span>•</span>
                      <span>{primaryStream.fps} FPS</span>
                      <span>•</span>
                      <span>{primaryStream.codec}</span>
                    </>
                  ) : (
                    <span>No stream configured</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
