'use client';

// ==============================================================================
// Watchlist Management Console (Phase 4E)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.2, 14.2)
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ListFilter,
  Plus,
  Search,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Trash2,
  RefreshCw,
  FolderPlus,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { watchlistsApi } from '@/lib/api/watchlists';
import {
  Watchlist,
  WatchlistEntry,
  CreateWatchlistPayload,
  CreateWatchlistEntryPayload,
  AlertSeverity,
} from '@/types/watchlist';
import { useAuth } from '@/lib/auth/context';
import { canInspectVehicles } from '@/lib/auth/rbac';

export default function WatchlistPage() {
  const { user } = useAuth();
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedWatchlist, setSelectedWatchlist] = useState<Watchlist | null>(null);
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [isLoadingWatchlists, setIsLoadingWatchlists] = useState(true);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAddWatchlistModal, setShowAddWatchlistModal] = useState(false);
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // New Watchlist form state
  const [newListName, setNewListName] = useState('');
  const [newListOwner, setNewListOwner] = useState('');

  // New Entry form state
  const [newPlate, setNewPlate] = useState('');
  const [newCategory, setNewCategory] = useState('STOLEN_VEHICLE');
  const [newReason, setNewReason] = useState('');
  const [newPriority, setNewPriority] = useState<AlertSeverity>('HIGH');
  const [newExpiry, setNewExpiry] = useState('');

  const role = user?.role;
  const canManageWatchlist = role === 'SUPER_ADMIN' || role === 'DEPARTMENT_ADMIN';
  const canAddEntry = role === 'SUPER_ADMIN' || role === 'DEPARTMENT_ADMIN' || role === 'INVESTIGATOR';
  const canInspect = canInspectVehicles(role);

  const loadWatchlists = useCallback(async () => {
    setIsLoadingWatchlists(true);
    setError(null);
    try {
      const data = await watchlistsApi.listWatchlists();
      setWatchlists(data);
      if (data.length > 0) {
        setSelectedWatchlist((prev) => {
          if (!prev) return data[0];
          const found = data.find((w) => w.id === prev.id);
          return found || data[0];
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load police watchlists');
    } finally {
      setIsLoadingWatchlists(false);
    }
  }, []);

  const loadEntries = useCallback(async (watchlistId: string) => {
    setIsLoadingEntries(true);
    try {
      const data = await watchlistsApi.listEntries(watchlistId);
      setEntries(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load flagged plate entries');
    } finally {
      setIsLoadingEntries(false);
    }
  }, []);

  useEffect(() => {
    loadWatchlists();
  }, []);

  useEffect(() => {
    if (selectedWatchlist) {
      loadEntries(selectedWatchlist.id);
    }
  }, [selectedWatchlist, loadEntries]);

  // Handle Create Watchlist
  const handleCreateWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !newListOwner.trim()) return;

    setIsSubmitting(true);
    setModalError(null);
    try {
      const created = await watchlistsApi.createWatchlist({
        name: newListName.trim(),
        department_id: user?.department_id || '08c817f0-e809-4b46-9e63-8bab51000deb',
        owner: newListOwner.trim(),
      });
      setShowAddWatchlistModal(false);
      setNewListName('');
      setNewListOwner('');
      await loadWatchlists();
      setSelectedWatchlist(created);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create watchlist');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Entry
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWatchlist || !newPlate.trim() || !newReason.trim()) return;

    setIsSubmitting(true);
    setModalError(null);
    try {
      await watchlistsApi.addEntry(selectedWatchlist.id, {
        plate: newPlate.trim(),
        category: newCategory,
        reason: newReason.trim(),
        priority: newPriority,
        expires_at: newExpiry ? new Date(newExpiry).toISOString() : undefined,
      });
      setShowAddEntryModal(false);
      setNewPlate('');
      setNewReason('');
      setNewExpiry('');
      await loadEntries(selectedWatchlist.id);
      await loadWatchlists();
    } catch (err: any) {
      setModalError(err.message || 'Failed to add plate to watchlist');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Deactivate Entry
  const handleDeactivateEntry = async (entryId: string) => {
    if (!selectedWatchlist) return;
    try {
      await watchlistsApi.deactivateEntry(entryId);
      await loadEntries(selectedWatchlist.id);
    } catch (err: any) {
      alert(`Deactivation failed: ${err.message}`);
    }
  };

  return (
    <AppShell>
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
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
                <ListFilter size={15} color="#F87171" />
              </div>
              <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.01em', margin: 0 }}>
                Watchlist Registry
              </h1>
              <StatusBadge label="Active Matching" status="ONLINE" size="sm" />
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
              Target lists for flagged, stolen, and wanted suspect plates.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={loadWatchlists}
              id="refresh-watchlists-btn"
              title="Refresh watchlists"
              disabled={isLoadingWatchlists}
              className="btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: 'var(--text-sm)',
              }}
            >
              <RefreshCw size={13} className={isLoadingWatchlists ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            {canManageWatchlist && (
              <button
                onClick={() => setShowAddWatchlistModal(true)}
                className="btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <FolderPlus size={14} />
                <span>New Watchlist</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Error Notice */}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(215, 25, 63, 0.1)',
              border: '1px solid rgba(215, 25, 63, 0.3)',
              borderRadius: '6px',
              color: 'var(--accent-primary)',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        {/* Master-Detail Layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 340px) 1fr',
            gap: 'var(--space-4)',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Watchlist Catalog */}
          <div
            className="netrava-card"
            style={{
              padding: '16px',
            }}
          >
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <Search
                size={13}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                id="search-watchlists-input"
                className="netrava-input"
                placeholder="Search watchlists..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '32px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  fontSize: '11px',
                }}
              />
            </div>

            {isLoadingWatchlists ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                Loading watchlists...
              </div>
            ) : (() => {
              const filteredWatchlists = watchlists.filter((w) => {
                if (!searchTerm.trim()) return true;
                const term = searchTerm.toLowerCase().trim();
                return (
                  w.name.toLowerCase().includes(term) ||
                  (w.owner && w.owner.toLowerCase().includes(term)) ||
                  (w.department?.name && w.department.name.toLowerCase().includes(term)) ||
                  (w.department_name && w.department_name.toLowerCase().includes(term)) ||
                  w.id.toLowerCase().includes(term)
                );
              });

              if (filteredWatchlists.length === 0) {
                return (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No watchlists found.
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {filteredWatchlists.map((w) => {
                    const isSelected = selectedWatchlist?.id === w.id;
                    const plateCount = w.entries_count ?? w.entry_count ?? w.entries?.length ?? 0;
                    return (
                      <div
                        key={w.id}
                        id={`watchlist-item-${w.id}`}
                        onClick={() => setSelectedWatchlist(w)}
                        className={`netrava-nav-link ${isSelected ? 'active' : ''}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          padding: '10px 12px',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'inherit', marginBottom: '4px' }}>
                          {w.name}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
                          <span>{w.owner}</span>
                          <span id={`watchlist-count-${w.id}`} style={{ fontFamily: 'var(--font-mono)' }}>
                            {plateCount} {plateCount === 1 ? 'plate' : 'plates'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Right Column: Selected Watchlist Entries */}
          <div
            className="netrava-card"
            style={{
              padding: '20px',
            }}
          >
            {selectedWatchlist ? (
              <div>
                {/* Watchlist Header Details */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    paddingBottom: '14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px', margin: 0 }}>
                      {selectedWatchlist.name}
                    </h2>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Owner: <span style={{ color: 'var(--text-secondary)' }}>{selectedWatchlist.owner}</span> • Department: <span style={{ color: 'var(--text-secondary)' }}>{selectedWatchlist.department?.name || 'Assigned Division'}</span>
                    </div>
                  </div>

                  {canAddEntry && (
                    <button
                      onClick={() => setShowAddEntryModal(true)}
                      className="btn-primary"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        fontSize: '11px',
                      }}
                    >
                      <Plus size={14} />
                      <span>Flag License Plate</span>
                    </button>
                  )}
                </div>

                {/* Flagged Entries Table */}
                {isLoadingEntries ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    Loading flagged plates...
                  </div>
                ) : entries.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No vehicle plates flagged in this watchlist.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="netrava-table" style={{ width: '100%', textAlign: 'left', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>Plate</th>
                          <th>Priority</th>
                          <th>Category</th>
                          <th>Reason / FIR</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => {
                          const hasSightings = (entry.sightings_count ?? 0) > 0;
                          return (
                            <tr
                              key={entry.id}
                              style={{
                                opacity: entry.active ? 1 : 0.6,
                              }}
                            >
                              <td>
                                {hasSightings && canInspect ? (
                                  <Link
                                    href={`/vehicles/${encodeURIComponent(entry.plate_normalized)}`}
                                    id={`track-plate-link-${entry.id}`}
                                    className="plate-badge interactive"
                                    title={`Investigate ${entry.plate_normalized} in Vehicle Tracking`}
                                  >
                                    <span>{entry.plate_normalized}</span>
                                    <ExternalLink size={11} />
                                  </Link>
                                ) : (
                                  <span className="plate-badge">{entry.plate_normalized}</span>
                                )}
                              </td>
                              <td>
                                <StatusBadge
                                  label={entry.priority}
                                  status={
                                    entry.priority === 'CRITICAL'
                                      ? 'ERROR'
                                      : entry.priority === 'HIGH'
                                      ? 'DEGRADED'
                                      : 'ONLINE'
                                  }
                                  size="sm"
                                />
                              </td>
                              <td style={{ color: 'var(--text-secondary)' }}>
                                {entry.category}
                              </td>
                              <td style={{ color: 'var(--text-secondary)', maxWidth: '280px' }}>
                                {entry.reason}
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ color: entry.active ? 'var(--status-success)' : 'var(--text-muted)', fontWeight: 600 }}>
                                    {entry.active ? 'Active Target' : 'Inactive'}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: hasSightings ? 'var(--accent-blue)' : 'var(--text-muted)',
                                    }}
                                  >
                                    {hasSightings
                                      ? `${entry.sightings_count} camera ${entry.sightings_count === 1 ? 'sighting' : 'sightings'} recorded`
                                      : 'No camera sightings recorded'}
                                  </span>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                  {hasSightings && canInspect && (
                                    <Link
                                      href={`/vehicles/${encodeURIComponent(entry.plate_normalized)}`}
                                      id={`track-action-btn-${entry.id}`}
                                      className="btn-secondary"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        textDecoration: 'none',
                                      }}
                                      title={`Track ${entry.plate_normalized} in Vehicle Intelligence`}
                                    >
                                      <span>Track</span>
                                      <ArrowRight size={11} />
                                    </Link>
                                  )}
                                  {canAddEntry && entry.active && (
                                    <button
                                      onClick={() => handleDeactivateEntry(entry.id)}
                                      title="Deactivate plate"
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        padding: '4px',
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Select a watchlist to inspect entries.
              </div>
            )}
          </div>
        </div>

        {/* Modal: Create Watchlist */}
        {showAddWatchlistModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(5, 8, 15, 0.85)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              className="netrava-card"
              style={{
                maxWidth: '480px',
                width: '100%',
                padding: '24px',
                boxShadow: 'var(--shadow-modal)',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', margin: 0 }}>
                Create New Police Watchlist
              </h3>

              {modalError && (
                <div style={{ padding: '8px 12px', backgroundColor: 'rgba(215,25,63,0.1)', color: 'var(--accent-primary)', fontSize: '11px', marginBottom: '12px', borderRadius: '4px' }}>
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateWatchlist} style={{ marginTop: '12px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                    Watchlist Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="netrava-input"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. Gandhinagar Inter-District Contraband Suspects"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                    Owner Unit / Division *
                  </label>
                  <input
                    type="text"
                    required
                    className="netrava-input"
                    value={newListOwner}
                    onChange={(e) => setNewListOwner(e.target.value)}
                    placeholder="e.g. Special Operations Group (SOG)"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddWatchlistModal(false)}
                    className="btn-secondary"
                    style={{
                      padding: '7px 14px',
                      fontSize: '12px',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary"
                    style={{
                      padding: '7px 16px',
                      fontSize: '12px',
                    }}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Watchlist'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Flagged Plate */}
        {showAddEntryModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(5, 8, 15, 0.85)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              className="netrava-card"
              style={{
                maxWidth: '480px',
                width: '100%',
                padding: '24px',
                boxShadow: 'var(--shadow-modal)',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', margin: 0 }}>
                Flag License Plate in {selectedWatchlist?.name}
              </h3>

              {modalError && (
                <div style={{ padding: '8px 12px', backgroundColor: 'rgba(215,25,63,0.1)', color: 'var(--accent-primary)', fontSize: '11px', marginBottom: '12px', borderRadius: '4px' }}>
                  {modalError}
                </div>
              )}

              <form onSubmit={handleAddEntry} style={{ marginTop: '12px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                    License Plate (Auto-Normalized) *
                  </label>
                  <input
                    type="text"
                    required
                    className="netrava-input"
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                    placeholder="e.g. GJ01AB1234"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                      Category *
                    </label>
                    <select
                      value={newCategory}
                      className="netrava-input"
                      onChange={(e) => setNewCategory(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '12px',
                      }}
                    >
                      <option value="STOLEN_VEHICLE">Stolen Vehicle</option>
                      <option value="HIT_AND_RUN">Hit and Run</option>
                      <option value="WANTED_SUSPECT">Wanted Suspect</option>
                      <option value="ORGANIZED_CRIME">Organized Crime</option>
                      <option value="TRAFFIC_VIOLATION">Traffic Violation</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                      Alert Priority *
                    </label>
                    <select
                      value={newPriority}
                      className="netrava-input"
                      onChange={(e) => setNewPriority(e.target.value as AlertSeverity)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '12px',
                      }}
                    >
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                    Reason / FIR Reference *
                  </label>
                  <textarea
                    rows={2}
                    required
                    className="netrava-input"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder="e.g. FIR #402/2026 registered at Bodakdev Police Station"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                      resize: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddEntryModal(false)}
                    className="btn-secondary"
                    style={{
                      padding: '7px 14px',
                      fontSize: '12px',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary"
                    style={{
                      padding: '7px 16px',
                      fontSize: '12px',
                    }}
                  >
                    {isSubmitting ? 'Flagging...' : 'Add Plate Entry'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
