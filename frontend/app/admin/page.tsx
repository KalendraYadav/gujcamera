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
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
import { camerasApi } from '@/lib/api/cameras';
import {
  CameraProtocol,
  ConnectionProbeResult,
  ConnectorRecord,
} from '@/types/camera';
import Link from 'next/link';

export default function FleetAdminPage() {
  // Protocol connectors state
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [supportedProtocols, setSupportedProtocols] = useState<CameraProtocol[]>(['RTSP', 'ONVIF']);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(true);

  // Onboarding form state
  const [name, setName] = useState('CAM-AHM-07: SG Highway - Thaltej Crossroad Junction');
  const [departmentId, setDepartmentId] = useState('d1111111-0000-0000-0000-000000000001');
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

  useEffect(() => {
    async function loadConnectors() {
      try {
        setIsLoadingConnectors(true);
        const res = await camerasApi.getConnectors();
        setConnectors(res.connectors);
        setSupportedProtocols(res.supported_protocols);
        if (res.connectors.length > 0) {
          // Default connector matching RTSP
          const rtspConn = res.connectors.find((c) => c.adapter_type.includes('RTSP')) || res.connectors[0];
          setConnectorId(rtspConn.id);
        }
      } catch (err: any) {
        console.warn('Could not load connectors dynamically:', err);
      } finally {
        setIsLoadingConnectors(false);
      }
    }
    loadConnectors();
  }, []);

  // Update default URL when protocol toggles
  const handleProtocolChange = (newProtocol: CameraProtocol) => {
    setProtocol(newProtocol);
    setProbeResult(null);
    setProbeError(null);

    if (newProtocol === 'RTSP') {
      setStreamUrl('rtsp://localhost:8554/live/cam-ahm-01');
      const rtspConn = connectors.find((c) => c.adapter_type.includes('RTSP'));
      if (rtspConn) setConnectorId(rtspConn.id);
    } else if (newProtocol === 'ONVIF') {
      setStreamUrl('http://localhost:8555/onvif/device_service');
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
  const handleRegisterCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

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
      setSubmitError(err.message || 'Failed to onboard camera. Verify authorization and unique stream URL.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Phase 4F
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
                Real Protocol Adapters
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Settings className="w-6 h-6 text-cyan-400" />
              Fleet Administration & Camera Onboarding
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Onboard CCTV equipment via real-time protocol adapter negotiation (RTSP RFC 2326 &amp; ONVIF Profile S).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <SimulatedDataBadge />
            <Link
              href="/cameras"
              className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm font-medium border border-white/10 flex items-center gap-1.5 transition-colors"
            >
              <CameraIcon className="w-4 h-4 text-slate-400" />
              Camera Registry
            </Link>
          </div>
        </div>

        {/* Architecture Distinction Notice */}
        <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-xl p-4 text-xs text-slate-300 flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-white">
              Authoritative Protocol Architecture Boundary (Phase 4F Verification)
            </p>
            <p>
              <strong className="text-cyan-400">Real Protocol Implementation:</strong> The platform executes genuine
              TCP RFC 2326 RTSP <code className="text-xs bg-black/40 px-1 py-0.5 rounded text-amber-300">DESCRIBE</code> handshakes
              and ONVIF SOAP 1.2 XML with cryptographic WS-Security <code className="text-xs bg-black/40 px-1 py-0.5 rounded text-amber-300">PasswordDigest</code> calculation.
            </p>
            <p>
              <strong className="text-emerald-400">Local Test Fixtures:</strong> Live video frames are remuxed by MediaMTX;
              ONVIF devices are verified via standards-compliant protocol test responders.
            </p>
          </div>
        </div>

        {/* Feedback Banners */}
        {submitSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-emerald-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{submitSuccess}</span>
            </div>
            <Link
              href="/cameras"
              className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded text-xs font-semibold flex items-center gap-1"
            >
              View in Registry <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {submitError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Main Onboarding Form */}
        <form onSubmit={handleRegisterCamera} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 & 2: Camera Details & Protocol Config */}
          <div className="lg:col-span-2 space-y-6">
            {/* Metadata Card */}
            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <CameraIcon className="w-4 h-4 text-cyan-400" />
                Equipment & Department Identity
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Camera Identification Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Assigned Police Department *
                    </label>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="d1111111-0000-0000-0000-000000000001">
                        Ahmedabad City Police (HQ)
                      </option>
                      <option value="d2222222-0000-0000-0000-000000000002">
                        Gandhinagar District Police
                      </option>
                      <option value="d3333333-0000-0000-0000-000000000003">
                        Surat City Police
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Physical Location / Landmark *
                    </label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Zone</label>
                    <input
                      type="text"
                      required
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">District</label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={long}
                      onChange={(e) => setLong(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Protocol Adapter Configuration Card */}
            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-purple-400" />
                  Protocol Adapter Configuration
                </h2>
                <span className="text-xs text-slate-400">
                  {supportedProtocols.length} Genuine Adapters Active
                </span>
              </div>

              {/* Protocol Toggle Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleProtocolChange('RTSP')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    protocol === 'RTSP'
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-white shadow-lg shadow-cyan-500/10'
                      : 'bg-black/30 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">RTSP Adapter</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">RFC 2326</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Direct TCP streaming probe, SDP track negotiation, H.264/H.265 detection.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleProtocolChange('ONVIF')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    protocol === 'ONVIF'
                      ? 'bg-purple-500/10 border-purple-500/50 text-white shadow-lg shadow-purple-500/10'
                      : 'bg-black/30 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">ONVIF Adapter</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">Profile S</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    SOAP 1.2 XML, WS-Security UsernameToken digest, GetDeviceInformation &amp; GetStreamUri.
                  </p>
                </button>
              </div>

              {/* Endpoint & Credentials */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {protocol === 'RTSP' ? 'RTSP Stream URL *' : 'ONVIF Device Service URL *'}
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
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                    <span>
                      {protocol === 'RTSP'
                        ? 'Sample live stream: rtsp://localhost:8554/live/cam-ahm-01'
                        : 'Sample ONVIF test fixture: http://localhost:8555/onvif/device_service'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setStreamUrl(
                          protocol === 'RTSP'
                            ? 'rtsp://localhost:8554/live/cam-ahm-01'
                            : 'http://localhost:8555/onvif/device_service'
                        )
                      }
                      className="text-cyan-400 hover:underline"
                    >
                      Fill Default
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Username (Optional)
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Password (Encrypted in transit)
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 pr-8"
                      />
                      <Lock className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Live Protocol Probe & Summary */}
          <div className="space-y-6">
            {/* Live Connection Test Panel */}
            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Live Connection Test
                </span>
                {probeResult && (
                  <StatusBadge
                    status={probeResult.status}
                    label={probeResult.status}
                  />
                )}
              </h2>

              <p className="text-xs text-slate-400">
                Execute an actual protocol exchange across the network socket before registering equipment.
              </p>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isProbing}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                {isProbing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    Probing {protocol} Socket...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4 text-cyan-200" />
                    Test Connection ({protocol})
                  </>
                )}
              </button>

              {/* Probe Result Box */}
              {probeError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-xs">
                  {probeError}
                </div>
              )}

              {probeResult && (
                <div className="bg-black/40 border border-white/10 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Protocol Adapter:</span>
                    <span className="font-semibold text-cyan-300">{probeResult.protocol}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Socket Reachability:</span>
                    <span className={probeResult.reachable ? 'text-emerald-400' : 'text-red-400'}>
                      {probeResult.reachable ? 'REACHABLE' : 'UNREACHABLE'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Round-trip Latency:</span>
                    <span className="font-mono text-amber-300">{probeResult.latencyMs} ms</span>
                  </div>

                  {probeResult.streamMetadata?.codec && (
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-400">Detected Codec:</span>
                      <span className="font-mono text-white">{probeResult.streamMetadata.codec}</span>
                    </div>
                  )}

                  {probeResult.streamMetadata?.deviceInfo && (
                    <div className="pt-1 space-y-1">
                      <span className="text-slate-400 font-medium">Discovered Hardware:</span>
                      <div className="pl-2 space-y-0.5 text-[11px] text-slate-300">
                        <div>Mfr: {probeResult.streamMetadata.deviceInfo.manufacturer}</div>
                        <div>Model: {probeResult.streamMetadata.deviceInfo.model}</div>
                        <div>FW: {probeResult.streamMetadata.deviceInfo.firmwareVersion}</div>
                        {probeResult.streamMetadata.deviceInfo.serialNumber && (
                          <div>SN: {probeResult.streamMetadata.deviceInfo.serialNumber}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {probeResult.errorMessage && (
                    <div className="pt-2 text-amber-400 text-[11px] bg-amber-500/10 p-2 rounded">
                      {probeResult.errorMessage}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Registration Submit Action */}
            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-5 space-y-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    Onboarding Equipment...
                  </>
                ) : (
                  <>
                    <Server className="w-4 h-4 text-white" />
                    Register Camera in Fleet
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-400 text-center">
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
