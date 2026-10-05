'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  MapPin,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Shield,
  Layers,
  Search,
  AlertCircle,
  Activity,
  Radio,
  X,
} from 'lucide-react';
import { Camera, OperationalStatus } from '@/types/camera';
import { camerasApi } from '@/lib/api/cameras';
import { CameraDetailDrawer } from './CameraDetailDrawer';
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

export const GUJARAT_CITY_COORDINATES: Record<string, { center: [number, number]; zoom: number }> = {
  Ahmedabad: { center: [72.5714, 23.0225], zoom: 12 },
  Surat: { center: [72.8311, 21.1702], zoom: 12 },
  Vadodara: { center: [73.1812, 22.3072], zoom: 12 },
  Rajkot: { center: [70.8022, 22.3039], zoom: 12 },
  Gandhinagar: { center: [72.6369, 23.2156], zoom: 12 },
};

/**
 * Extracts normalized city/jurisdiction name from camera metadata.
 * Uses existing data model: location.district or location.city.
 */
export function getCameraCity(camera: Camera): string {
  return camera.location?.district || camera.location?.city || '';
}

/**
 * Extracts or infers state name from camera metadata.
 * Uses location.state directly if provided, or infers from department/address/district.
 * Falls back to 'Gujarat' for the default demo fixtures.
 */
export function getCameraState(camera: Camera): string {
  if (camera.location?.state) return camera.location.state;
  const dept = camera.department_name || '';
  const addr = camera.location?.address || '';
  const dist = camera.location?.district || '';
  const combined = `${dept} ${addr} ${dist}`.toLowerCase();
  if (combined.includes('uttar pradesh') || combined.includes('up police')) return 'Uttar Pradesh';
  if (combined.includes('maharashtra') || combined.includes('mumbai police')) return 'Maharashtra';
  if (combined.includes('rajasthan')) return 'Rajasthan';
  if (combined.includes('delhi')) return 'Delhi';
  return 'Gujarat';
}

/**
 * Human-readable label for camera feed data source / provenance.
 */
