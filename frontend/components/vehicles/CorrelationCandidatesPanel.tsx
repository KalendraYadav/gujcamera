'use client';

/**
 * CorrelationCandidatesPanel (Phase 10)
 * Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
 *
 * Displays hybrid fuzzy-plate & spatio-temporal correlation candidates for a queried plate.
 *
 * TERMINOLOGICAL DISCIPLINE:
 *   - "Vehicle Observation" / "Observation Candidate" — never "match" or "same vehicle"
 *   - "OCR Similarity" — never "plate match"
 *   - "Correlation Score" — never "identity probability"
 *   - "Spatio-Temporal Consistency" — never "route confirmed"
 *
 * A prominent disclaimer is rendered above all results.
 */

import React, { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CorrelationReason {
  signal: string;
  detail: string;
  score: number;
}

interface CorrelationCandidate {
  sightingId: string;
  plateNormalized: string;
  cameraId: string;
  cameraName: string | null;
  cameraCity: string | null;
  ts: string;
  vehicleClass: string | null;
  confidence: number;
  correlationScore: number;
  plateSimilarity: number;
  matchType: 'EXACT' | 'OCR_CONFUSED' | 'EDIT_DISTANCE_1';
  spatioTemporalConsistency: number;
  impliedSpeedKmh: number | null;
  timeDiffSeconds: number;
  distanceMeters: number | null;
  reasons: CorrelationReason[];
}

interface CorrelationResult {
  queryPlate: string;
  queryPlateClass: string | null;
  totalCandidates: number;
  searchWindowDays: number;
  candidates: CorrelationCandidate[];
  disclaimer: string;
}

interface Props {
  plate: string;
  token: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 0.80) return '#22c55e';
  if (score >= 0.60) return '#eab308';
  if (score >= 0.40) return '#f97316';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 0.80) return 'STRONG';
  if (score >= 0.60) return 'MODERATE';
  if (score >= 0.40) return 'WEAK';
  return 'VERY WEAK';
}

