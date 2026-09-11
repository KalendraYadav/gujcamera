'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapPin,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  Search,
  AlertCircle,
  Activity,
  Radio,
} from 'lucide-react';
import { Camera, OperationalStatus } from '@/types/camera';
import { camerasApi } from '@/lib/api/cameras';
import { CameraDetailDrawer } from './CameraDetailDrawer';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  AttributionControl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Stable, openly accessible basemap style for MapLibre (OpenStreetMap standard raster tiles - No API key required)
const TACTICAL_DARK_STYLE: any = process.env.NEXT_PUBLIC_MAP_STYLE || {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const DEFAULT_CENTER: [number, number] = [72.5714, 23.08]; // Ahmedabad - Gandhinagar Corridor
const DEFAULT_ZOOM = 11;

export function GisCameraMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [mapBoundsText, setMapBoundsText] = useState<string>('');
  const [totalInViewport, setTotalInViewport] = useState<number>(0);

  // Fetch cameras for a specific bounding box
  const loadCamerasForBounds = useCallback(async (minLong: number, minLat: number, maxLong: number, maxLat: number) => {
    setIsLoading(true);
    setErrorMessage(null);

    const bbox = `${minLong.toFixed(6)},${minLat.toFixed(6)},${maxLong.toFixed(6)},${maxLat.toFixed(6)}`;
    setMapBoundsText(bbox);

    try {
      const response = await camerasApi.getCameras({ bbox, limit: 100 });
      setCameras(response.data);
      setTotalInViewport(response.pagination.total);
    } catch (err: any) {
      console.error('Failed to load cameras for map bbox:', err);
      const msg = err.message || 'Camera registry unavailable. Network or authorization error.';
      setErrorMessage(msg);
      setCameras([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update HTML markers on the MapLibre map
  const updateMapMarkers = useCallback(
    (cams: Camera[], map: any) => {
      // Remove stale markers that are no longer in the list
      const currentIds = new Set(cams.map((c) => c.id));
      markersRef.current.forEach((marker, id) => {
        if (!currentIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });

      // Add or update markers
      cams.forEach((camera) => {
        if (markersRef.current.has(camera.id)) {
          // Marker already exists
          return;
        }

        // Create tactical DOM marker
        const el = document.createElement('div');
        el.className = 'tactical-camera-marker';
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', `Camera ${camera.name}, Status ${camera.operational_status}`);
        el.title = `${camera.name} (${camera.operational_status})`;

        // Visual styling for tactical marker
        const isOnline = camera.operational_status === 'ONLINE';
        const isDegraded = camera.operational_status === 'DEGRADED';
        const isOffline = camera.operational_status === 'OFFLINE';
        const isError = camera.operational_status === 'ERROR';

        let statusColor = '#3b82f6'; // Connecting / default
        if (isOnline) statusColor = '#10b981';
        else if (isDegraded) statusColor = '#f59e0b';
        else if (isOffline) statusColor = '#64748b';
        else if (isError) statusColor = '#ef4444';

        // Container sizing - MapLibre uses el.style.transform for geographic anchoring.
        // DO NOT set transform or transition: transform on el.
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.cursor = 'pointer';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        // Inner visual wrapper - handles scale micro-interaction and aesthetics
        // without overriding MapLibre's geographic coordinates on the outer container.
        const inner = document.createElement('div');
        inner.className = 'tactical-marker-visual';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.borderRadius = '50%';
        inner.style.backgroundColor = 'rgba(15, 23, 42, 0.9)';
        inner.style.border = `2px solid ${statusColor}`;
        inner.style.boxShadow = isOnline
          ? '0 0 10px rgba(16, 185, 129, 0.6)'
          : isDegraded
          ? '0 0 8px rgba(245, 158, 11, 0.5)'
          : '0 2px 4px rgba(0,0,0,0.5)';
        inner.style.display = 'flex';
        inner.style.alignItems = 'center';
        inner.style.justifyContent = 'center';
        inner.style.color = statusColor;
        inner.style.pointerEvents = 'none';
        inner.style.transformOrigin = 'center center';
        inner.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';

        // Inner SVG icon
        inner.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        `;
        el.appendChild(inner);

        // Micro-interactions apply only to inner visual element and outer z-index
        el.onmouseenter = () => {
          inner.style.transform = 'scale(1.25)';
          el.style.zIndex = '100';
        };
        el.onmouseleave = () => {
          inner.style.transform = 'scale(1)';
          el.style.zIndex = '1';
        };

        const selectThisCamera = () => {
          setSelectedCamera(camera);
        };

        el.onclick = selectThisCamera;
        el.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectThisCamera();
          }
        };

        const marker = new MapLibreMarker({ element: el })
          .setLngLat([camera.long, camera.lat])
          .addTo(map);

        markersRef.current.set(camera.id, marker);
      });
    },
    []
  );

  // Initialize MapLibre GL
  useEffect(() => {
    let isMounted = true;
    let fallbackTimer: NodeJS.Timeout | null = null;

    function initMap() {
      if (!mapContainerRef.current) return;

      try {
        const map = new MapLibreMap({
          container: mapContainerRef.current,
          style: TACTICAL_DARK_STYLE,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: 4,
          maxZoom: 18,
          attributionControl: false,
        });

        // Add standard navigation controls
        map.addControl(new NavigationControl({ showCompass: true }), 'bottom-right');

        // Add custom attribution
        map.addControl(
          new AttributionControl({
            compact: true,
            customAttribution: 'Gujarat Police Unified CCTV Platform | MapLibre Open GIS | OpenStreetMap contributors',
          }),
          'bottom-left'
        );

        // Fallback: Ensure cameras are queried even if map style loading is delayed
        fallbackTimer = setTimeout(() => {
          if (!isMounted) return;
          if (!mapInstanceRef.current && mapContainerRef.current) {
            mapInstanceRef.current = map;
            try {
              const bounds = map.getBounds();
              if (bounds) {
                loadCamerasForBounds(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
              }
            } catch {
              loadCamerasForBounds(72.45, 22.95, 72.75, 23.25);
            }
          }
        }, 1200);

        map.on('load', () => {
          if (fallbackTimer) clearTimeout(fallbackTimer);
          if (!isMounted) return;
          mapInstanceRef.current = map;

          // Initial bounds fetch
          const bounds = map.getBounds();
          loadCamerasForBounds(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
        });

        // Viewport debounce on moveend / zoomend
        const handleMoveEnd = () => {
          if (!isMounted) return;
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

          debounceTimerRef.current = setTimeout(() => {
            if (!mapInstanceRef.current) return;
            const b = mapInstanceRef.current.getBounds();
            loadCamerasForBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
          }, 350); // 350ms debounce
        };

        map.on('moveend', handleMoveEnd);
      } catch (err) {
        console.error('Failed to initialize MapLibre GL:', err);
        if (isMounted) {
          setErrorMessage('Failed to initialize GIS Map engine. WebGL acceleration required.');
          setIsLoading(false);
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loadCamerasForBounds]);

  // Synchronize markers whenever cameras state changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    updateMapMarkers(cameras, mapInstanceRef.current);
  }, [cameras, updateMapMarkers]);

  // Center map on a specific camera
  const flyToCamera = useCallback((lat: number, long: number) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo({
      center: [long, lat],
      zoom: 14,
      essential: true,
      duration: 1200,
    });
  }, []);

  // Filter cameras for the accessible sidebar
  const filteredCameras = cameras.filter((cam) => {
    const matchesSearch =
      cam.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      cam.location?.address?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      cam.location?.district?.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || cam.operational_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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

  const reloadViewport = () => {
    if (!mapInstanceRef.current) return;
    const b = mapInstanceRef.current.getBounds();
    loadCamerasForBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - var(--header-height) - 40px)',
        minHeight: '600px',
        backgroundColor: 'var(--bg-base)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--border-default)',
        display: 'flex',
      }}
    >
      {/* 1. Map Canvas Container */}
      <div
        ref={mapContainerRef}
        style={{
          flex: 1,
          height: '100%',
          width: '100%',
          position: 'relative',
          backgroundColor: '#0a0f1d',
        }}
      />

      {/* 2. Top-Left Tactical HUD Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 'var(--space-3)',
          left: 'var(--space-3)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          maxWidth: '380px',
        }}
      >
        {/* Persistent Simulated Data Warning */}
        <SimulatedDataBadge />

        {/* Tactical Status Pill */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2) var(--space-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isLoading ? 'var(--status-warning)' : 'var(--status-success)',
                animation: isLoading ? 'pulse 1s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
              GIS COMMAND MAP
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
              {cameras.length} Active in View
            </span>
            <button
              onClick={reloadViewport}
              title="Refresh Viewport Data"
              disabled={isLoading}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <RefreshCw size={13} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Bounding Box Telemetry Notice */}
        {mapBoundsText && (
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              padding: '2px 8px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            BBOX: {mapBoundsText}
          </div>
        )}
      </div>

      {/* 3. Top-Right Map Controls / Quick Filters */}
      <div
        style={{
          position: 'absolute',
          top: 'var(--space-3)',
          right: isSidePanelOpen ? '390px' : 'var(--space-3)',
          zIndex: 10,
          display: 'flex',
          gap: 'var(--space-2)',
          transition: 'right var(--transition-normal)',
        }}
      >
        <button
          onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
          aria-label={isSidePanelOpen ? 'Collapse accessible camera panel' : 'Expand accessible camera panel'}
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Layers size={14} color="var(--accent-primary)" />
          <span>{isSidePanelOpen ? 'Hide Camera List' : 'Show Camera List'}</span>
          {isSidePanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* 4. Bottom-Left Map Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 'var(--space-3)',
          left: 'var(--space-3)',
          zIndex: 10,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          fontSize: '11px',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Legend:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Online</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Degraded</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64748b' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Offline</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Error</span>
        </div>
      </div>

      {/* 5. Accessible Camera Side Dock (Non-visual & Keyboard Alternative) */}
      {isSidePanelOpen && (
        <aside
          aria-label="Camera List Panel"
          style={{
            width: '380px',
            height: '100%',
            backgroundColor: 'var(--bg-card)',
            borderLeft: '1px solid var(--border-default)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 20,
            animation: 'slideInRight 0.2s ease-out',
          }}
        >
          {/* Side Panel Header */}
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <MapPin size={16} color="var(--accent-primary)" />
                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Viewport Cameras
                </h4>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent-primary)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {filteredCameras.length} found
              </span>
            </div>

            {/* Search and Status Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  color="var(--text-muted)"
                  style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  placeholder="Filter cameras in view..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  aria-label="Filter cameras in current view"
                  style={{
                    width: '100%',
                    padding: '6px 8px 6px 28px',
                    fontSize: 'var(--text-xs)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                {['ALL', 'ONLINE', 'DEGRADED', 'OFFLINE'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    style={{
                      flex: 1,
                      padding: '3px 6px',
                      fontSize: '10px',
                      fontWeight: 600,
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid',
                      borderColor: statusFilter === status ? 'var(--accent-border)' : 'var(--border-subtle)',
                      backgroundColor: statusFilter === status ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                      color: statusFilter === status ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Camera List - Keyboard Navigable */}
          <div
            role="feed"
            aria-label="Viewport Cameras List"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {isLoading && cameras.length === 0 && (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
                <Activity
                  size={24}
                  color="var(--accent-primary)"
                  style={{ animation: 'pulse 1.5s infinite', margin: '0 auto var(--space-2)' }}
                />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Querying spatial camera registry...
                </div>
              </div>
            )}

            {errorMessage && (
              <div style={{ padding: 'var(--space-2)' }}>
                <ErrorState
                  title="Spatial Query Failed"
                  message={errorMessage}
                  errorCode="BBOX_FETCH_FAILED"
                  onRetry={reloadViewport}
                />
              </div>
            )}

            {!isLoading && !errorMessage && filteredCameras.length === 0 && (
              <div style={{ padding: 'var(--space-4)' }}>
                <EmptyState
                  title="No Cameras in View"
                  message="Pan or zoom out the map to inspect adjacent police zones."
                  subtext="Only cameras located inside the visible geographic viewport are returned by the spatial database."
                  action={{
                    label: 'Reset to Ahmedabad Hub',
                    onClick: () => {
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
                      }
                    },
                  }}
                />
              </div>
            )}

            {filteredCameras.map((cam) => {
              const isSelected = selectedCamera?.id === cam.id;
              return (
                <div
                  key={cam.id}
                  role="article"
                  tabIndex={0}
                  aria-label={`${cam.name}, status ${cam.operational_status}`}
                  onClick={() => {
                    setSelectedCamera(cam);
                    flyToCamera(cam.lat, cam.long);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedCamera(cam);
                      flyToCamera(cam.lat, cam.long);
                    }
                  }}
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: isSelected ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                    border: isSelected ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-default)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {cam.name}
                    </div>
                    <StatusBadge
                      label={cam.operational_status}
                      variant={getStatusBadgeVariant(cam.operational_status)}
                    />
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {cam.location?.address || `${cam.lat.toFixed(4)}, ${cam.long.toFixed(4)}`}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '6px',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <span>{cam.department_name?.split(' ')[0] || 'Statewide'}</span>
                    <span>{cam.protocol}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panel Accessibility Footer */}
          <div
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderTop: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-secondary)',
              fontSize: '10px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Keyboard accessible: Tab & Enter to select</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>EPSG:4326</span>
          </div>
        </aside>
      )}

      {/* 6. Selected Camera Detail Drawer */}
      {selectedCamera && (
        <CameraDetailDrawer
          camera={selectedCamera}
          onClose={() => setSelectedCamera(null)}
          onCenterOnMap={(lat, long) => flyToCamera(lat, long)}
        />
      )}
    </div>
  );
}
