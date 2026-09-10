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
      style={{
        width: '100%',
        height: '100%',
        minHeight: '420px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
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
        <ShieldAlert size={280} color="var(--text-muted)" />
      </div>

      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px',
        }}
      >
        <AlertCircle size={28} color="var(--color-alert)" />
      </div>

      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-alert)',
          marginBottom: '8px',
        }}
      >
        Live Playback Unavailable
      </div>

      <h3
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '12px',
        }}
      >
        {camera.name} — No Browser-Playable Feed
      </h3>

      <div
        style={{
          maxWidth: '540px',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          lineHeight: '1.6',
          marginBottom: '24px',
        }}
      >
        {reason || (
          <>
            This camera feed uses protocol <strong>{protocol}</strong> which is not
            compatible with browser HLS streaming. The MediaMTX gateway requires a
            valid RTSP or HLS source.
          </>
        )}
      </div>

      {/* Technical Spec Box */}
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '24px',
          textAlign: 'left',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
          STREAM DESCRIPTOR:
        </div>
        <div
          style={{
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
            padding: '4px 8px',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '4px',
            marginBottom: '8px',
          }}
        >
          {streamHandle}
        </div>
        <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)' }}>
          <div>Protocol: <span style={{ color: 'var(--text-primary)' }}>{protocol}</span></div>
          <div>Registry Status: <span style={{ color: 'var(--text-primary)' }}>{camera.operational_status}</span></div>
          <div>Department: <span style={{ color: 'var(--text-primary)' }}>{camera.department_name || camera.department_id}</span></div>
        </div>
      </div>

      {/* Platform Governance Notice */}
      <div
        style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          marginBottom: '24px',
          fontStyle: 'italic',
        }}
      >
        Strict Governance Rule: Synthetic placeholder footage is never substituted for unplayable live feeds.
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {onSelectAlternative && (
          <button
            type="button"
            onClick={onSelectAlternative}
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--accent-blue)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            Select Live RTSP Camera
          </button>
        )}
        <Link
          href="/cameras"
          style={{
            padding: '10px 18px',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ArrowLeft size={16} />
          View in Camera Registry
        </Link>
      </div>
    </div>
  );
};
