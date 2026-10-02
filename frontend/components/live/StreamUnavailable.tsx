// ==============================================================================
// Stream Unavailable Component (Honest Non-Playable State)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 5.2, Section 14.2)
// ==============================================================================

import React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ShieldAlert } from 'lucide-react';
import { Camera } from '@/types/camera';

interface StreamUnavailableProps {
  camera: Camera;
  reason?: string;
  onSelectAlternative?: () => void;
}

export const StreamUnavailable: React.FC<StreamUnavailableProps> = ({
  camera,
  reason,
  onSelectAlternative,
}) => {
  const streamHandle = camera.streams?.[0]?.url_or_handle || 'No handle configured';
  const protocol = camera.protocol || 'UNKNOWN';

  return (
    <div
      data-testid="stream-unavailable-panel"
      className="netrava-card"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '420px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 24px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Subtle Watermark */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0.03,
          pointerEvents: 'none',
        }}
      >
        <ShieldAlert size={280} color="var(--accent-primary)" />
      </div>

      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'rgba(215, 25, 63, 0.12)',
          border: '1px solid rgba(215, 25, 63, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '18px',
        }}
      >
        <AlertCircle size={28} color="var(--accent-primary)" />
      </div>

      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--accent-primary)',
          marginBottom: '8px',
        }}
      >
        Live Playback Unavailable
      </div>

      <h3
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '10px',
        }}
      >
        {camera.name} — No Browser-Playable Feed
      </h3>

      <div
        style={{
          maxWidth: '520px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          lineHeight: '1.6',
          marginBottom: '22px',
        }}
      >
        {reason || (
          <>
            Protocol <strong>{protocol}</strong> is not browser-playable via HLS. The gateway requires a valid RTSP or HLS stream source.
          </>
        )}
      </div>

      {/* Technical Spec Box */}
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'rgba(11, 17, 32, 0.75)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '20px',
          textAlign: 'left',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px', letterSpacing: '0.05em' }}>
          ENDPOINT:
        </div>
        <div
          style={{
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
            padding: '6px 10px',
            backgroundColor: 'rgba(5, 8, 15, 0.6)',
            borderRadius: '4px',
            marginBottom: '8px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {streamHandle}
        </div>
        <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)' }}>
          <div>Protocol: <span style={{ color: 'var(--text-primary)' }}>{protocol}</span></div>
          <div>Status: <span style={{ color: 'var(--text-primary)' }}>{camera.operational_status}</span></div>
          <div>Department: <span style={{ color: 'var(--text-primary)' }}>{camera.department_name || camera.department_id}</span></div>
        </div>
      </div>

      {/* Platform Governance Notice */}
      <div
        style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginBottom: '22px',
          fontStyle: 'italic',
        }}
      >
        Governance: Synthetic footage is never substituted for live feeds.
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {onSelectAlternative && (
          <button
            type="button"
            className="btn-primary"
            onClick={onSelectAlternative}
            style={{
              padding: '9px 18px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            Select RTSP Camera
          </button>
        )}
        <Link
          href="/cameras"
          className="btn-secondary"
          style={{
            padding: '9px 18px',
            fontSize: '12px',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ArrowLeft size={14} />
          Camera Registry
        </Link>
      </div>
    </div>
  );
};
