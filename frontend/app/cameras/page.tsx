'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Camera as CameraIcon,
  Search,
  RefreshCw,
  Filter,
  Layers,
  Activity,
  AlertTriangle,
  Radio,
  ExternalLink,
  Shield,
  MapPin,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Settings,
} from 'lucide-react';

import { AppShell } from '@/components/layout/AppShell';
import { Camera, CameraHealthSummary, OperationalStatus } from '@/types/camera';
import { camerasApi } from '@/lib/api/cameras';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { CameraDetailDrawer } from '@/components/cameras/CameraDetailDrawer';
import { getCameraCity, getCameraState, formatSourceLabel } from '@/components/cameras/GisCameraMap';
import { useAuth } from '@/lib/auth/context';
import { hasRoleAccess } from '@/lib/auth/rbac';
import Link from 'next/link';

export default function CameraRegistryPage() {
  const { user } = useAuth();
  const canOnboard = hasRoleAccess(user?.role, ['SUPER_ADMIN', 'DEPARTMENT_ADMIN']);
  const isAuditor = user?.role === 'SYSTEM_AUDITOR';

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [healthSummary, setHealthSummary] = useState<CameraHealthSummary | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const isRefreshingRef = React.useRef<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('ALL');

  const fetchRegistryData = useCallback(async () => {
    // Prevent duplicate concurrent refresh requests
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setError(null);

    try {
      // Parallel fetch of camera list and health summary
      const [camerasRes, summaryRes] = await Promise.all([
        camerasApi.getCameras({ limit: 100 }),
        camerasApi.getCameraHealthSummary(),
      ]);

      setCameras(camerasRes.data);
      setHealthSummary(summaryRes);

      // Keep selected camera synced if one is currently inspected
      setSelectedCamera((prev) => {
        if (!prev) return null;
        return camerasRes.data.find((c) => c.id === prev.id) || prev;
      });
    } catch (err: any) {
      console.error('Failed to fetch camera registry:', err);
      setError(err.message || 'Camera registry unavailable. Network or authorization error.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchRegistryData();
  }, [fetchRegistryData]);

  // Handle query parameter deep linking (?id=... or ?search=...)
  useEffect(() => {
    if (typeof window !== 'undefined' && cameras.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('id');
      const searchParam = params.get('search');
      if (searchParam && !searchTerm) {
        setSearchTerm(searchParam);
      }
      if (targetId) {
        const matchingCam = cameras.find((c) => c.id === targetId);
        if (matchingCam) {
          setSelectedCamera(matchingCam);
        }
      }
    }
  }, [cameras, searchTerm]);

  // Extract distinct states, cities (dependent on state), departments, and source types
  const distinctStates = Array.from(
    new Set(cameras.map((c) => getCameraState(c)).filter(Boolean))
  ) as string[];

  const distinctCities = Array.from(
    new Set(
      cameras
        .filter((c) => stateFilter === 'ALL' || getCameraState(c) === stateFilter)
        .map((c) => getCameraCity(c))
        .filter(Boolean)
    )
  ) as string[];

  const distinctDepartments = Array.from(
    new Set(cameras.map((c) => c.department_name).filter(Boolean))
  ) as string[];

  const distinctSourceTypes = Array.from(
    new Set(cameras.map((c) => c.source_type).filter(Boolean))
  ) as string[];

  // Filtered cameras
  const filteredCameras = cameras.filter((cam) => {
    const search = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !search ||
      cam.name.toLowerCase().includes(search) ||
      cam.location?.address?.toLowerCase().includes(search) ||
      cam.location?.district?.toLowerCase().includes(search) ||
      cam.location?.zone?.toLowerCase().includes(search) ||
      getCameraCity(cam).toLowerCase().includes(search) ||
      getCameraState(cam).toLowerCase().includes(search) ||
      cam.department_name?.toLowerCase().includes(search) ||
      cam.id.toLowerCase().includes(search);

    const matchesStatus = statusFilter === 'ALL' || cam.operational_status === statusFilter;
    const matchesState = stateFilter === 'ALL' || getCameraState(cam) === stateFilter;
    const matchesCity = cityFilter === 'ALL' || getCameraCity(cam).toLowerCase() === cityFilter.toLowerCase();
    const matchesDept = deptFilter === 'ALL' || cam.department_name === deptFilter;
    const matchesSource = sourceTypeFilter === 'ALL' || cam.source_type === sourceTypeFilter;

    return matchesSearch && matchesStatus && matchesState && matchesCity && matchesDept && matchesSource;
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

  const formatTimestamp = (ts?: string) => {
    if (!ts) return 'No heartbeat';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setStateFilter('ALL');
    setCityFilter('ALL');
    setDeptFilter('ALL');
    setSourceTypeFilter('ALL');
  };

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Page Header */}
        <div
          className="netrava-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            padding: '14px 20px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: 'rgba(215, 25, 63, 0.12)',
                  border: '1px solid rgba(215, 25, 63, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CameraIcon size={15} color="#F87171" />
              </div>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.01em', margin: 0 }}>
                CCTV Camera Registry
              </h1>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '3px', margin: 0 }}>
              {isAuditor
                ? 'Read-only equipment catalog & operational telemetry across Gujarat Police jurisdictions.'
                : 'Registered camera equipment & operational telemetry across Gujarat Police jurisdictions.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isAuditor && (
              <div
                id="auditor-registry-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: 'var(--text-xs)',
                  color: '#60A5FA',
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-xs)',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                <Shield size={12} />
                <span>Read-Only Audit</span>
              </div>
            )}

            {canOnboard && (
              <Link
                href="/admin"
                id="fleet-onboarding-link"
                className="btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: 'var(--text-sm)',
                  textDecoration: 'none',
                }}
              >
                <Settings size={14} />
                <span>Fleet Onboarding</span>
              </Link>
            )}

            <Link
              href="/map"
              className="btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: 'var(--text-sm)',
                textDecoration: 'none',
              }}
            >
              <MapPin size={14} color="#60A5FA" />
              <span>GIS Map</span>
            </Link>

            <button
              id="refresh-registry-btn"
              onClick={fetchRegistryData}
              disabled={isLoading || isRefreshing}
              className="btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: 'var(--text-sm)',
              }}
            >
              <RefreshCw
                size={14}
                className={isRefreshing ? 'animate-spin' : ''}
                style={{
                  color: isRefreshing ? '#F87171' : 'currentColor',
                }}
              />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Telemetry Summary Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-3)',
            opacity: isRefreshing ? 0.65 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {/* Total Registered */}
          <div
            className="netrava-card"
            style={{ padding: '14px 16px', minHeight: '88px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
          >
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Total Registered Cameras
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {healthSummary ? healthSummary.total_cameras : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              All jurisdictions
            </div>
          </div>

          {/* Online */}
          <div
            className="netrava-card"
            style={{ padding: '14px 16px', minHeight: '88px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Online &amp; Operational
              </span>
              <CheckCircle2 size={15} color="#34D399" />
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: '#34D399', fontVariantNumeric: 'tabular-nums' }}>
              {healthSummary ? healthSummary.online : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Healthy telemetry
            </div>
          </div>

          {/* Degraded */}
          <div
            className="netrava-card"
            style={{ padding: '14px 16px', minHeight: '88px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Degraded Performance
              </span>
              <AlertCircle size={15} color="#FBBF24" />
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: '#FBBF24', fontVariantNumeric: 'tabular-nums' }}>
              {healthSummary ? healthSummary.degraded : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Low FPS / packet loss detected
            </div>
          </div>

          {/* Offline / Error */}
          <div
            className="netrava-card"
            style={{ padding: '14px 16px', minHeight: '88px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Offline / Error
              </span>
              <XCircle size={15} color="#94A3B8" />
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {healthSummary ? healthSummary.offline + healthSummary.error : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              No heartbeat signal
            </div>
          </div>
        </div>

        {/* Health Telemetry Governance Banner */}
        <div
          className="netrava-card"
          style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={14} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
            <span>
              <strong>Telemetry Scope:</strong> Heartbeat metrics reflect stored telemetry in PostgreSQL; stream reachability is verified on playback.
            </span>
          </div>
        </div>

        {/* Search and Filters Toolbar */}
        <div
          className="netrava-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '12px 16px',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
            <Search
              size={14}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              className="netrava-input"
              placeholder="Search cameras by code, junction, district, or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search camera registry"
              style={{
                width: '100%',
                paddingLeft: '32px',
                paddingTop: '6px',
                paddingBottom: '6px',
                fontSize: 'var(--text-sm)',
              }}
            />
          </div>

          {/* Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="status-select" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Status:
            </label>
            <select
              id="status-select"
              className="netrava-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '5px 10px',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ONLINE">Online</option>
              <option value="DEGRADED">Degraded</option>
              <option value="OFFLINE">Offline</option>
              <option value="CONNECTING">Connecting</option>
              <option value="ERROR">Error</option>
            </select>
          </div>

          {/* State Dropdown */}
          {distinctStates.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="state-select" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                State:
              </label>
              <select
                id="state-select"
                className="netrava-input"
                value={stateFilter}
                onChange={(e) => {
                  const newState = e.target.value;
                  setStateFilter(newState);
                  if (cityFilter !== 'ALL' && newState !== 'ALL') {
                    const cityExists = cameras.some(
                      (c) => getCameraState(c) === newState && getCameraCity(c).toLowerCase() === cityFilter.toLowerCase()
                    );
                    if (!cityExists) setCityFilter('ALL');
                  }
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  maxWidth: '160px',
                }}
              >
                <option value="ALL">All States</option>
                {distinctStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* City / District Dropdown (Dependent on State) */}
          {distinctCities.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="city-select" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                City:
              </label>
              <select
                id="city-select"
                className="netrava-input"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                style={{
                  padding: '5px 10px',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  maxWidth: '180px',
                }}
              >
                <option value="ALL">All Cities</option>
                {distinctCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Department Dropdown */}
          {distinctDepartments.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="dept-select" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Jurisdiction:
              </label>
              <select
                id="dept-select"
                className="netrava-input"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                style={{
                  padding: '5px 10px',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  maxWidth: '220px',
                }}
              >
                <option value="ALL">All Jurisdictions</option>
                {distinctDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Video Source Type Dropdown */}
          {distinctSourceTypes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="source-type-select" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Source:
              </label>
              <select
                id="source-type-select"
                className="netrava-input"
                value={sourceTypeFilter}
                onChange={(e) => setSourceTypeFilter(e.target.value)}
                style={{
                  padding: '5px 10px',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  maxWidth: '200px',
                }}
              >
                <option value="ALL">All Sources</option>
                {distinctSourceTypes.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(searchTerm || statusFilter !== 'ALL' || stateFilter !== 'ALL' || cityFilter !== 'ALL' || deptFilter !== 'ALL' || sourceTypeFilter !== 'ALL') && (
            <button
              onClick={clearFilters}
              className="btn-secondary"
              style={{
                fontSize: 'var(--text-sm)',
                padding: '5px 12px',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Results Count & Viewport Note */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
          <span>
            Showing <strong>{filteredCameras.length}</strong> of {cameras.length} cameras
          </span>
          <span>Select row to inspect hardware specifications and stream telemetry</span>
        </div>

        {/* Camera Registry Data Table */}
        {isLoading && cameras.length === 0 ? (
          <LoadingState
            message="Loading CCTV camera registry..."
            subtext="Querying backend telemetry records and spatial metadata"
          />
        ) : error ? (
          <ErrorState
            title="Camera Registry Unavailable"
            message={error}
            errorCode="CAMERA_REGISTRY_ERROR"
            onRetry={fetchRegistryData}
          />
        ) : filteredCameras.length === 0 ? (
          <EmptyState
            title="No Cameras Found"
            message="No registered CCTV cameras match the active search and filter criteria."
            action={{ label: 'Reset Filters', onClick: clearFilters }}
          />
        ) : (
          <div
            className="netrava-card"
            style={{
              padding: 0,
              overflowX: 'auto',
              opacity: isRefreshing ? 0.65 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <table
              role="table"
              aria-label="CCTV Cameras Registry Table"
              className="netrava-table"
              style={{
                width: '100%',
                textAlign: 'left',
                fontSize: 'var(--text-sm)',
              }}
            >
              <thead>
                <tr>
                  <th>Camera Code & Name</th>
                  <th>Status</th>
                  <th>Physical Location</th>
                  <th>Department</th>
                  <th>Protocol / Stream</th>
                  <th>Coordinates</th>
                  <th>Heartbeat</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCameras.map((camera) => {
                  const isSelected = selectedCamera?.id === camera.id;
                  const firstStream = camera.streams?.[0];

                  return (
                    <tr
                      key={camera.id}
                      tabIndex={0}
                      role="row"
                      aria-label={`Camera ${camera.name}, Status ${camera.operational_status}`}
                      onClick={() => setSelectedCamera(camera)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedCamera(camera);
                        }
                      }}
                      style={{
                        backgroundColor: isSelected ? 'rgba(215, 25, 63, 0.08)' : undefined,
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      {/* Name & ID */}
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{camera.name}</div>
                        <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                          {camera.id.substring(0, 8)}...
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <StatusBadge
                          status={camera.operational_status}
                          label={camera.operational_status}
                          size="sm"
                        />
                      </td>

                      {/* Location */}
                      <td>
                        <div style={{ color: 'var(--text-primary)' }}>
                          {camera.location?.address || 'Street unassigned'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>
                          {camera.location?.zone ? `${camera.location.zone}, ` : ''}
                          {camera.location?.district || 'District N/A'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: 'rgba(59, 130, 246, 0.12)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              color: '#60A5FA',
                              fontWeight: 600,
                            }}
                          >
                            {getCameraCity(camera) ? `${getCameraCity(camera)}, ${getCameraState(camera)}` : getCameraState(camera) || 'Unassigned'}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: camera.source_type === 'RESEARCH_VIDEO' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(59, 130, 246, 0.12)',
                              border: `1px solid ${camera.source_type === 'RESEARCH_VIDEO' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(59, 130, 246, 0.25)'}`,
                              color: camera.source_type === 'RESEARCH_VIDEO' ? '#FBBF24' : '#60A5FA',
                              fontWeight: 600,
                            }}
                          >
                            {formatSourceLabel(camera.source_type || 'SYNTHETIC_STREAM').toUpperCase()}
                          </span>
                        </div>
                      </td>

                      {/* Department */}
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {camera.department_name || 'Statewide HQ'}
                      </td>

                      {/* Protocol & Stream Specs */}
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-xs)',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--border-subtle)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          {camera.protocol}
                        </span>
                        {firstStream && (
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                            {firstStream.resolution || 'UNKNOWN'}{firstStream.fps != null ? ` @ ${firstStream.fps}fps` : ''}
                          </div>
                        )}
                      </td>

                      {/* Coordinates */}
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}>
                        {camera.lat != null && camera.long != null
                          ? `${Number(camera.lat).toFixed(4)}, ${Number(camera.long).toFixed(4)}`
                          : 'UNAVAILABLE'}
                      </td>

                      {/* Heartbeat */}
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatTimestamp(camera.health?.last_heartbeat)}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCamera(camera);
                          }}
                          className="btn-secondary"
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Selected Camera Detail Drawer */}
        {selectedCamera && (
          <CameraDetailDrawer
            camera={selectedCamera}
            onClose={() => setSelectedCamera(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
