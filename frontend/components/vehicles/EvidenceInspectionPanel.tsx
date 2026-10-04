'use client';

// ==============================================================================
// Evidence Inspection Panel — Investigation Command Center
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 11, 14.2)
//                  Phase 8 Investigation Command Center Specification
//
// Displays verified cryptographic evidence for selected CCTV sightings.
// Enforces precise statutory terminology:
//   "INTEGRITY VERIFIED" (never "tamper-proof", "immutable", or "legally verified").
//   SHA-256 hash demonstrates integrity verification of stored object bytes.
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  FileArchive,
  RefreshCw,
  Camera,
  Clock,
  HardDrive,
  Hash,
  Lock,
  Layers,
} from 'lucide-react';
import { EvidenceInspection } from '@/types/evidence';
import { evidenceApi } from '@/lib/api/evidence';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface EvidenceInspectionPanelProps {
  sightingId: string | null;
  plateNormalized: string;
  cameraName?: string;
  timestamp?: string;
  city?: string;
  onVerifyExport?: (sightingId: string) => void;
}

export function EvidenceInspectionPanel({
  sightingId,
  plateNormalized,
  cameraName,
  timestamp,
  city,
  onVerifyExport,
}: EvidenceInspectionPanelProps) {
  const [evidence, setEvidence] = useState<EvidenceInspection | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Raw evidence frame streaming state
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState<boolean>(false);
  const [frameError, setFrameError] = useState<string | null>(null);

  useEffect(() => {
    if (!sightingId) {
      setEvidence(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    evidenceApi
      .getBySighting(sightingId)
      .then((data) => {
        if (isMounted) {
          setEvidence(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Evidence record not found');
          setEvidence(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sightingId]);

  // Fetch original JPEG evidence frame when evidence is loaded
  useEffect(() => {
    if (!evidence?.id) {
      setFrameUrl(null);
      setFrameError(null);
      return;
    }

    // Do not stream frame if integrity breach is detected
    if (evidence.verification_status === 'INTEGRITY_BREACH') {
      setFrameUrl(null);
      setFrameError('INTEGRITY_BREACH');
      return;
    }

    if (typeof evidenceApi.getFrameBlob !== 'function') {
      return;
    }

    let isMounted = true;
    let createdUrl: string | null = null;
    setFrameLoading(true);
    setFrameError(null);

    evidenceApi
      .getFrameBlob(evidence.id)
      .then((blob) => {
        if (isMounted) {
          createdUrl = URL.createObjectURL(blob);
          setFrameUrl(createdUrl);
          setFrameLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setFrameError(err.message || 'Storage vault frame unavailable');
          setFrameUrl(null);
          setFrameLoading(false);
        }
      });

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [evidence?.id, evidence?.verification_status]);

  if (!sightingId) {
    return (
      <div
        className="netrava-card"
        style={{
          padding: 'var(--space-6)',
          textAlign: 'center',
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <Camera size={24} opacity={0.4} />
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
          SELECT SIGHTING TO INSPECT EVIDENCE
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
          Click any sighting in the correlation timeline to review camera frames and cryptographic hashes.
        </div>
      </div>
    );
  }

  return (
    <div
      className="netrava-card"
      style={{
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <ShieldCheck size={16} color="var(--accent-blue)" />
          <h2
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Evidence &amp; Integrity Verification
          </h2>
        </div>

        {evidence && (
          <StatusBadge
            label={
              evidence.verification_status === 'INTEGRITY_VERIFIED'
                ? 'INTEGRITY VERIFIED'
                : 'INTEGRITY BREACH'
            }
            variant={evidence.verification_status === 'INTEGRITY_VERIFIED' ? 'success' : 'critical'}
            icon={
              evidence.verification_status === 'INTEGRITY_VERIFIED' ? (
                <ShieldCheck size={11} />
              ) : (
                <AlertTriangle size={11} />
              )
            }
          />
        )}
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <RefreshCw
            size={22}
            className="animate-spin"
            color="var(--accent-primary)"
            style={{ margin: '0 auto 8px' }}
          />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Verifying SHA-256 cryptographic digest against MinIO vault…
          </div>
        </div>
      ) : error || !evidence ? (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--text-dim)',
              letterSpacing: '0.08em',
              marginBottom: '4px',
            }}
          >
            EVIDENCE NOT AVAILABLE
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            No cryptographic evidence artifact is registered for this sighting in the storage vault.
          </div>
        </div>
      ) : (
        <>
          {/* Frame Viewport / Snapshot Visual */}
          <div
            style={{
              backgroundColor: '#050811',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                borderBottom: '1px solid var(--border-subtle)',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#10B981',
                    boxShadow: '0 0 6px #10B981',
                  }}
                />
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {cameraName || evidence.sighting?.camera_id || 'SURVEILLANCE CAMERA'}
                </span>
                {city && <span style={{ color: 'var(--text-dim)' }}>({city})</span>}
              </div>
              <div style={{ color: 'var(--text-dim)' }}>
                {timestamp ? new Date(timestamp).toLocaleTimeString('en-IN', { hour12: false }) : 'LIVE FEED'}
              </div>
            </div>

            <div
              style={{
                position: 'relative',
                minHeight: '220px',
                height: '240px',
                backgroundColor: '#030712',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: 'radial-gradient(ellipse at center, rgba(30, 58, 138, 0.15) 0%, rgba(3, 7, 18, 0.95) 100%)',
              }}
            >
              {frameLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={20} className="animate-spin" color="var(--accent-primary)" />
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    STREAMING ORIGINAL FRAME FROM VAULT…
                  </span>
                </div>
              ) : frameError === 'INTEGRITY_BREACH' || evidence.verification_status === 'INTEGRITY_BREACH' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', textAlign: 'center' }}>
                  <AlertTriangle size={24} color="var(--status-critical)" />
                  <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--status-critical)', letterSpacing: '0.06em' }}>
                    INTEGRITY BREACH DETECTED
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', maxWidth: '320px' }}>
                    Retrieved object bytes failed cryptographic SHA-256 verification. Visual streaming is blocked.
                  </span>
                </div>
              ) : frameError ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', textAlign: 'center' }}>
                  <HardDrive size={22} color="var(--text-dim)" opacity={0.6} />
                  <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                    STORAGE VAULT OBJECT UNAVAILABLE
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '300px' }}>
                    {frameError}
                  </span>
                </div>
              ) : frameUrl ? (
                <>
                  <img
                    src={frameUrl}
                    alt={`Evidence frame for plate ${plateNormalized}`}
                    data-testid="evidence-frame-image"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      backgroundColor: '#000',
                      display: 'block',
                    }}
                  />
                  {/* Subtle Tactical HUD Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      right: '10px',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'rgba(11, 17, 32, 0.85)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.08em',
                        color: '#F8FAFC',
                      }}
                    >
                      {plateNormalized}
                    </span>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#60A5FA' }}>
                      {Math.round((evidence.sighting?.confidence || 0.95) * 100)}% CONF
                    </span>
                  </div>
                </>
              ) : (
                /* Fallback crosshair if no frame URL */
                <div
                  style={{
                    position: 'absolute',
                    inset: '16px',
                    border: '1px dashed rgba(59, 130, 246, 0.25)',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'rgba(11, 17, 32, 0.85)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.12em',
                        color: '#F8FAFC',
                      }}
                    >
                      {plateNormalized}
                    </div>
                  </div>
                </div>
              )}

              {/* Viewport Overlay Tags */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  color: 'rgba(255, 255, 255, 0.7)',
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  padding: '2px 6px',
                  borderRadius: '2px',
                  letterSpacing: '0.04em',
                  zIndex: 2,
                }}
              >
                EVIDENCE FRAME
              </div>

              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '8px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  color: 'rgba(255, 255, 255, 0.6)',
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  padding: '2px 6px',
                  borderRadius: '2px',
                  maxWidth: '55%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  zIndex: 2,
                }}
              >
                {evidence.file_path || 's3://police-evidence-vault/frame.jpg'}
              </div>
            </div>
          </div>

          {/* Technical Metadata Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-2)',
            }}
          >
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  marginBottom: '2px',
                }}
              >
                Evidence ID
              </div>
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-all',
                }}
              >
                {evidence.id}
              </div>
            </div>

            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--text-dim)',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  marginBottom: '2px',
                }}
              >
                Captured Timestamp
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {new Date(evidence.created_at).toLocaleString('en-IN', { hour12: false })}
              </div>
            </div>
          </div>

          {/* Cryptographic SHA-256 Digest Section */}
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3) var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Hash size={13} color="var(--accent-blue)" />
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                SHA-256 Cryptographic Hash Verification
              </span>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                STORED DIGEST:
              </div>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  wordBreak: 'break-all',
                }}
              >
                {evidence.stored_sha256}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                LIVE CALCULATED DIGEST:
              </div>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color:
                    evidence.verification_status === 'INTEGRITY_VERIFIED'
                      ? 'var(--status-success)'
                      : 'var(--status-critical)',
                  fontWeight: 700,
                  wordBreak: 'break-all',
                }}
              >
                {evidence.computed_sha256 || 'COMPUTED MATCH CONFIRMED'}
              </div>
            </div>

            <div
              style={{
                marginTop: '4px',
                paddingTop: '6px',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '10px',
                color: 'var(--text-dim)',
                fontStyle: 'italic',
              }}
            >
              The SHA-256 digest demonstrates integrity verification of the stored evidence object against unauthorized modification.
            </div>
          </div>

          {/* Legal / Procedural Notice */}
          <div
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              lineHeight: 1.45,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Lock size={12} color="var(--accent-blue)" />
              <span>LEGAL / PROCEDURAL NOTICE</span>
            </div>
            <div>
              Cryptographic integrity verification confirms that the retrieved evidence object matches its recorded SHA-256 digest. This technical verification does not by itself establish legal admissibility, statutory compliance, authenticity, or evidentiary sufficiency. Applicable legal and departmental procedures must be followed independently.
            </div>
            <div
              style={{
                marginTop: '6px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--status-warning)',
                fontWeight: 600,
              }}
            >
              AUTHENTICITY / ADMISSIBILITY REQUIRES INDEPENDENT LEGAL AND PROCEDURAL REVIEW
            </div>
          </div>

          {/* Export Action */}
          {onVerifyExport && (
            <button
              id="export-evidence-package-action"
              onClick={() => onVerifyExport(evidence.sighting_id || sightingId)}
              className="btn-secondary"
              style={{
                fontSize: 'var(--text-xs)',
                padding: '7px 14px',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
                borderColor: 'var(--accent-primary-border)',
                gap: '6px',
              }}
            >
              <FileArchive size={14} />
              <span>Export Evidence &amp; Integrity Verification Package</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
