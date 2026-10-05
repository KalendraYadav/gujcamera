// ==============================================================================
// Camera Selector Sidebar Component (Live Monitoring Phase 10)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 5.2, Section 14.2)
// Visual Language: Kit8 / Anton Fritsler Police Operations System
// ==============================================================================

'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Video,
  MapPin,
  SlidersHorizontal,
  Radio,
  ChevronDown,
  Info,
  X,
  AlertCircle,
} from 'lucide-react';
import { Camera, OperationalStatus } from '@/types/camera';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getCameraCity, getCameraState, formatSourceLabel } from '@/components/cameras/GisCameraMap';

interface CameraSelectorProps {
  cameras: Camera[];
  selectedCameraId: string | null;
  onSelectCamera: (camera: Camera) => void;
  isLoading?: boolean;
}

/**
 * Parses camera identity for clean, rapid operational scanning.
 * Separates camera code/ID from short operational name.
 */
function parseCameraIdentity(camera: Camera): { idPrefix: string; shortTitle: string } {
  if (camera.name.includes(':')) {
    const parts = camera.name.split(':');
    return {
      idPrefix: parts[0].trim(),
      shortTitle: parts.slice(1).join(':').trim(),
    };
  }
  return {
    idPrefix: camera.name,
    shortTitle: camera.location?.address || camera.department_name || 'Gujarat Jurisdiction',
  };
}

