'use client';

// ==============================================================================
// Evidence Export & Cryptographic Verification Modal
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 11 & Phase 5A Specification)
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
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';

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
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 'var(--space-4)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '640px',
          width: '100%',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
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
            backgroundColor: 'var(--bg-surface-elevated)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <FileArchive size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
              Evidence Integrity Package & Technical Certificate
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
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
            <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
              <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                Executing cryptographic SHA-256 verification against MinIO object storage...
              </div>
            </div>
          ) : error && !evidence ? (
            <div
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'var(--status-critical-bg)',
                border: '1px solid var(--status-critical-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--status-critical)',
                fontSize: 'var(--text-sm)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={16} /> Evidence Verification Failed
              </div>
              <div>{error}</div>
            </div>
          ) : evidence ? (
            <>
              {/* Integrity status banner */}
              {evidence.verification_status === 'INTEGRITY_VERIFIED' ? (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3) var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                  }}
                >
                  <ShieldCheck size={24} color="#10b981" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#10b981' }}>
                      SHA-256 INTEGRITY VERIFIED (NO TAMPERING DETECTED)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      MinIO stored object bytes match canonical database digest bit-for-bit.
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: 'var(--status-critical-bg)',
                    border: '1px solid var(--status-critical-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3) var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                  }}
                >
                  <AlertTriangle size={24} color="var(--status-critical)" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--status-critical)' }}>
                      INTEGRITY BREACH DETECTED: HASH MISMATCH
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Stored object hash does NOT match canonical database digest. Export blocked.
                    </div>
                  </div>
                </div>
              )}

              {/* Technical properties */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-3)',
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Evidence ID</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{evidence.id}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Vehicle Plate</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)' }}>
                    {plateNormalized}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Storage Object Path</div>
                  <div style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{evidence.file_path}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Payload Format / Size</div>
                  <div>
                    {evidence.mime_type} • {(evidence.file_size_bytes / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>

              {/* Hash Verification Block */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Cryptographic Hash Verification
                </div>
                <div
                  style={{
                    backgroundColor: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Registered SHA-256:</span>
                    <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{evidence.stored_sha256}</span>
                  </div>
                  {evidence.computed_sha256 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Live Object SHA-256:</span>
                      <span
                        style={{
                          color: evidence.integrity_match ? '#10b981' : 'var(--status-critical)',
                          wordBreak: 'break-all',
                        }}
                      >
                        {evidence.computed_sha256}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Statutory disclaimer */}
              <div
                style={{
                  borderLeft: '3px solid var(--accent-primary)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  padding: 'var(--space-3)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  gap: 'var(--space-2)',
                }}
              >
                <Info size={14} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>STATUTORY NOTICE:</strong> This Technical Verification Certificate confirms cryptographic bit-level integrity against the capture digest. Under the Indian Evidence Act Section 65B, electronic records require corroborating chain-of-custody affirmation by the seizing investigator.
                </div>
              </div>

              {downloadSuccess && (
                <div
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-2) var(--space-3)',
                    color: '#10b981',
                    fontSize: 'var(--text-xs)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <FileCheck2 size={14} /> Evidence package downloaded successfully with audit log generated.
                </div>
              )}

              {error && (
                <div
                  style={{
                    backgroundColor: 'var(--status-critical-bg)',
                    border: '1px solid var(--status-critical-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-2) var(--space-3)',
                    color: 'var(--status-critical)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  {error}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-5)',
            backgroundColor: 'var(--bg-surface-elevated)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <SimulatedDataBadge compact />

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              onClick={onClose}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>

            {evidence && (
              <button
                id="download-evidence-pkg-btn"
                onClick={handleDownload}
                disabled={downloading || evidence.verification_status !== 'INTEGRITY_VERIFIED'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor:
                    evidence.verification_status === 'INTEGRITY_VERIFIED'
                      ? 'var(--accent-primary)'
                      : 'var(--bg-surface)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 'var(--radius-sm)',
                  color: evidence.verification_status === 'INTEGRITY_VERIFIED' ? '#ffffff' : 'var(--text-muted)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  cursor:
                    downloading || evidence.verification_status !== 'INTEGRITY_VERIFIED'
                      ? 'not-allowed'
                      : 'pointer',
                  opacity: evidence.verification_status === 'INTEGRITY_VERIFIED' ? 1 : 0.6,
                }}
              >
                {downloading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" /> Packaging ZIP...
                  </>
                ) : (
                  <>
                    <Download size={13} /> Export Evidence Package (.ZIP)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