export function formatSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'RESEARCH_VIDEO':
      return 'Research Video';
    case 'SYNTHETIC_STREAM':
      return 'Synthetic Stream';
    case 'DEMO_FILE':
      return 'Demo File';
    case 'REAL_RTSP':
      return 'Live RTSP';
    case 'REAL_ONVIF':
      return 'Live ONVIF';
    default:
      return sourceType
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
  }
}

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
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('ALL');
  const [mapBoundsText, setMapBoundsText] = useState<string>('');
  const [totalInViewport, setTotalInViewport] = useState<number>(0);

  // Dynamic filter dropdown states
  const [activeDropdown, setActiveDropdown] = useState<'LOCATION' | 'STATUS' | 'SOURCE' | null>(null);
  const [locationSearchTerm, setLocationSearchTerm] = useState<string>('');
  const filterContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterContainerRef.current && !filterContainerRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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

        let statusColor = '#93B3E6'; // Connecting / operational default
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

  // Dynamic states with camera counts derived from current camera dataset
  const availableStates = useMemo(() => {
    const counts = new Map<string, number>();
    cameras.forEach((cam) => {
      const state = getCameraState(cam);
      if (state) {
        counts.set(state, (counts.get(state) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cameras]);

  // Dynamic cities derived from current camera dataset, filtered by selected state
  const availableCities = useMemo(() => {
    const counts = new Map<string, number>();
    cameras.forEach((cam) => {
      const camState = getCameraState(cam);
      if (stateFilter === 'ALL' || camState === stateFilter) {
        const city = getCameraCity(cam);
        if (city) {
          counts.set(city, (counts.get(city) || 0) + 1);
        }
      }
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cameras, stateFilter]);

  // Dynamic operational statuses with camera counts
  const availableStatuses = useMemo(() => {
    const counts = new Map<string, number>();
    cameras.forEach((cam) => {
      const st = cam.operational_status;
      counts.set(st, (counts.get(st) || 0) + 1);
    });
    const standard = ['ONLINE', 'DEGRADED', 'OFFLINE', 'ERROR'];
    const result: { status: string; count: number }[] = [];
    standard.forEach((st) => {
      if (counts.has(st)) {
        result.push({ status: st, count: counts.get(st)! });
      }
    });
    counts.forEach((count, st) => {
      if (!standard.includes(st)) {
        result.push({ status: st, count });
      }
    });
    return result;
  }, [cameras]);

  // Dynamic source types with camera counts
  const availableSources = useMemo(() => {
    const counts = new Map<string, number>();
    cameras.forEach((cam) => {
      const src = cam.source_type || 'SYNTHETIC_STREAM';
      counts.set(src, (counts.get(src) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([source, count]) => ({ source, label: formatSourceLabel(source), count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cameras]);

  // Filter cameras for the accessible sidebar and map markers
  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      const matchesSearch =
        !searchFilter ||
        cam.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        cam.location?.address?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        cam.location?.district?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        cam.location?.zone?.toLowerCase().includes(searchFilter.toLowerCase());

      const camState = getCameraState(cam);
      const matchesState = stateFilter === 'ALL' || camState === stateFilter;

      const camCity = getCameraCity(cam);
      const matchesCity = cityFilter === 'ALL' || camCity.toLowerCase() === cityFilter.toLowerCase();

      const matchesStatus = statusFilter === 'ALL' || cam.operational_status === statusFilter;

      const camSource = cam.source_type || 'SYNTHETIC_STREAM';
      const matchesSource = sourceTypeFilter === 'ALL' || camSource === sourceTypeFilter;

      return matchesSearch && matchesState && matchesCity && matchesStatus && matchesSource;
    });
  }, [cameras, searchFilter, stateFilter, cityFilter, statusFilter, sourceTypeFilter]);

  // Synchronize markers whenever filteredCameras state changes (Map + List synchronization)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    updateMapMarkers(filteredCameras, mapInstanceRef.current);
  }, [filteredCameras, updateMapMarkers]);

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

  // Hierarchical state selection with dynamic camera centroid fly-to
  const handleStateSelect = useCallback((state: string) => {
    setStateFilter(state);
    // If the currently selected city doesn't belong to the new state, reset city filter
    if (cityFilter !== 'ALL' && state !== 'ALL') {
      const cityExistsInState = cameras.some(
        (cam) => getCameraState(cam) === state && getCameraCity(cam).toLowerCase() === cityFilter.toLowerCase()
      );
      if (!cityExistsInState) {
        setCityFilter('ALL');
      }
    }
    if (!mapInstanceRef.current) return;
    if (state === 'ALL') {
      mapInstanceRef.current.flyTo({
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        essential: true,
        duration: 1400,
      });
      return;
    }
    // Fly to state centroid calculated from cameras in that state
    const stateCameras = cameras.filter((cam) => getCameraState(cam) === state);
    if (stateCameras.length > 0) {
      const avgLat = stateCameras.reduce((acc, c) => acc + c.lat, 0) / stateCameras.length;
      const avgLong = stateCameras.reduce((acc, c) => acc + c.long, 0) / stateCameras.length;
      mapInstanceRef.current.flyTo({
        center: [avgLong, avgLat],
        zoom: 9,
        essential: true,
        duration: 1400,
      });
    }
  }, [cameras, cityFilter]);

  // Dependent city selection with dynamic coordinate resolution and fly-to
  const handleCitySelect = useCallback((city: string) => {
    setCityFilter(city);
    if (!mapInstanceRef.current) return;

    if (city === 'ALL') {
      if (stateFilter !== 'ALL') {
        const stateCameras = cameras.filter((cam) => getCameraState(cam) === stateFilter);
        if (stateCameras.length > 0) {
          const avgLat = stateCameras.reduce((acc, c) => acc + c.lat, 0) / stateCameras.length;
          const avgLong = stateCameras.reduce((acc, c) => acc + c.long, 0) / stateCameras.length;
          mapInstanceRef.current.flyTo({
            center: [avgLong, avgLat],
            zoom: 9,
            essential: true,
            duration: 1400,
          });
          return;
        }
      }
      mapInstanceRef.current.flyTo({
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        essential: true,
        duration: 1400,
      });
      return;
    }

    if (GUJARAT_CITY_COORDINATES[city]) {
      const { center, zoom } = GUJARAT_CITY_COORDINATES[city];
      mapInstanceRef.current.flyTo({
        center,
        zoom,
        essential: true,
        duration: 1400,
      });
      return;
    }

    // Centroid calculation from actual cameras in that city
    const cityCameras = cameras.filter((cam) => getCameraCity(cam).toLowerCase() === city.toLowerCase());
    if (cityCameras.length > 0) {
      const avgLat = cityCameras.reduce((acc, c) => acc + c.lat, 0) / cityCameras.length;
      const avgLong = cityCameras.reduce((acc, c) => acc + c.long, 0) / cityCameras.length;
      mapInstanceRef.current.flyTo({
        center: [avgLong, avgLat],
        zoom: 12,
        essential: true,
        duration: 1400,
      });
    }
  }, [cameras, stateFilter]);

  // Clear all filters handler
  const handleClearAllFilters = useCallback(() => {
    setStateFilter('ALL');
    setCityFilter('ALL');
    setStatusFilter('ALL');
    setSourceTypeFilter('ALL');
    setSearchFilter('');
    setLocationSearchTerm('');
    setActiveDropdown(null);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo({
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        essential: true,
        duration: 1400,
      });
    }
  }, []);

  const hasActiveFilters =
    stateFilter !== 'ALL' ||
    cityFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    sourceTypeFilter !== 'ALL' ||
    searchFilter.trim() !== '';

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
          backgroundColor: '#070B14',
        }}
      />

      {/* 2. Top-Left Tactical HUD Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '14px',
          left: '14px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '380px',
        }}
      >
        <div
          className="netrava-card"
          style={{
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isLoading ? 'var(--status-warning)' : 'var(--status-success)',
                animation: isLoading ? 'pulse 1s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
              GIS COMMAND MAP
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>
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
              backgroundColor: 'rgba(11, 17, 32, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '3px 8px',
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
          top: '14px',
          right: isSidePanelOpen ? '394px' : '14px',
          zIndex: 10,
          display: 'flex',
          gap: '8px',
          transition: 'right var(--transition-normal)',
        }}
      >
        <button
          onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
          aria-label={isSidePanelOpen ? 'Collapse accessible camera panel' : 'Expand accessible camera panel'}
          className="netrava-card"
          style={{
            color: 'var(--text-primary)',
            padding: '8px 14px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Layers size={14} color="var(--accent-blue)" />
          <span>{isSidePanelOpen ? 'Hide List' : 'Show List'}</span>
          {isSidePanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* 4. Bottom-Left Map Legend */}
      <div
        className="netrava-card"
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '14px',
          zIndex: 10,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '11px',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em' }}>Legend:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Online</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Degraded</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#64748b' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Offline</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Error</span>
        </div>
      </div>

      {/* 5. Accessible Camera Side Dock (Non-visual & Keyboard Alternative) */}
      {isSidePanelOpen && (
        <aside
          aria-label="Camera List Panel"
          style={{
            width: '380px',
            height: '100%',
            backgroundColor: 'rgba(11, 17, 32, 0.95)',
            backdropFilter: 'blur(16px)',
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
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'rgba(5, 8, 15, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={15} color="var(--accent-primary)" />
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Viewport Cameras
                </h4>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(215, 25, 63, 0.12)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(215, 25, 63, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {filteredCameras.length}
              </span>
            </div>

            {/* Search and Status Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  color="var(--text-muted)"
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  className="netrava-input"
                  placeholder="Filter cameras in view..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  aria-label="Filter cameras in current view"
                  style={{
                    width: '100%',
                    paddingLeft: '32px',
                    paddingTop: '6px',
                    paddingBottom: '6px',
                    fontSize: '11px',
                  }}
                />
              </div>

              {/* Dynamic Filter Controls Row */}
              <div
                ref={filterContainerRef}
                style={{
                  position: 'relative',
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {/* 1. LOCATION DROPDOWN TRIGGER */}
                <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '95px' }}>
                  <button
                    type="button"
                    id="gis-filter-dropdown-location"
                    aria-haspopup="true"
                    aria-expanded={activeDropdown === 'LOCATION'}
                    className={`gis-filter-dropdown-btn ${stateFilter !== 'ALL' || cityFilter !== 'ALL' ? 'active' : ''}`}
                    onClick={() => setActiveDropdown(activeDropdown === 'LOCATION' ? null : 'LOCATION')}
                    style={{ width: '100%' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <MapPin size={11} style={{ flexShrink: 0 }} />
                      <span>
                        {cityFilter !== 'ALL'
                          ? cityFilter
                          : stateFilter !== 'ALL'
                          ? stateFilter
                          : 'Location'}
                      </span>
                    </span>
                    <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                  </button>

                  {/* Location Dropdown Menu */}
                  {activeDropdown === 'LOCATION' && (
                    <div
                      className="gis-filter-menu"
                      style={{ left: 0, width: '260px' }}
                      role="dialog"
                      aria-label="Filter cameras by location"
                    >
                      <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                          Geographic Filter
                        </div>
                        {/* Search box within location */}
                        <div style={{ position: 'relative' }}>
                          <Search size={11} color="var(--text-muted)" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                          <input
                            type="text"
                            className="netrava-input"
                            placeholder="Search state or city..."
                            value={locationSearchTerm}
                            onChange={(e) => setLocationSearchTerm(e.target.value)}
                            autoFocus
                            style={{
                              width: '100%',
                              paddingLeft: '26px',
                              paddingRight: locationSearchTerm ? '24px' : '8px',
                              paddingTop: '4px',
                              paddingBottom: '4px',
                              fontSize: '11px',
                            }}
                          />
                          {locationSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setLocationSearchTerm('')}
                              aria-label="Clear location search"
                              style={{
                                position: 'absolute',
                                right: '6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'flex',
                              }}
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px 0' }}>
                        {/* Section 1: STATE */}
                        <div style={{ padding: '4px 10px', fontSize: '9px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          State
                        </div>
                        <button
                          type="button"
                          id="gis-filter-state-all"
                          className={`gis-filter-option ${stateFilter === 'ALL' ? 'active' : ''}`}
                          onClick={() => {
                            handleStateSelect('ALL');
                          }}
                        >
                          <span>All States</span>
                          <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                            {cameras.length}
                          </span>
                        </button>
                        {availableStates
                          .filter((s) => !locationSearchTerm || s.name.toLowerCase().includes(locationSearchTerm.toLowerCase()))
                          .map((s) => (
                            <button
                              key={s.name}
                              id={`gis-filter-state-${s.name.toLowerCase().replace(/\s+/g, '-')}`}
                              className={`gis-filter-option ${stateFilter === s.name ? 'active' : ''}`}
                              onClick={() => {
                                handleStateSelect(s.name);
                              }}
                            >
                              <span>{s.name}</span>
                              <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                                {s.count}
                              </span>
                            </button>
                          ))}

                        {/* Section 2: CITY / JURISDICTION (Dependent on Selected State) */}
                        <div style={{ padding: '8px 10px 4px 10px', fontSize: '9px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.06em', textTransform: 'uppercase', borderTop: '1px solid rgba(255, 255, 255, 0.05)', marginTop: '4px' }}>
                          City / Jurisdiction {stateFilter !== 'ALL' ? `(${stateFilter})` : ''}
                        </div>
                        <button
                          type="button"
                          id="gis-filter-city-all"
                          className={`gis-filter-option ${cityFilter === 'ALL' ? 'active' : ''}`}
                          onClick={() => {
                            handleCitySelect('ALL');
                            setActiveDropdown(null);
                          }}
                        >
                          <span>All Cities</span>
                          <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                            {availableCities.reduce((acc, c) => acc + c.count, 0)}
                          </span>
                        </button>
                        {availableCities
                          .filter((c) => !locationSearchTerm || c.name.toLowerCase().includes(locationSearchTerm.toLowerCase()))
                          .map((c) => (
                            <button
                              key={c.name}
                              id={`gis-filter-city-${c.name.toLowerCase().replace(/\s+/g, '-')}`}
                              className={`gis-filter-option ${cityFilter.toLowerCase() === c.name.toLowerCase() ? 'active' : ''}`}
                              onClick={() => {
                                handleCitySelect(c.name);
                                setActiveDropdown(null);
                              }}
                            >
                              <span>{c.name}</span>
                              <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                                {c.count}
                              </span>
                            </button>
                          ))}
                        {availableCities.filter((c) => !locationSearchTerm || c.name.toLowerCase().includes(locationSearchTerm.toLowerCase())).length === 0 && (
                          <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No matching cities found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. STATUS DROPDOWN TRIGGER */}
                <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '85px' }}>
                  <button
                    type="button"
                    id="gis-filter-dropdown-status"
                    aria-haspopup="true"
                    aria-expanded={activeDropdown === 'STATUS'}
                    className={`gis-filter-dropdown-btn ${statusFilter !== 'ALL' ? 'active' : ''}`}
                    onClick={() => setActiveDropdown(activeDropdown === 'STATUS' ? null : 'STATUS')}
                    style={{ width: '100%' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <SlidersHorizontal size={11} style={{ flexShrink: 0 }} />
                      <span>{statusFilter === 'ALL' ? 'Status' : statusFilter}</span>
                    </span>
                    <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                  </button>

                  {/* Status Dropdown Menu */}
                  {activeDropdown === 'STATUS' && (
                    <div
                      className="gis-filter-menu"
                      style={{ left: 0, width: '180px' }}
                      role="dialog"
                      aria-label="Filter cameras by status"
                    >
                      <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Operational Status
                        </div>
                      </div>
                      <div style={{ padding: '4px 0' }}>
                        <button
                          type="button"
                          id="gis-filter-status-all"
                          className={`gis-filter-option ${statusFilter === 'ALL' ? 'active' : ''}`}
                          onClick={() => {
                            setStatusFilter('ALL');
                            setActiveDropdown(null);
                          }}
                        >
                          <span>All Statuses</span>
                          <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                            {cameras.length}
                          </span>
                        </button>
                        {availableStatuses.map((st) => (
                          <button
                            key={st.status}
                            id={`gis-filter-status-${st.status.toLowerCase()}`}
                            className={`gis-filter-option ${statusFilter === st.status ? 'active' : ''}`}
                            onClick={() => {
                              setStatusFilter(st.status);
                              setActiveDropdown(null);
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  backgroundColor:
                                    st.status === 'ONLINE'
                                      ? 'var(--status-online, #10b981)'
                                      : st.status === 'DEGRADED'
                                      ? 'var(--status-warning, #f59e0b)'
                                      : 'var(--status-critical, #ef4444)',
                                }}
                              />
                              {st.status}
                            </span>
                            <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                              {st.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. SOURCE DROPDOWN TRIGGER */}
                <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '85px' }}>
                  <button
                    type="button"
                    id="gis-filter-dropdown-source"
                    aria-haspopup="true"
                    aria-expanded={activeDropdown === 'SOURCE'}
                    className={`gis-filter-dropdown-btn ${sourceTypeFilter !== 'ALL' ? 'active' : ''}`}
                    onClick={() => setActiveDropdown(activeDropdown === 'SOURCE' ? null : 'SOURCE')}
                    style={{ width: '100%' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Layers size={11} style={{ flexShrink: 0 }} />
                      <span>{sourceTypeFilter === 'ALL' ? 'Source' : formatSourceLabel(sourceTypeFilter)}</span>
                    </span>
                    <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                  </button>

                  {/* Source Dropdown Menu */}
                  {activeDropdown === 'SOURCE' && (
                    <div
                      className="gis-filter-menu"
                      style={{ right: 0, width: '190px' }}
                      role="dialog"
                      aria-label="Filter cameras by data source"
                    >
                      <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Data Source
                        </div>
                      </div>
                      <div style={{ padding: '4px 0' }}>
                        <button
                          type="button"
                          id="gis-filter-source-all"
                          className={`gis-filter-option ${sourceTypeFilter === 'ALL' ? 'active' : ''}`}
                          onClick={() => {
                            setSourceTypeFilter('ALL');
                            setActiveDropdown(null);
                          }}
                        >
                          <span>All Sources</span>
                          <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                            {cameras.length}
                          </span>
                        </button>
                        {availableSources.map((src) => (
                          <button
                            key={src.source}
                            id={`gis-filter-source-${src.source.toLowerCase().replace(/_/g, '-')}`}
                            className={`gis-filter-option ${sourceTypeFilter === src.source ? 'active' : ''}`}
                            onClick={() => {
                              setSourceTypeFilter(src.source);
                              setActiveDropdown(null);
                            }}
                          >
                            <span>{src.label}</span>
                            <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                              {src.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Filter Chips */}
              {hasActiveFilters && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    flexWrap: 'wrap',
                    paddingTop: '2px',
                  }}
                >
                  {stateFilter !== 'ALL' && (
                    <span className="gis-filter-chip">
                      <span>State: {stateFilter}</span>
                      <button
                        type="button"
                        id="gis-chip-remove-state"
                        aria-label={`Remove state filter ${stateFilter}`}
                        className="gis-filter-chip-remove"
                        onClick={() => handleStateSelect('ALL')}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )}
                  {cityFilter !== 'ALL' && (
                    <span className="gis-filter-chip">
                      <span>City: {cityFilter}</span>
                      <button
                        type="button"
                        id="gis-chip-remove-city"
                        aria-label={`Remove city filter ${cityFilter}`}
                        className="gis-filter-chip-remove"
                        onClick={() => handleCitySelect('ALL')}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )}
                  {statusFilter !== 'ALL' && (
                    <span className="gis-filter-chip">
                      <span>Status: {statusFilter}</span>
                      <button
                        type="button"
                        id="gis-chip-remove-status"
                        aria-label={`Remove status filter ${statusFilter}`}
                        className="gis-filter-chip-remove"
                        onClick={() => setStatusFilter('ALL')}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )}
                  {sourceTypeFilter !== 'ALL' && (
                    <span className="gis-filter-chip">
                      <span>Source: {formatSourceLabel(sourceTypeFilter)}</span>
                      <button
                        type="button"
                        id="gis-chip-remove-source"
                        aria-label={`Remove source filter ${formatSourceLabel(sourceTypeFilter)}`}
                        className="gis-filter-chip-remove"
                        onClick={() => setSourceTypeFilter('ALL')}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )}
                  {searchFilter.trim() !== '' && (
                    <span className="gis-filter-chip">
                      <span>Search: "{searchFilter}"</span>
                      <button
                        type="button"
                        id="gis-chip-remove-search"
                        aria-label="Clear search filter"
                        className="gis-filter-chip-remove"
                        onClick={() => setSearchFilter('')}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )}
                  <button
                    type="button"
                    id="gis-filter-clear-all"
                    onClick={handleClearAllFilters}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Camera List - Keyboard Navigable */}
          <div
            role="feed"
            aria-label="Viewport Cameras List"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {isLoading && cameras.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <Activity
                  size={24}
                  color="var(--accent-primary)"
                  style={{ animation: 'pulse 1.5s infinite', margin: '0 auto 8px' }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Loading cameras...
                </div>
              </div>
            )}

            {errorMessage && (
              <div style={{ padding: '8px' }}>
                <ErrorState
                  title="Spatial Query Failed"
                  message={errorMessage}
                  errorCode="BBOX_FETCH_FAILED"
                  onRetry={reloadViewport}
                />
              </div>
            )}

            {!isLoading && !errorMessage && filteredCameras.length === 0 && (
              <div style={{ padding: '16px' }}>
                <EmptyState
                  title={cameras.length === 0 ? "No Cameras in View" : "No Cameras Matching Filters"}
                  message={cameras.length === 0 ? "Pan or zoom out the map to inspect adjacent police zones." : "No cameras match the active filter criteria."}
                  subtext={cameras.length === 0 ? "Cameras outside the current viewport are excluded." : "Try adjusting or clearing your active filters."}
                  action={{
                    label: cameras.length === 0 ? 'Reset View' : 'Clear All Filters',
                    onClick: cameras.length === 0 ? () => {
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
                      }
                    } : handleClearAllFilters,
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
                    padding: '10px 12px',
                    backgroundColor: isSelected ? 'rgba(215, 25, 63, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid',
                    borderColor: isSelected ? 'rgba(215, 25, 63, 0.4)' : 'var(--border-subtle)',
                    borderLeft: isSelected ? '3px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    outline: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {cam.name}
                    </div>
                    <StatusBadge
                      status={cam.operational_status}
                      label={cam.operational_status}
                      size="sm"
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
                    <span style={{ color: '#93C5FD', fontWeight: 600 }}>
                      {cam.location?.district || cam.department_name?.split(' ')[0] || 'Gujarat'}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          backgroundColor: cam.source_type === 'RESEARCH_VIDEO' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(59, 130, 246, 0.12)',
                          color: cam.source_type === 'RESEARCH_VIDEO' ? '#FBBF24' : '#60A5FA',
                          border: `1px solid ${cam.source_type === 'RESEARCH_VIDEO' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(59, 130, 246, 0.25)'}`,
                        }}
                      >
                        {cam.source_type === 'RESEARCH_VIDEO' ? 'RESEARCH' : 'SYNTHETIC'}
                      </span>
                      <span>{cam.protocol}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panel Accessibility Footer */}
          <div
            style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--border-subtle)',
              backgroundColor: 'rgba(5, 8, 15, 0.6)',
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
