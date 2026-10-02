'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Camera as CameraIcon,
  Radio,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Zap,
  Server,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Info,
  Layers,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { camerasApi } from '@/lib/api/cameras';
import { useAuth } from '@/lib/auth/context';
import { hasRoleAccess } from '@/lib/auth/rbac';
import {
  CameraProtocol,
  ConnectionProbeResult,
  ConnectorRecord,
  DepartmentRecord,
} from '@/types/camera';
import { ApiError } from '@/types/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface DuplicateErrorInfo {
  endpoint: string;
  existingCameraId?: string;
  existingCameraName?: string;
}

export default function FleetAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const isAuthorized = hasRoleAccess(user?.role, ['SUPER_ADMIN', 'DEPARTMENT_ADMIN']);

  // Protocol connectors & departments state
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [supportedProtocols, setSupportedProtocols] = useState<CameraProtocol[]>(['RTSP', 'ONVIF']);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(true);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true);

  // Onboarding form state
  const [name, setName] = useState('CAM-AHM-07: SG Highway - Thaltej Crossroad Junction');
  const [departmentId, setDepartmentId] = useState(user?.department_id || '');
  const [protocol, setProtocol] = useState<CameraProtocol>('RTSP');
  const [connectorId, setConnectorId] = useState('');
  const [streamUrl, setStreamUrl] = useState('rtsp://localhost:8554/live/cam-ahm-01');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [lat, setLat] = useState('23.051280');
  const [long, setLong] = useState('72.518420');
  const [address, setAddress] = useState('Thaltej Crossroad, SG Highway');
  const [zone, setZone] = useState('West Zone');
  const [district, setDistrict] = useState('Ahmedabad');

  // Probe testing state
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<ConnectionProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Onboarding submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<DuplicateErrorInfo | null>(null);

  useEffect(() => {
    async function loadMetadata() {
      try {
        setIsLoadingConnectors(true);
        setIsLoadingDepartments(true);

        const [connRes, deptRes] = await Promise.allSettled([
          camerasApi.getConnectors(),
          camerasApi.getDepartments(),
        ]);

        if (connRes.status === 'fulfilled') {
          setConnectors(connRes.value.connectors);
          setSupportedProtocols(connRes.value.supported_protocols);
          if (connRes.value.connectors.length > 0) {
            const rtspConn = connRes.value.connectors.find((c) => c.adapter_type.includes('RTSP')) || connRes.value.connectors[0];
            setConnectorId(rtspConn.id);
          }
        }

        if (deptRes.status === 'fulfilled' && deptRes.value.length > 0) {
          setDepartments(deptRes.value);
          if (user?.role === 'DEPARTMENT_ADMIN' && user.department_id) {
            setDepartmentId(user.department_id);
          } else {
            setDepartmentId((prev) => {
              if (prev && deptRes.value.some((d) => d.id === prev)) return prev;
              const ahmDept = deptRes.value.find((d) => d.name.toLowerCase().includes('ahmedabad')) || deptRes.value[0];
              return ahmDept.id;
            });
          }
        }
      } catch (err: any) {
        console.warn('Could not load administrative metadata dynamically:', err);
      } finally {
        setIsLoadingConnectors(false);
        setIsLoadingDepartments(false);
      }
    }
    loadMetadata();
  }, [user]);

  // Keep departmentId synced if user changes
  useEffect(() => {
    if (user?.role === 'DEPARTMENT_ADMIN' && user.department_id) {
      setDepartmentId(user.department_id);
    }
  }, [user]);

  // Update default URL and credentials when protocol toggles
  const handleProtocolChange = (newProtocol: CameraProtocol) => {
    setProtocol(newProtocol);
    setProbeResult(null);
    setProbeError(null);

    if (newProtocol === 'RTSP') {
      setStreamUrl('rtsp://localhost:8554/live/cam-ahm-01');
      setUsername('admin');
      setPassword('');
      const rtspConn = connectors.find((c) => c.adapter_type.includes('RTSP'));
      if (rtspConn) setConnectorId(rtspConn.id);
    } else if (newProtocol === 'ONVIF') {
      setStreamUrl('http://localhost:8555/onvif/device_service');
      setUsername('admin');
      setPassword('GujaratPolice@2026');
      const onvifConn = connectors.find((c) => c.adapter_type.includes('ONVIF'));
      if (onvifConn) setConnectorId(onvifConn.id);
    }
  };

  // Run live protocol adapter probe
  const handleTestConnection = async () => {
    if (!streamUrl.trim()) {
      setProbeError('Stream URL / Endpoint is required for connection testing');
      return;
    }

    setIsProbing(true);
    setProbeResult(null);
    setProbeError(null);

    try {
      const result = await camerasApi.testConnection({
        protocol,
        url_or_handle: streamUrl.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        timeoutMs: 5000,
      });
      setProbeResult(result);
    } catch (err: any) {
      setProbeError(err.message || 'Connection probe failed due to network error');
    } finally {
      setIsProbing(false);
    }
  };

  // Submit camera onboarding
  const handleRegisterCamera = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);
    setDuplicateError(null);

    try {
      const targetConnector =
        connectorId ||
        (connectors.length > 0 ? connectors[0].id : 'c1111111-0000-0000-0000-000000000001');

      const newCamera = await camerasApi.createCamera({
        name: name.trim(),
        department_id: departmentId,
        lat: parseFloat(lat),
        long: parseFloat(long),
        protocol,
        connector_type_id: targetConnector,
        operational_status: probeResult?.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
        location: {
          address: address.trim(),
          zone: zone.trim(),
          district: district.trim(),
        },
        stream: {
          codec: probeResult?.streamMetadata?.codec || 'h264',
          resolution: probeResult?.streamMetadata?.resolution || '1920x1080',
          fps: probeResult?.streamMetadata?.fps || 25,
          url_or_handle: probeResult?.streamMetadata?.streamUri || streamUrl.trim(),
        },
      });

      setSubmitSuccess(`Camera '${newCamera.name}' successfully onboarded with ID ${newCamera.id}!`);
    } catch (err: any) {
      // Detect duplicate stream endpoint conflict and surface an actionable banner
      const isDuplicate =
        (err instanceof ApiError && (err.errorCode === 'DUPLICATE_STREAM_ENDPOINT' || err.statusCode === 409)) ||
        err?.errorCode === 'DUPLICATE_STREAM_ENDPOINT' ||
        err?.message?.includes('already registered to another camera');

      if (isDuplicate) {
        setDuplicateError({
          endpoint: streamUrl.trim(),
          existingCameraId: err.existingCamera?.id,
          existingCameraName: err.existingCamera?.name,
        });
      } else {
        setSubmitError(err.message || 'Failed to onboard camera. Verify authorization and unique stream URL.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <AppShell>
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: 'var(--space-6)' }}>
          <LoadingState
            message="Verifying administrative authority..."
            subtext="Checking cryptographic session and officer RBAC role"
          />
        </div>
      </AppShell>
    );
  }

  if (!isAuthorized) {
    return (
      <AppShell>
        <div style={{ maxWidth: '1240px', margin: '0 auto', padding: 'var(--space-6)' }}>
          <ErrorState
            title="Administrative Access Restricted"
            message="Fleet Administration and Camera Onboarding is restricted to Super Admin and Department Admin personnel."
            errorCode="403_FORBIDDEN"
            onRetry={() => router.push('/cameras')}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
        {/* Header Section Banner */}
        <div
          className="netrava-card"
          style={{
            padding: '16px 20px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'var(--highlight-gradient)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'rgba(215, 25, 63, 0.12)',
                    color: '#F87171',
                    border: '1px solid rgba(215, 25, 63, 0.3)',
                    letterSpacing: '0.04em',
                  }}
                >
                  REAL PROTOCOL ADAPTERS
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    color: '#60A5FA',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    letterSpacing: '0.04em',
                  }}
                >
                  RTSP RFC 2326 &bull; ONVIF PROFILE S
                </span>
              </div>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', letterSpacing: '0.01em', margin: 0 }}>
                <Settings size={18} color="#F87171" />
                <span>Fleet Administration &amp; Camera Onboarding</span>
              </h1>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                Onboard state surveillance equipment via live protocol adapter negotiation and capability probing.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Link
                href="/cameras"
                className="btn-secondary"
                style={{
                  fontSize: 'var(--text-sm)',
                  padding: '6px 14px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CameraIcon size={14} />
                <span>Camera Registry</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Architecture Distinction Notice */}
        <div
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 'var(--radius-xs)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          <Info size={16} color="#60A5FA" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Authoritative Protocol Architecture Boundary
            </p>
            <p style={{ margin: 0, lineHeight: 1.4 }}>
              <strong style={{ color: '#F87171' }}>Real Protocol Implementation:</strong> The platform executes genuine
              TCP RFC 2326 RTSP <code style={{ fontSize: '11px', backgroundColor: 'var(--bg-primary)', padding: '1px 6px', borderRadius: 'var(--radius-xs)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', fontFamily: 'var(--font-mono)' }}>DESCRIBE</code> handshakes
              and ONVIF SOAP 1.2 XML with cryptographic WS-Security <code style={{ fontSize: '11px', backgroundColor: 'var(--bg-primary)', padding: '1px 6px', borderRadius: 'var(--radius-xs)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', fontFamily: 'var(--font-mono)' }}>PasswordDigest</code> calculation.
            </p>
          </div>
        </div>

        {/* Feedback Banners */}
        {submitSuccess && (
          <div
            style={{
              backgroundColor: 'var(--status-success-bg)',
              border: '1px solid var(--status-success-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
              color: 'var(--status-success)',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <CheckCircle2 size={16} color="var(--status-success)" />
              <span style={{ fontWeight: 600 }}>{submitSuccess}</span>
            </div>
            <Link
              href="/cameras"
              className="btn-secondary"
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                color: 'var(--status-success)',
                borderColor: 'var(--status-success-border)',
                textDecoration: 'none',
              }}
            >
              View in Registry <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {submitError && (
          <div
            style={{
              backgroundColor: 'var(--status-critical-bg)',
              border: '1px solid var(--status-critical-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
              color: 'var(--status-critical)',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <XCircle size={16} color="var(--status-critical)" />
            <span>{submitError}</span>
          </div>
        )}

        {duplicateError && (
          <div
            role="alert"
            data-testid="duplicate-endpoint-banner"
            style={{
              backgroundColor: 'var(--status-warning-bg)',
              border: '1px solid var(--status-warning-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <AlertTriangle size={18} color="var(--status-warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--status-warning)', fontFamily: 'var(--font-mono)' }}>
                  Stream endpoint already registered
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)', padding: '1px 4px', borderRadius: 'var(--radius-xs)' }}>{duplicateError.endpoint}</code> is already
                  associated with{' '}
                  {duplicateError.existingCameraName ? (
                    <strong style={{ color: 'var(--text-primary)' }}>{duplicateError.existingCameraName}</strong>
                  ) : (
                    'an existing camera'
                  )}.
                  {' '}Each camera must have a unique stream endpoint. To onboard equipment, specify an unused endpoint.
                </span>
              </div>
            </div>
            {duplicateError.existingCameraId && (
              <Link
                href={`/cameras?id=${duplicateError.existingCameraId}`}
                className="btn-secondary"
                style={{
                  padding: '5px 12px',
                  fontSize: '11px',
                  color: 'var(--status-warning)',
                  borderColor: 'var(--status-warning-border)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Open Existing Camera <ExternalLink size={12} />
              </Link>
            )}
          </div>
        )}

        {/* Main Onboarding Form */}
        <form onSubmit={handleRegisterCamera} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-5)' }}>
          {/* Column 1 & 2: Camera Details & Protocol Config */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', gridColumn: 'span 2' }}>
            {/* Metadata Card */}
            <div
              className="netrava-card"
              style={{
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                <CameraIcon size={16} color="var(--accent-primary)" />
                Equipment &amp; Department Identity
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    Camera Identification Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: '100%',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                      Assigned Police Department *
                    </label>
                    <select
                      id="department-selector"
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      style={{
                        width: '100%',
                      }}
                    >
                      {departments.length > 0 ? (
                        departments.map((dept) => {
                          const displayLabel = dept.name.includes('Ahmedabad')
                            ? 'Ahmedabad City Police (HQ)'
                            : dept.name;
                          return (
                            <option key={dept.id} value={dept.id}>
                              {displayLabel}
                            </option>
                          );
                        })
                      ) : (
                        <option value={user?.department_id || departmentId || 'a8e1fdbb-f264-4841-a45b-06df23724a20'}>
                          {user?.department_name || 'Ahmedabad City Police (HQ)'}
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                      Physical Location / Landmark *
                    </label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      style={{
                        width: '100%',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Zone</label>
                    <input
                      type="text"
                      required
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>District</label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      style={{
                        width: '100%',
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={long}
                      onChange={(e) => setLong(e.target.value)}
                      style={{
                        width: '100%',
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Protocol Adapter Configuration Card */}
            <div
              className="netrava-card"
              style={{
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                  <Radio size={16} color="var(--accent-blue)" />
                  Protocol Adapter Configuration
                </h2>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {supportedProtocols.length} Genuine Adapters Active
                </span>
              </div>

              {/* Protocol Toggle Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  onClick={() => handleProtocolChange('RTSP')}
                  className={`netrava-nav-link ${protocol === 'RTSP' ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    padding: 'var(--space-3) var(--space-4)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'inherit', fontFamily: 'var(--font-mono)' }}>RTSP Adapter</span>
                    <span className="nav-badge" style={{ fontSize: '10px' }}>RFC 2326</span>
                  </div>
                  <p style={{ fontSize: '11px', color: protocol === 'RTSP' ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
                    Direct TCP streaming probe, SDP track negotiation, H.264/H.265 detection.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleProtocolChange('ONVIF')}
                  className={`netrava-nav-link ${protocol === 'ONVIF' ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    padding: 'var(--space-3) var(--space-4)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'inherit', fontFamily: 'var(--font-mono)' }}>ONVIF Adapter</span>
                    <span className="nav-badge" style={{ fontSize: '10px' }}>Profile S</span>
                  </div>
                  <p style={{ fontSize: '11px', color: protocol === 'ONVIF' ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
                    SOAP 1.2 XML, WS-Security UsernameToken digest, GetDeviceInformation &amp; GetStreamUri.
                  </p>
                </button>
              </div>

              {/* Endpoint & Credentials */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    {protocol === 'RTSP' ? 'RTSP Stream URL *' : 'ONVIF Device Service URL *'}
                    <span style={{ fontWeight: 400, marginLeft: '6px', color: 'var(--text-dim)', fontSize: '10px' }}>
                      {protocol === 'RTSP' ? '(Video Stream Endpoint)' : '(Device Management Endpoint)'}
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    placeholder={
                      protocol === 'RTSP'
                        ? 'rtsp://localhost:8554/live/cam-ahm-01'
                        : 'http://localhost:8555/onvif/device_service'
                    }
                    style={{
                      width: '100%',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  {/* Demo Fixture Controls with explicit simulated data clarity */}
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px dashed var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                            color: '#93C5FD',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          PRESET ENDPOINTS
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {protocol === 'RTSP'
                            ? 'MediaMTX streaming gateway loop (port 8554)'
                            : 'Local ONVIF Profile S test responder (port 8555)'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {protocol === 'RTSP' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setStreamUrl('rtsp://localhost:8554/live/cam-ahm-02');
                                setName('CAM-AHM-08: SG Highway - Thaltej Crossroad East');
                                setLat('23.052140');
                                setLong('72.520110');
                                setAddress('SG Highway East Service Rd, Thaltej');
                                setUsername('admin');
                                setPassword('');
                                setProbeResult(null);
                                setProbeError(null);
                                setDuplicateError(null);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-blue)',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 700,
                                textDecoration: 'underline',
                                padding: 0,
                              }}
                              title="Active MediaMTX stream fixture that is currently unregistered in the fleet"
                            >
                              Fill Unused Demo Fixture (cam-ahm-02)
                            </button>
                            <span style={{ color: 'var(--border-default)', fontSize: '10px' }}>|</span>
                            <button
                              type="button"
                              onClick={() => {
                                setStreamUrl('rtsp://localhost:8554/live/cam-ahm-01');
                                setName('CAM-AHM-07: SG Highway - Thaltej Crossroad Junction');
                                setLat('23.051280');
                                setLong('72.518420');
                                setAddress('Thaltej Crossroad, SG Highway');
                                setUsername('admin');
                                setPassword('');
                                setProbeResult(null);
                                setProbeError(null);
                                setDuplicateError(null);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-dim)',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 500,
                                textDecoration: 'underline',
                                padding: 0,
                              }}
                              title="Registered demo stream to demonstrate duplicate endpoint protection"
                            >
                              Fill Registered Fixture (cam-ahm-01)
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setStreamUrl('http://localhost:8555/onvif/device_service');
                              setUsername('admin');
                              setPassword('GujaratPolice@2026');
                              setProbeResult(null);
                              setProbeError(null);
                              setDuplicateError(null);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-blue)',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 700,
                              textDecoration: 'underline',
                              padding: 0,
                            }}
                          >
                            Fill Default (ONVIF Fixture)
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                      Username (Optional)
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                      Password (Encrypted in transit)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{
                          width: '100%',
                          paddingRight: '32px',
                        }}
                      />
                      <Lock size={14} color="var(--text-dim)" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Live Protocol Probe & Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Live Connection Test Panel */}
            <div
              className="netrava-card"
              style={{
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Zap size={16} color="var(--status-warning)" />
                  Live Connection Probe
                </span>
                {probeResult && (
                  <StatusBadge
                    status={probeResult.status}
                    label={probeResult.status}
                  />
                )}
              </h2>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Execute an actual protocol exchange across the network socket before registering equipment.
              </p>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isProbing}
                className="btn-secondary"
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  color: 'var(--accent-blue)',
                  borderColor: 'var(--accent-blue-border)',
                  cursor: isProbing ? 'not-allowed' : 'pointer',
                  opacity: isProbing ? 0.75 : 1,
                }}
              >
                {isProbing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Probing {protocol} Socket...</span>
                  </>
                ) : (
                  <>
                    <Activity size={15} />
                    <span>Test Connection ({protocol})</span>
                  </>
                )}
              </button>

              {/* Probe Result Box */}
              {probeError && (
                <div
                  style={{
                    backgroundColor: 'var(--status-critical-bg)',
                    border: '1px solid var(--status-critical-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3)',
                    color: 'var(--status-critical)',
                    fontSize: '11px',
                  }}
                >
                  {probeError}
                </div>
              )}

              {probeResult && (
                <div
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Protocol Adapter:</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{probeResult.protocol}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Socket Status:</span>
                    <span style={{ fontWeight: 700, color: probeResult.reachable ? 'var(--status-success)' : 'var(--status-critical)', fontFamily: 'var(--font-mono)' }}>
                      {probeResult.reachable ? 'REACHABLE' : 'UNREACHABLE'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                    <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Round-trip Latency:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-warning)', fontWeight: 700 }}>{probeResult.latencyMs} ms</span>
                  </div>

                  {probeResult.streamMetadata?.codec && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Detected Codec:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{probeResult.streamMetadata.codec}</span>
                    </div>
                  )}

                  {probeResult.streamMetadata?.deviceInfo && (
                    <div style={{ paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ color: 'var(--text-dim)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Discovered Hardware:</span>
                      <div style={{ paddingLeft: '8px', fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        <div>MFR: {probeResult.streamMetadata.deviceInfo.manufacturer}</div>
                        <div>MODEL: {probeResult.streamMetadata.deviceInfo.model}</div>
                        <div>FW: {probeResult.streamMetadata.deviceInfo.firmwareVersion}</div>
                        {probeResult.streamMetadata.deviceInfo.serialNumber && (
                          <div>SN: {probeResult.streamMetadata.deviceInfo.serialNumber}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {probeResult.errorMessage && (
                    <div style={{ paddingTop: '4px', color: 'var(--status-warning)', fontSize: '10px', backgroundColor: 'var(--status-warning-bg)', padding: '6px', borderRadius: 'var(--radius-xs)' }}>
                      {probeResult.errorMessage}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Registration Submit Action */}
            <div
              className="netrava-card"
              style={{
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <button
                type="submit"
                onClick={handleRegisterCamera}
                disabled={isSubmitting}
                className="btn-primary"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  opacity: isSubmitting ? 0.75 : 1,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Onboarding Equipment...</span>
                  </>
                ) : (
                  <>
                    <Server size={16} />
                    <span>Register Camera in Fleet</span>
                  </>
                )}
              </button>

              <p style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                Requires SUPER_ADMIN or DEPARTMENT_ADMIN role.
                Audit log entry created synchronously.
              </p>
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