function matchTypeBadge(matchType: CorrelationCandidate['matchType']): React.ReactNode {
  const styles: Record<string, React.CSSProperties> = {
    EXACT: { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
    OCR_CONFUSED: { background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' },
    EDIT_DISTANCE_1: { background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' },
  };
  const labels: Record<string, string> = {
    EXACT: 'Exact Plate',
    OCR_CONFUSED: 'OCR Confusion',
    EDIT_DISTANCE_1: 'Edit Distance 1',
  };
  return (
    <span style={{
      ...styles[matchType],
      fontSize: '0.65rem',
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: '4px',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {labels[matchType]}
    </span>
  );
}

function formatTimeDiff(secs: number): string {
  const abs = Math.abs(secs);
  const sign = secs < 0 ? '−' : '+';
  if (abs < 60) return `${sign}${abs}s`;
  if (abs < 3600) return `${sign}${Math.round(abs / 60)}m`;
  if (abs < 86400) return `${sign}${(abs / 3600).toFixed(1)}h`;
  return `${sign}${(abs / 86400).toFixed(1)}d`;
}

function formatDistance(m: number | null): string {
  if (m === null) return 'N/A';
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1,
        height: '6px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.round(score * 100)}%`,
          height: '100%',
          background: color,
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '0.7rem', color, fontWeight: 700, minWidth: '36px', textAlign: 'right' }}>
        {Math.round(score * 100)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CorrelationCandidatesPanel({ plate, token }: Props) {
  const [result, setResult] = useState<CorrelationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [windowDays, setWindowDays] = useState(7);
  const [limit, setLimit] = useState(50);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/vehicles/${encodeURIComponent(plate)}/correlation-candidates?window_days=${windowDays}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      const data: CorrelationResult = await res.json();
      setResult(data);
      setExpanded(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch correlation candidates');
    } finally {
      setLoading(false);
    }
  }, [plate, token, windowDays, limit]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid rgba(99, 102, 241, 0.25)',
      borderRadius: '16px',
      padding: '24px',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem' }}>🔍</span>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
              Observation Correlation Candidates
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
            Phase 10 — Fuzzy Plate & Spatio-Temporal Analysis for <strong style={{ color: '#818cf8' }}>{plate}</strong>
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Window:
            <select
              value={windowDays}
              onChange={e => setWindowDays(Number(e.target.value))}
              style={{
                background: 'rgba(30,41,59,0.8)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '6px',
                color: '#e2e8f0',
                padding: '4px 8px',
                fontSize: '0.75rem',
              }}
            >
              {[1, 3, 7, 14, 30].map(d => (
                <option key={d} value={d}>{d}d</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Limit:
            <select
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
              style={{
                background: 'rgba(30,41,59,0.8)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '6px',
                color: '#e2e8f0',
                padding: '4px 8px',
                fontSize: '0.75rem',
              }}
            >
              {[10, 25, 50, 100].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <button
            onClick={fetchCandidates}
            disabled={loading}
            style={{
              background: loading ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.85)',
              border: '1px solid rgba(99,102,241,0.5)',
              borderRadius: '8px',
              color: '#fff',
              padding: '6px 16px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              letterSpacing: '0.02em',
            }}
          >
            {loading ? '⏳ Searching…' : '🔎 Find Candidates'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: '#fca5a5',
          fontSize: '0.85rem',
          marginBottom: '16px',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Disclaimer — always prominent */}
          <div style={{
            background: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚖️</span>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#eab308', letterSpacing: '0.04em', marginBottom: '3px' }}>
                INVESTIGATOR REVIEW REQUIRED
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#fde68a', lineHeight: 1.5 }}>
                {result.disclaimer}
              </p>
            </div>
          </div>

          {/* Summary bar */}
          <div style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '20px',
            flexWrap: 'wrap',
          }}>
            {[
              { label: 'Candidates Found', value: result.totalCandidates },
              { label: 'Search Window', value: `${result.searchWindowDays}d` },
              { label: 'Query Class', value: result.queryPlateClass || 'Unknown' },
            ].map(({ label, value }) => (
              <div key={label} style={{
                flex: '1 1 120px',
                background: 'rgba(30,41,59,0.6)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: '10px',
                padding: '12px 16px',
              }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  {label}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* No candidates */}
          {result.candidates.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#64748b',
              fontSize: '0.9rem',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔭</div>
              <p>No fuzzy-plate or spatio-temporal candidates found within the search window.</p>
              <p style={{ fontSize: '0.78rem', marginTop: '8px' }}>
                Try increasing the window or reviewing exact sightings in the sightings timeline.
              </p>
            </div>
          )}

          {/* Candidate cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {result.candidates.map((c, idx) => {
              const color = scoreColor(c.correlationScore);
              const isExpanded = expanded.has(c.sightingId);

              return (
                <div
                  key={c.sightingId}
                  style={{
                    background: 'rgba(15,23,42,0.7)',
                    border: `1px solid ${isExpanded ? 'rgba(99,102,241,0.4)' : 'rgba(51,65,85,0.6)'}`,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}
                >
                  {/* Card header */}
                  <div
                    onClick={() => toggleExpand(c.sightingId)}
                    style={{
                      padding: '14px 18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Rank badge */}
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'rgba(99,102,241,0.2)',
                      border: '1px solid rgba(99,102,241,0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#818cf8',
                      flexShrink: 0,
                    }}>
                      {idx + 1}
                    </div>

                    {/* Plate + type */}
                    <div style={{ flex: '1 1 160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.05em', fontFamily: 'monospace' }}>
                          {c.plateNormalized}
                        </span>
                        {matchTypeBadge(c.matchType)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {c.cameraCity && <span>📍 {c.cameraCity} · </span>}
                        {c.cameraName && <span>{c.cameraName} · </span>}
                        {new Date(c.ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                    </div>

                    {/* Vehicle class */}
                    {c.vehicleClass && (
                      <div style={{
                        background: 'rgba(30,41,59,0.8)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {c.vehicleClass}
                      </div>
                    )}

                    {/* Correlation score gauge */}
                    <div style={{ flex: '0 0 140px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Correlation</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{scoreLabel(c.correlationScore)}</span>
                      </div>
                      <ScoreBar score={c.correlationScore} color={color} />
                    </div>

                    {/* Expand toggle */}
                    <span style={{ color: '#64748b', fontSize: '0.9rem', flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                      ▾
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{
                      borderTop: '1px solid rgba(51,65,85,0.5)',
                      padding: '16px 18px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '16px',
                    }}>
                      {/* Signal breakdown */}
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>
                          Signal Breakdown
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {c.reasons.map(r => (
                            <div key={r.signal}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>{r.signal}</span>
                                <span style={{ fontSize: '0.72rem', color: scoreColor(r.score), fontWeight: 700 }}>{Math.round(r.score * 100)}%</span>
                              </div>
                              <ScoreBar score={r.score} color={scoreColor(r.score)} />
                              <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '3px' }}>{r.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Spatio-temporal metrics */}
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>
                          Spatio-Temporal Metrics
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {[
                            { label: 'Time Difference', value: formatTimeDiff(c.timeDiffSeconds) },
                            { label: 'Camera Distance', value: formatDistance(c.distanceMeters) },
                            { label: 'Implied Speed', value: c.impliedSpeedKmh !== null ? `${c.impliedSpeedKmh} km/h` : 'N/A' },
                            { label: 'Plate Similarity', value: `${Math.round(c.plateSimilarity * 100)}%` },
                            { label: 'OCR Confidence', value: `${Math.round(c.confidence * 100)}%` },
                            { label: 'Sighting ID', value: c.sightingId.slice(0, 8) + '…' },
                          ].map(({ label, value }) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{label}</span>
                              <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 600, fontFamily: label.includes('ID') ? 'monospace' : 'inherit' }}>
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Terminological disclaimer per card */}
                      <div style={{
                        gridColumn: '1 / -1',
                        background: 'rgba(99,102,241,0.06)',
                        border: '1px solid rgba(99,102,241,0.15)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '0.7rem',
                        color: '#94a3b8',
                        lineHeight: 1.5,
                      }}>
                        ℹ️ This observation candidate is presented for investigator review. A correlation score indicates observational
                        similarity between plate strings and spatio-temporal patterns. It does <strong style={{ color: '#c7d2fe' }}>not</strong> establish
                        that these observations belong to the same physical vehicle.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Initial empty state */}
      {!result && !loading && !error && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#475569',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px', opacity: 0.6 }}>🧩</div>
          <p style={{ fontSize: '0.9rem', margin: 0 }}>
            Click <strong style={{ color: '#818cf8' }}>Find Candidates</strong> to search for fuzzy-plate
            and spatio-temporal correlation candidates for <strong style={{ color: '#e2e8f0' }}>{plate}</strong>.
          </p>
          <p style={{ fontSize: '0.75rem', color: '#334155', marginTop: '8px' }}>
            Uses edit-distance ≤ 1 plate matching with OCR confusion matrix + camera proximity scoring.
          </p>
        </div>
      )}
    </div>
  );
}