export const CameraSelector: React.FC<CameraSelectorProps> = ({
  cameras,
  selectedCameraId,
  onSelectCamera,
  isLoading = false,
}) => {
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OperationalStatus>('ALL');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('ALL');

  // Filter Dropdown Open State
  const [activeDropdown, setActiveDropdown] = useState<'LOCATION' | 'STATUS' | 'SOURCE' | null>(null);
  const [locationSearchTerm, setLocationSearchTerm] = useState<string>('');
  const filterContainerRef = useRef<HTMLDivElement>(null);

  // Popover State (Card Information)
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const [isPopoverPinned, setIsPopoverPinned] = useState<boolean>(false);
  const [popoverPlacement, setPopoverPlacement] = useState<'down' | 'up'>('down');
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdowns and unpinned popovers on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;

      // Close filter dropdowns if click is outside filter bar
      if (filterContainerRef.current && !filterContainerRef.current.contains(target)) {
        setActiveDropdown(null);
      }

      // Close popover if click is outside any camera card and outside the popover
      if (
        !target.closest('[data-testid^="camera-item-"]') &&
        !target.closest('[data-testid^="camera-info-popover-"]')
      ) {
        setActivePopoverId(null);
        setIsPopoverPinned(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveDropdown(null);
        setActivePopoverId(null);
        setIsPopoverPinned(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // ----------------------------------------------------------------------------
  // DYNAMIC FILTER GENERATION (DATA-DRIVEN FROM CAMERAS DATASET)
  // ----------------------------------------------------------------------------

  // 1. Dynamic states derived from cameras
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

  // 2. Dynamic cities derived from cameras (dependent on selected state)
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

  // 3. Dynamic operational statuses
  const availableStatuses = useMemo(() => {
    const counts = new Map<string, number>();
    cameras.forEach((cam) => {
      counts.set(cam.operational_status, (counts.get(cam.operational_status) || 0) + 1);
    });
    const standard: OperationalStatus[] = ['ONLINE', 'DEGRADED', 'OFFLINE'];
    const result: { status: string; count: number }[] = [];
    standard.forEach((st) => {
      if (counts.has(st)) {
        result.push({ status: st, count: counts.get(st)! });
      }
    });
    counts.forEach((count, st) => {
      if (!standard.includes(st as OperationalStatus)) {
        result.push({ status: st, count });
      }
    });
    return result;
  }, [cameras]);

  // 4. Dynamic video sources / provenance
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

  // State selection handler: resets city if current city does not belong to new state
  const handleStateSelect = useCallback(
    (state: string) => {
      setStateFilter(state);
      if (cityFilter !== 'ALL' && state !== 'ALL') {
        const cityExistsInState = cameras.some(
          (cam) =>
            getCameraState(cam) === state &&
            getCameraCity(cam).toLowerCase() === cityFilter.toLowerCase()
        );
        if (!cityExistsInState) {
          setCityFilter('ALL');
        }
      }
    },
    [cameras, cityFilter]
  );

  const handleCitySelect = useCallback((city: string) => {
    setCityFilter(city);
    setActiveDropdown(null);
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setStateFilter('ALL');
    setCityFilter('ALL');
    setStatusFilter('ALL');
    setSourceTypeFilter('ALL');
    setSearchQuery('');
    setLocationSearchTerm('');
    setActiveDropdown(null);
  }, []);

  // ----------------------------------------------------------------------------
  // FILTERED CAMERAS COMPUTATION
  // ----------------------------------------------------------------------------
  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      // 1. Status Filter
      if (statusFilter !== 'ALL' && cam.operational_status !== statusFilter) {
        return false;
      }

      // 2. State Filter
      if (stateFilter !== 'ALL' && getCameraState(cam) !== stateFilter) {
        return false;
      }

      // 3. City Filter
      if (cityFilter !== 'ALL' && getCameraCity(cam).toLowerCase() !== cityFilter.toLowerCase()) {
        return false;
      }

      // 4. Source Type Filter
      if (sourceTypeFilter !== 'ALL') {
        const camSource = cam.source_type || 'SYNTHETIC_STREAM';
        if (camSource !== sourceTypeFilter) {
          return false;
        }
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = cam.name.toLowerCase().includes(q);
        const matchAddr = cam.location?.address?.toLowerCase().includes(q);
        const matchZone = cam.location?.zone?.toLowerCase().includes(q);
        const matchCity = getCameraCity(cam).toLowerCase().includes(q);
        const matchState = getCameraState(cam).toLowerCase().includes(q);
        const matchDept = cam.department_name?.toLowerCase().includes(q);
        return matchName || matchAddr || matchZone || matchCity || matchState || matchDept;
      }

      return true;
    });
  }, [cameras, searchQuery, statusFilter, stateFilter, cityFilter, sourceTypeFilter]);

  // ----------------------------------------------------------------------------
  // POPOVER INTERACTION HELPERS WITH VIEWPORT CONSTRAINTS
  // ----------------------------------------------------------------------------
  const checkPlacement = (buttonElement: HTMLElement | null) => {
    if (!buttonElement) return;
    const rect = buttonElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 280) {
      setPopoverPlacement('up');
    } else {
      setPopoverPlacement('down');
    }
  };

  const handleInfoMouseEnter = (cameraId: string, buttonElement: HTMLElement | null) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (!isPopoverPinned) {
      checkPlacement(buttonElement);
      setActivePopoverId(cameraId);
    }
  };

  const handleInfoMouseLeave = () => {
    if (!isPopoverPinned) {
      hoverTimeoutRef.current = setTimeout(() => {
        setActivePopoverId(null);
      }, 200);
    }
  };

  const cancelInfoCloseTimer = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const toggleInfoPopover = (cameraId: string, buttonElement: HTMLElement | null) => {
    if (activePopoverId === cameraId && isPopoverPinned) {
      setActivePopoverId(null);
      setIsPopoverPinned(false);
    } else {
      checkPlacement(buttonElement);
      setActivePopoverId(cameraId);
      setIsPopoverPinned(true);
    }
  };

  const closeInfoPopover = () => {
    setActivePopoverId(null);
    setIsPopoverPinned(false);
  };

  const hasActiveFilters =
    stateFilter !== 'ALL' ||
    cityFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    sourceTypeFilter !== 'ALL' ||
    searchQuery.trim() !== '';

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
      {/* ---------------------------------------------------------------------- */}
      {/* HEADER & FILTER BAR                                                   */}
      {/* ---------------------------------------------------------------------- */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(11, 17, 32, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* Title and Count */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
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
              gap: '6px',
            }}
          >
            <Video size={13} color="var(--accent-blue)" />
            <span>Surveillance Feeds</span>
          </div>
          <span
            data-testid="camera-counter-badge"
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
        <div style={{ position: 'relative' }}>
          <Search
            size={12}
            color="var(--text-muted)"
            style={{
              position: 'absolute',
              left: '9px',
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
              paddingLeft: '28px',
              paddingRight: searchQuery ? '24px' : '8px',
              paddingTop: '5px',
              paddingBottom: '5px',
              fontSize: '11px',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search input"
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Scalable Filter Groups Row: [ LOCATION ▾ ] [ STATUS ▾ ] [ SOURCE ▾ ] */}
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
              id="live-filter-dropdown-location"
              data-testid="live-filter-dropdown-location"
              aria-haspopup="true"
              aria-expanded={activeDropdown === 'LOCATION'}
              className={`gis-filter-dropdown-btn ${stateFilter !== 'ALL' || cityFilter !== 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveDropdown(activeDropdown === 'LOCATION' ? null : 'LOCATION')}
              style={{ width: '100%' }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
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
                style={{ left: 0, width: '250px' }}
                role="dialog"
                aria-label="Filter cameras by location"
              >
                <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      marginBottom: '5px',
                    }}
                  >
                    Geographic Filter
                  </div>
                  {/* Search box within location */}
                  <div style={{ position: 'relative' }}>
                    <Search
                      size={11}
                      color="var(--text-muted)"
                      style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }}
                    />
                    <input
                      type="text"
                      className="netrava-input"
                      data-testid="live-filter-location-search"
                      placeholder="Search state or city..."
                      value={locationSearchTerm}
                      onChange={(e) => setLocationSearchTerm(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%',
                        paddingLeft: '24px',
                        paddingRight: locationSearchTerm ? '22px' : '6px',
                        paddingTop: '4px',
                        paddingBottom: '4px',
                        fontSize: '10px',
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
                        <X size={10} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '4px 0' }}>
                  {/* Section 1: STATE */}
                  <div
                    style={{
                      padding: '4px 10px',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: 'var(--accent-primary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    State
                  </div>
                  <button
                    type="button"
                    id="live-filter-state-all"
                    data-testid="live-filter-state-all"
                    className={`gis-filter-option ${stateFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => handleStateSelect('ALL')}
                  >
                    <span>All States</span>
                    <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                      {cameras.length}
                    </span>
                  </button>
                  {availableStates
                    .filter(
                      (s) =>
                        !locationSearchTerm ||
                        s.name.toLowerCase().includes(locationSearchTerm.toLowerCase())
                    )
                    .map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        id={`live-filter-state-${s.name.toLowerCase().replace(/\s+/g, '-')}`}
                        data-testid={`live-filter-state-${s.name.toLowerCase().replace(/\s+/g, '-')}`}
                        className={`gis-filter-option ${stateFilter === s.name ? 'active' : ''}`}
                        onClick={() => handleStateSelect(s.name)}
                      >
                        <span>{s.name}</span>
                        <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                          {s.count}
                        </span>
                      </button>
                    ))}

                  {/* Section 2: CITY / JURISDICTION (Dependent on Selected State) */}
                  <div
                    style={{
                      padding: '8px 10px 4px 10px',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: 'var(--accent-primary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                      marginTop: '4px',
                    }}
                  >
                    City / Jurisdiction {stateFilter !== 'ALL' ? `(${stateFilter})` : ''}
                  </div>
                  <button
                    type="button"
                    id="live-filter-city-all"
                    data-testid="live-filter-city-all"
                    className={`gis-filter-option ${cityFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => handleCitySelect('ALL')}
                  >
                    <span>All Cities</span>
                    <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                      {availableCities.reduce((acc, c) => acc + c.count, 0)}
                    </span>
                  </button>
                  {availableCities
                    .filter(
                      (c) =>
                        !locationSearchTerm ||
                        c.name.toLowerCase().includes(locationSearchTerm.toLowerCase())
                    )
                    .map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        id={`live-filter-city-${c.name.toLowerCase().replace(/\s+/g, '-')}`}
                        data-testid={`live-filter-city-${c.name.toLowerCase().replace(/\s+/g, '-')}`}
                        className={`gis-filter-option ${
                          cityFilter.toLowerCase() === c.name.toLowerCase() ? 'active' : ''
                        }`}
                        onClick={() => handleCitySelect(c.name)}
                      >
                        <span>{c.name}</span>
                        <span style={{ fontSize: '10px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>
                          {c.count}
                        </span>
                      </button>
                    ))}
                  {availableCities.filter(
                    (c) =>
                      !locationSearchTerm ||
                      c.name.toLowerCase().includes(locationSearchTerm.toLowerCase())
                  ).length === 0 && (
                    <div
                      style={{
                        padding: '8px 10px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                      }}
                    >
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
              id="live-filter-dropdown-status"
              data-testid="live-filter-dropdown-status"
              aria-haspopup="true"
              aria-expanded={activeDropdown === 'STATUS'}
              className={`gis-filter-dropdown-btn ${statusFilter !== 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveDropdown(activeDropdown === 'STATUS' ? null : 'STATUS')}
              style={{ width: '100%' }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <SlidersHorizontal size={11} style={{ flexShrink: 0 }} />
                <span>{statusFilter === 'ALL' ? 'Status' : statusFilter}</span>
              </span>
              <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
            </button>

            {/* Status Dropdown Menu */}
            {activeDropdown === 'STATUS' && (
              <div
                className="gis-filter-menu"
                style={{ left: 0, width: '170px' }}
                role="dialog"
                aria-label="Filter cameras by status"
              >
                <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Operational Status
                  </div>
                </div>
                <div style={{ padding: '4px 0' }}>
                  <button
                    type="button"
                    id="live-filter-status-all"
                    data-testid="filter-all"
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
                      type="button"
                      id={`live-filter-status-${st.status.toLowerCase()}`}
                      data-testid={`filter-${st.status.toLowerCase()}`}
                      className={`gis-filter-option ${statusFilter === st.status ? 'active' : ''}`}
                      onClick={() => {
                        setStatusFilter(st.status as OperationalStatus);
                        setActiveDropdown(null);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor:
                              st.status === 'ONLINE'
                                ? 'var(--status-success)'
                                : st.status === 'DEGRADED'
                                ? 'var(--status-warning)'
                                : 'var(--status-offline)',
                          }}
                        />
                        <span>{st.status}</span>
                      </div>
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
              id="live-filter-dropdown-source"
              data-testid="live-filter-dropdown-source"
              aria-haspopup="true"
              aria-expanded={activeDropdown === 'SOURCE'}
              className={`gis-filter-dropdown-btn ${sourceTypeFilter !== 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveDropdown(activeDropdown === 'SOURCE' ? null : 'SOURCE')}
              style={{ width: '100%' }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <Radio size={11} style={{ flexShrink: 0 }} />
                <span>
                  {sourceTypeFilter === 'ALL'
                    ? 'Source'
                    : formatSourceLabel(sourceTypeFilter)}
                </span>
              </span>
              <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
            </button>

            {/* Source Dropdown Menu */}
            {activeDropdown === 'SOURCE' && (
              <div
                className="gis-filter-menu"
                style={{ right: 0, left: 'auto', width: '180px' }}
                role="dialog"
                aria-label="Filter cameras by source provenance"
              >
                <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Stream Provenance
                  </div>
                </div>
                <div style={{ padding: '4px 0' }}>
                  <button
                    type="button"
                    id="live-filter-source-all"
                    data-testid="live-filter-source-all"
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
                      type="button"
                      id={`live-filter-source-${src.source.toLowerCase().replace(/_/g, '-')}`}
                      data-testid={`live-filter-source-${src.source.toLowerCase().replace(/_/g, '-')}`}
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

        {/* Active Filter Chips Bar */}
        {hasActiveFilters && (
          <div
            data-testid="live-active-filter-chips"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'wrap',
              paddingTop: '4px',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {stateFilter !== 'ALL' && (
              <span className="gis-filter-chip" data-testid="active-filter-state">
                <span>{stateFilter}</span>
                <button
                  type="button"
                  className="gis-filter-chip-remove"
                  onClick={() => handleStateSelect('ALL')}
                  aria-label={`Remove state filter ${stateFilter}`}
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {cityFilter !== 'ALL' && (
              <span className="gis-filter-chip" data-testid="active-filter-city">
                <span>{cityFilter}</span>
                <button
                  type="button"
                  className="gis-filter-chip-remove"
                  onClick={() => setCityFilter('ALL')}
                  aria-label={`Remove city filter ${cityFilter}`}
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {statusFilter !== 'ALL' && (
              <span className="gis-filter-chip" data-testid="active-filter-status">
                <span>{statusFilter}</span>
                <button
                  type="button"
                  className="gis-filter-chip-remove"
                  onClick={() => setStatusFilter('ALL')}
                  aria-label={`Remove status filter ${statusFilter}`}
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {sourceTypeFilter !== 'ALL' && (
              <span className="gis-filter-chip" data-testid="active-filter-source">
                <span>{formatSourceLabel(sourceTypeFilter)}</span>
                <button
                  type="button"
                  className="gis-filter-chip-remove"
                  onClick={() => setSourceTypeFilter('ALL')}
                  aria-label={`Remove source filter ${sourceTypeFilter}`}
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {searchQuery.trim() !== '' && (
              <span className="gis-filter-chip" data-testid="active-filter-search">
                <span>&quot;{searchQuery}&quot;</span>
                <button
                  type="button"
                  className="gis-filter-chip-remove"
                  onClick={() => setSearchQuery('')}
                  aria-label="Remove search filter"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            <button
              type="button"
              id="live-filter-clear-all"
              data-testid="live-filter-clear-all"
              onClick={handleClearAllFilters}
              style={{
                background: 'none',
                border: 'none',
                color: '#F87171',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                padding: '2px 4px',
                textDecoration: 'underline',
              }}
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* COMPACT SURVEILLANCE FEED LIST                                         */}
      {/* ---------------------------------------------------------------------- */}
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
            data-testid="camera-empty-state"
            style={{
              padding: '28px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={20} color="var(--text-dim)" />
            <div>No cameras match your current filters.</div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11px', marginTop: '4px' }}
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          filteredCameras.map((camera) => {
            const isSelected = camera.id === selectedCameraId;
            const primaryStream = camera.streams?.[0];
            const isRtsp = primaryStream?.url_or_handle?.startsWith('rtsp://');
            const { idPrefix, shortTitle } = parseCameraIdentity(camera);
            const isPopoverOpen = activePopoverId === camera.id;

            return (
              <div
                key={camera.id}
                role="button"
                tabIndex={0}
                data-testid={`camera-item-${camera.name}`}
                onClick={() => onSelectCamera(camera)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectCamera(camera);
                  }
                }}
                className={`camera-feed-card ${isSelected ? 'active' : ''}`}
              >
                {/* Top Row: Camera ID + Status Badge + Subtle Info Icon (ⓘ) */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      color: isSelected ? '#FFFFFF' : '#F1F5F9',
                      letterSpacing: '0.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={idPrefix}
                  >
                    {idPrefix}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    <StatusBadge
                      status={camera.operational_status}
                      label={camera.operational_status}
                      size="sm"
                    />

                    {/* Subtle Information Icon (ⓘ) */}
                    <button
                      type="button"
                      aria-label={`View camera details for ${camera.name}`}
                      data-testid={`camera-info-btn-${camera.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleInfoPopover(camera.id, e.currentTarget);
                      }}
                      onMouseEnter={(e) => handleInfoMouseEnter(camera.id, e.currentTarget)}
                      onMouseLeave={handleInfoMouseLeave}
                      onFocus={(e) => handleInfoMouseEnter(camera.id, e.currentTarget)}
                      onBlur={handleInfoMouseLeave}
                      style={{
                        background: isPopoverOpen
                          ? 'rgba(59, 130, 246, 0.28)'
                          : 'transparent',
                        border: 'none',
                        color: isPopoverOpen ? '#93C5FD' : 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px 3px',
                        borderRadius: 'var(--radius-xs)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        transition: 'color 0.15s, background-color 0.15s',
                      }}
                      title="Camera Specifications & Telemetry (Click to pin)"
                    >
                      <Info size={12} />
                    </button>
                  </div>
                </div>

                {/* Middle Row: Short Camera Name / Location (Gracefully Truncated) */}
                <div
                  data-testid={`camera-short-name-${camera.name}`}
                  style={{
                    fontSize: '11px',
                    color: isSelected ? 'rgba(255, 255, 255, 0.9)' : '#CBD5E1',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.25,
                  }}
                  title={shortTitle}
                >
                  {shortTitle}
                </div>

                {/* Bottom Row: Stream Protocol / Provenance Indicator */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {isRtsp ? (
                    <span
                      style={{
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: 'var(--status-success-bg)',
                        color: 'var(--status-success)',
                        border: '1px solid var(--status-success-border)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      LIVE HLS
                    </span>
                  ) : (
                    <span
                      style={{
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {camera.protocol}
                    </span>
                  )}

                  {camera.source_type && (
                    <span
                      style={{
                        color: isSelected ? 'rgba(255, 255, 255, 0.75)' : 'var(--text-dim)',
                        fontWeight: 600,
                      }}
                    >
                      {formatSourceLabel(camera.source_type)}
                    </span>
                  )}
                </div>

                {/* -------------------------------------------------------------- */}
                {/* CONTEXTUAL INFORMATION POPOVER (OPAQUE & COMPACT VIA ⓘ)       */}
                {/* -------------------------------------------------------------- */}
                {isPopoverOpen && (
                  <div
                    role="dialog"
                    aria-label={`Specifications for ${camera.name}`}
                    data-testid={`camera-info-popover-${camera.name}`}
                    className="camera-info-popover"
                    style={{
                      ...(popoverPlacement === 'up'
                        ? { bottom: '26px', top: 'auto' }
                        : { top: '26px', bottom: 'auto' }),
                      right: '4px',
                    }}
                    onClick={(e) => {
                      // Prevent clicking inside the popover from selecting the camera behind it
                      e.stopPropagation();
                    }}
                    onMouseEnter={cancelInfoCloseTimer}
                    onMouseLeave={handleInfoMouseLeave}
                  >
                    {/* Popover Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        paddingBottom: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Info size={11} color="#60A5FA" />
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            color: '#93C5FD',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          Camera Information
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="Close specifications"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeInfoPopover();
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '1px',
                          display: 'flex',
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>

                    {/* Popover Content (Compact Label / Value Matrix) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '10.5px' }}>
                      {/* Camera Name */}
                      <div>
                        <div
                          style={{
                            fontSize: '8.5px',
                            textTransform: 'uppercase',
                            color: 'var(--text-dim)',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Camera
                        </div>
                        <div style={{ color: '#FFFFFF', fontWeight: 600, wordBreak: 'break-word', fontSize: '11px' }}>
                          {camera.name}
                        </div>
                      </div>

                      {/* Location / Address */}
                      {camera.location?.address && (
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Location
                          </div>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                            {camera.location.address}
                            {camera.location.zone ? ` (${camera.location.zone})` : ''}
                          </div>
                        </div>
                      )}

                      {/* Department / Authority */}
                      {camera.department_name && (
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Department
                          </div>
                          <div style={{ color: '#E2E8F0', fontWeight: 500, fontSize: '10.5px' }}>
                            {camera.department_name}
                          </div>
                        </div>
                      )}

                      {/* City & State Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            City
                          </div>
                          <div style={{ color: '#FFFFFF', fontWeight: 600 }}>
                            {getCameraCity(camera) || 'Unspecified'}
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            State
                          </div>
                          <div style={{ color: '#FFFFFF', fontWeight: 600 }}>
                            {getCameraState(camera) || 'Gujarat'}
                          </div>
                        </div>
                      </div>

                      {/* Source & Protocol */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Source
                          </div>
                          <div style={{ color: '#93C5FD', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                            {formatSourceLabel(camera.source_type || 'SYNTHETIC_STREAM')}
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Stream Type
                          </div>
                          <div style={{ color: '#FFFFFF', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                            {isRtsp ? 'LIVE HLS' : camera.protocol}
                          </div>
                        </div>
                      </div>

                      {/* Stream Specs */}
                      {primaryStream && (
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Resolution & Codec
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              color: '#FFFFFF',
                            }}
                          >
                            {primaryStream.resolution} • {primaryStream.fps} FPS • {primaryStream.codec}
                          </div>
                        </div>
                      )}

                      {/* Status Health & Coordinates */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Status
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <StatusBadge
                              status={camera.operational_status}
                              label={camera.operational_status}
                              size="sm"
                            />
                          </div>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: '8.5px',
                              textTransform: 'uppercase',
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Coordinates
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '9.5px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {camera.lat.toFixed(4)}°N, {camera.long.toFixed(4)}°E
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
