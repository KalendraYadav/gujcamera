// ==============================================================================
// Camera Selector Sidebar Component
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 5.2, Section 14.2)
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-subtle)',
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
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Video size={16} color="var(--accent-blue)" />
            Camera Feeds
          </div>
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-surface)',
              padding: '2px 8px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {filteredCameras.length} / {cameras.length}
          </span>
        </div>

        {/* Search Box */}
        <div
          style={{
            position: 'relative',
            marginBottom: '10px',
          }}
        >
          <Search
            size={14}
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
            type="text"
            data-testid="camera-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, location, zone..."
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              fontSize: '12px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          {(['ALL', 'ONLINE', 'DEGRADED', 'OFFLINE'] as const).map((st) => (
            <button
              key={st}
              type="button"
              data-testid={`filter-${st.toLowerCase()}`}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: statusFilter === st ? 600 : 400,
                borderRadius: '4px',
                border: '1px solid',
                borderColor: statusFilter === st ? 'var(--accent-blue)' : 'var(--border-subtle)',
                backgroundColor: statusFilter === st ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
                color: statusFilter === st ? '#ffffff' : 'var(--text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
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
              fontSize: '13px',
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
              fontSize: '13px',
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
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  padding: '10px 12px',
                  backgroundColor: isSelected ? 'var(--bg-elevated)' : 'var(--bg-primary)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--accent-blue)' : 'var(--border-subtle)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                  position: 'relative',
                }}
              >
                {/* Active Indicator Bar */}
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '6px',
                      bottom: '6px',
                      width: '3px',
                      backgroundColor: 'var(--accent-blue)',
                      borderRadius: '0 2px 2px 0',
                    }}
                  />
                )}

                {/* Top Row: Camera Name & Status */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: isSelected ? 'var(--accent-blue)' : 'var(--text-primary)',
                      }}
                    >
                      {camera.name}
                    </span>
                    {isRtsp ? (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        LIVE HLS
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(100, 116, 139, 0.15)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-subtle)',
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
                    fontSize: '12px',
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
                    gap: '8px',
                    fontSize: '11px',
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
