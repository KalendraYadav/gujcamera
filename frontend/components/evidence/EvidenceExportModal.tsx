'use client';

// ==============================================================================
// Evidence Export & Cryptographic Verification Modal
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 11 & Phase 5A Specification)
// Visual Language: NETRAVA Tactical Intelligence System
// ==============================================================================

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  AlertTriangle,
  FileCheck2,
  Lock,
  FileArchive,
  X,
  RefreshCw,
  Info,
} from 'lucide-react';
import { EvidenceInspection } from '@/types/evidence';
import { evidenceApi } from '@/lib/api/evidence';

interface EvidenceExportModalProps {
  sightingId: string;
  plateNormalized: string;
  isOpen: boolean;
  onClose: () => void;
}

export function EvidenceExportModal({
  sightingId,
  plateNormalized,
  isOpen,
  onClose,
}: EvidenceExportModalProps) {
  const [evidence, setEvidence] = useState<EvidenceInspection | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !sightingId) return;

    let mounted = true;
    setLoading(true);
    setError(null);
    setDownloadSuccess(false);

    evidenceApi
      .getBySighting(sightingId)
      .then((data) => {
        if (mounted) {
          setEvidence(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || 'Unable to retrieve evidence record for sighting.');
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, sightingId]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    if (!evidence) return;
    setDownloading(true);
    setError(null);
    setDownloadSuccess(false);

    try {
      await evidenceApi.downloadExport(
        evidence.id,
        `EVIDENCE_${plateNormalized}_${evidence.id.substring(0, 8)}.zip`
      );
      setDownloadSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Evidence package export failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 'var(--space-4)',
      }}
    >
      <div
        className="netrava-card"
        style={{
          maxWidth: '640px',
          width: '100%',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-elevated)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <FileArchive size={18} color="var(--accent-blue)" />
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
              Evidence Integrity Package &amp; Technical Certificate
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: 'var(--space-5)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
              <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                Verifying cryptographic SHA-256 digest...
              </div>
            </div>
          ) : error && !evidence ? (
            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--status-critical-bg)',
                border: '1px solid var(--status-critical-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--status-critical)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={16} /> Evidence Verification Failed
              </div>
              <div>{error}</div>
            </div>
          ) : evidence ? (
            <>
              {/* Integrity Status Banner */}
              {evidence.verification_status === 'INTEGRITY_VERIFIED' ? (
                <div
                  style={{
                    backgroundColor: 'var(--status-success-bg)',
                    border: '1px solid var(--status-success-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3) var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                  }}
                >
                  <ShieldCheck size={22} color="var(--status-success)" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--status-success)', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                      SHA-256 INTEGRITY VERIFIED (NO TAMPERING DETECTED)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      MinIO stored object bytes match canonical database digest bit-for-bit.
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: 'var(--status-critical-bg)',
                    border: '1px solid var(--status-critical-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3) var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                  }}
                >
                  <AlertTriangle size={22} color="var(--status-critical)" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--status-critical)', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                      INTEGRITY BREACH DETECTED: HASH MISMATCH
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Stored object hash does NOT match canonical database digest. Export blocked.
                    </div>
                  </div>
                </div>
              )}

              {/* Technical Properties Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-3)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3) var(--space-4)',
                  fontSize: '11px',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Evidence ID</div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {evidence.id}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Target Plate</div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: 700 }}>
                    {plateNormalized}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>MIME Type &amp; Size</div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {evidence.mime_type} &bull; {(evidence.file_size_bytes / 1024).toFixed(1)} KB
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Evidence Retention Policy</div>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {evidence.retention_days} Days (State Vault)
                  </div>
                </div>
              </div>

              {/* Cryptographic Hashes Readout */}
              <div
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3) var(--space-4)',
                  fontSize: '11px',
                }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Stored SHA-256 Digest:</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                    {evidence.stored_sha256}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase' }}>Live Calculated SHA-256 Digest:</div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: evidence.integrity_match ? 'var(--status-success)' : 'var(--status-critical)',
                      wordBreak: 'break-all',
                      fontWeight: 700,
                    }}
                  >
                    {evidence.computed_sha256}
                  </div>
                </div>
              </div>

              {/* Legal / Procedural Notice */}
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <Lock size={12} color="var(--accent-blue)" />
                  <strong style={{ color: 'var(--text-primary)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                    LEGAL / PROCEDURAL NOTICE
                  </strong>
                </div>
                <div>
                  Cryptographic integrity verification confirms that the retrieved evidence object matches its recorded SHA-256 digest. This technical verification does not by itself establish legal admissibility, statutory compliance, authenticity, or evidentiary sufficiency. Applicable legal and departmental procedures must be followed independently.
                </div>
                <div
                  style={{
                    marginTop: '4px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--status-warning)',
                    fontWeight: 600,
                  }}
                >
                  AUTHENTICITY / ADMISSIBILITY REQUIRES INDEPENDENT LEGAL AND PROCEDURAL REVIEW
                </div>
              </div>

            </>
          ) : null}

          {downloadSuccess && (
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--status-success-bg)',
                border: '1px solid var(--status-success-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--status-success)',
                fontSize: '11px',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              Evidence package downloaded successfully with technical integrity verification certificate.
            </div>
          )}

          {error && evidence && (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--status-critical-bg)',
                border: '1px solid var(--status-critical-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--status-critical)',
                fontSize: '11px',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-3)',
          }}
        >
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{
              padding: '6px 14px',
              fontSize: '11px',
            }}
          >
            Close
          </button>

          <button
            onClick={handleDownload}
            disabled={!evidence || evidence.tamper_detected || downloading}
            className="btn-primary"
            style={{
              padding: '6px 16px',
              fontSize: '11px',
              opacity: !evidence || evidence.tamper_detected || downloading ? 0.45 : 1,
              cursor: !evidence || evidence.tamper_detected || downloading ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={13} />
            <span>{downloading ? 'Compiling Package...' : 'Export Evidence Package'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
