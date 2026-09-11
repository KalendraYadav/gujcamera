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
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { CameraDetailDrawer } from '@/components/cameras/CameraDetailDrawer';
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
  const [deptFilter, setDeptFilter] = useState<string>('ALL');

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

  // Extract distinct departments for filtering
  const distinctDepartments = Array.from(
    new Set(cameras.map((c) => c.department_name).filter(Boolean))
  ) as string[];

  // Filtered cameras
  const filteredCameras = cameras.filter((cam) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch =
      cam.name.toLowerCase().includes(search) ||
      cam.location?.address?.toLowerCase().includes(search) ||
      cam.location?.district?.toLowerCase().includes(search) ||
      cam.location?.zone?.toLowerCase().includes(search) ||
      cam.id.toLowerCase().includes(search);

    const matchesStatus = statusFilter === 'ALL' || cam.operational_status === statusFilter;
    const matchesDept = deptFilter === 'ALL' || cam.department_name === deptFilter;

    return matchesSearch && matchesStatus && matchesDept;
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
    setDeptFilter('ALL');
  };

  return (
    <AppShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <CameraIcon size={22} color="var(--accent-primary)" />
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                CCTV Camera Registry
              </h1>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
              {isAuditor
                ? 'Read-only equipment catalog & operational telemetry audit across Gujarat Police jurisdictions'
                : 'Authoritative equipment catalog & operational telemetry across Gujarat Police jurisdictions'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <SimulatedDataBadge />

            {isAuditor && (
              <div
                id="auditor-registry-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: 'var(--accent-primary)',
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  padding: 'var(--space-1) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                }}
              >
                <Shield size={13} />
                <span>Read-Only Audit</span>
              </div>
            )}

            {canOnboard && (
              <Link
                href="/admin"
                id="fleet-onboarding-link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'rgba(6, 182, 212, 0.12)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'rgb(34, 211, 238)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <Settings size={14} />
                <span>Fleet Onboarding</span>
              </Link>
            )}

            <Link
              href="/map"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--accent-primary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <MapPin size={14} />
              <span>Open GIS Map</span>
            </Link>

            <button
              id="refresh-registry-btn"
              onClick={fetchRegistryData}
              disabled={isLoading || isRefreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: isRefreshing ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: isLoading || isRefreshing ? 'not-allowed' : 'pointer',
                opacity: isLoading || isRefreshing ? 0.75 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              <RefreshCw
                size={13}
                className={isRefreshing ? 'animate-spin' : ''}
                style={{
                  color: isRefreshing ? 'var(--accent-primary)' : 'currentColor',
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
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Registered Cameras
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {healthSummary ? healthSummary.total_cameras : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Across all district jurisdictions
            </div>
          </div>

          {/* Online */}
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Online & Operational
              </span>
              <CheckCircle2 size={15} color="var(--status-success)" />
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--status-success)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {healthSummary ? healthSummary.online : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Transmitting healthy telemetry
            </div>
          </div>

          {/* Degraded */}
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Degraded Performance
              </span>
              <AlertCircle size={15} color="var(--status-warning)" />
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--status-warning)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {healthSummary ? healthSummary.degraded : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Low FPS / packet loss detected
            </div>
          </div>

          {/* Offline / Error */}
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Offline / Error
              </span>
              <XCircle size={15} color="var(--text-muted)" />
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {healthSummary ? healthSummary.offline + healthSummary.error : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              No recent heartbeat signal
            </div>
          </div>
        </div>

        {/* Health Telemetry Governance Banner */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Activity size={15} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
            <span>
              <strong>Telemetry Scope:</strong> Status metrics reflect registered equipment heartbeats and telemetry stored
              in PostgreSQL. They do not constitute verification that an RTSP video stream is reachable. Live video matrix
              playback is scheduled for <strong>Phase 4C</strong>.
            </span>
          </div>
        </div>

        {/* Search and Filters Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
            <Search
              size={15}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search cameras by code, junction, district, or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search camera registry"
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                fontSize: 'var(--text-xs)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label htmlFor="status-select" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Status:
            </label>
            <select
              id="status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                fontSize: 'var(--text-xs)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
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

          {/* Department Dropdown */}
          {distinctDepartments.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label htmlFor="dept-select" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Jurisdiction:
              </label>
              <select
                id="dept-select"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: 'var(--text-xs)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
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

          {(searchTerm || statusFilter !== 'ALL' || deptFilter !== 'ALL') && (
            <button
              onClick={clearFilters}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Results Count & Viewport Note */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>
            Showing <strong>{filteredCameras.length}</strong> of {cameras.length} registered cameras
          </span>
          <span>Click any row or press Enter to inspect full hardware specifications and telemetry</span>
        </div>

        {/* Camera Registry Data Table */}
        {isLoading && cameras.length === 0 ? (
          <LoadingState
            message="Loading CCTV camera registry..."
            subtext="Querying backend telemetry records and PostGIS metadata"
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
            action={{ label: 'Reset Filter Criteria', onClick: clearFilters }}
          />
        ) : (
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              overflowX: 'auto',
              opacity: isRefreshing ? 0.65 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <table
              role="table"
              aria-label="CCTV Cameras Registry Table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: 'var(--text-xs)',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-default)',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Camera Code & Name</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Status</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Physical Location</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Department</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Protocol / Stream</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Coordinates</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Heartbeat</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>Action</th>
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
                        borderBottom: '1px solid var(--border-subtle)',
                        backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)',
                        outline: 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* Name & ID */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{camera.name}</div>
                        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {camera.id.substring(0, 8)}...
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <StatusBadge
                          label={camera.operational_status}
                          variant={getStatusBadgeVariant(camera.operational_status)}
                          pulse={camera.operational_status === 'ONLINE'}
                        />
                      </td>

                      {/* Location */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {camera.location?.address || 'Street unassigned'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {camera.location?.zone ? `${camera.location.zone}, ` : ''}
                          {camera.location?.district || 'District N/A'}
                        </div>
                      </td>

                      {/* Department */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-secondary)' }}>
                        {camera.department_name || 'Statewide HQ'}
                      </td>

                      {/* Protocol & Stream Specs */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-xs)',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          {camera.protocol}
                        </span>
                        {firstStream && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {firstStream.resolution} @ {firstStream.fps}fps
                          </div>
                        )}
                      </td>

                      {/* Coordinates */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {camera.lat.toFixed(4)}, {camera.long.toFixed(4)}
                      </td>

                      {/* Heartbeat */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {formatTimestamp(camera.health?.last_heartbeat)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCamera(camera);
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-xs)',
                            color: 'var(--text-primary)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
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
