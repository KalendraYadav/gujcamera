'use client';

// ==============================================================================
// Watchlist Management Console (Phase 4E)
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6.2, 14.2)
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';
import { watchlistsApi } from '@/lib/api/watchlists';
import {
  Watchlist,
  WatchlistEntry,
  CreateWatchlistPayload,
  CreateWatchlistEntryPayload,
  AlertSeverity,
} from '@/types/watchlist';
import { useAuth } from '@/lib/auth/context';

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

  const loadWatchlists = useCallback(async () => {
    setIsLoadingWatchlists(true);
    setError(null);
    try {
      const data = await watchlistsApi.listWatchlists({ search: searchTerm || undefined });
      setWatchlists(data);
      if (data.length > 0 && !selectedWatchlist) {
        setSelectedWatchlist(data[0]);
      } else if (selectedWatchlist) {
        const found = data.find((w) => w.id === selectedWatchlist.id);
        if (found) setSelectedWatchlist(found);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load police watchlists');
    } finally {
      setIsLoadingWatchlists(false);
    }
  }, [searchTerm, selectedWatchlist]);

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
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Page Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Watchlist Registry
              </h1>
              <StatusBadge label="ACTIVE MATCHING" variant="success" />
              <SimulatedDataBadge compact />
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Target lists for flagged vehicles of interest, stolen cars, and wanted suspect plates.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              onClick={loadWatchlists}
              disabled={isLoadingWatchlists}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
              }}
            >
              <RefreshCw size={13} className={isLoadingWatchlists ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            {canManageWatchlist && (
              <button
                onClick={() => setShowAddWatchlistModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
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
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--status-danger)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--status-danger)',
              fontSize: 'var(--text-sm)',
              marginBottom: 'var(--space-6)',
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
            gap: 'var(--space-6)',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Watchlist Catalog */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
            }}
          >
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <input
                type="text"
                placeholder="Search watchlists..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-xs)',
                }}
              />
            </div>

            {isLoadingWatchlists ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                Loading watchlists...
              </div>
            ) : watchlists.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                No watchlists found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {watchlists.map((w) => {
                  const isSelected = selectedWatchlist?.id === w.id;
                  return (
                    <div
                      key={w.id}
                      onClick={() => setSelectedWatchlist(w)}
                      style={{
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        backgroundColor: isSelected ? 'var(--accent-glow)' : 'var(--bg-primary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {w.name}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        <span>{w.owner}</span>
                        <span>{w.entry_count ?? w.entries?.length ?? 0} plates</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Watchlist Entries */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-6)',
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
                    gap: 'var(--space-3)',
                    paddingBottom: 'var(--space-4)',
                    borderBottom: '1px solid var(--border-subtle)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
                      {selectedWatchlist.name}
                    </h2>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Owner: {selectedWatchlist.owner} • Department: {selectedWatchlist.department?.name || 'Assigned Division'}
                    </div>
                  </div>

                  {canAddEntry && (
                    <button
                      onClick={() => setShowAddEntryModal(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                        padding: 'var(--space-2) var(--space-3)',
                        backgroundColor: 'var(--accent-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={14} />
                      <span>Flag License Plate</span>
                    </button>
                  )}
                </div>

                {/* Flagged Entries Table */}
                {isLoadingEntries ? (
                  <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    Loading flagged plate entries...
                  </div>
                ) : entries.length === 0 ? (
                  <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    No vehicle plates flagged in this watchlist yet.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-default)', textAlign: 'left', color: 'var(--text-muted)' }}>
                          <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Plate</th>
                          <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Priority</th>
                          <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Category</th>
                          <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Reason / FIR</th>
                          <th style={{ padding: 'var(--space-2) var(--space-3)' }}>Status</th>
                          {canAddEntry && <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right' }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => (
                          <tr
                            key={entry.id}
                            style={{
                              borderBottom: '1px solid var(--border-subtle)',
                              backgroundColor: entry.active ? 'transparent' : 'rgba(255,255,255,0.01)',
                              opacity: entry.active ? 1 : 0.6,
                            }}
                          >
                            <td style={{ padding: 'var(--space-3)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {entry.plate_normalized}
                            </td>
                            <td style={{ padding: 'var(--space-3)' }}>
                              <StatusBadge
                                label={entry.priority}
                                variant={
                                  entry.priority === 'CRITICAL'
                                    ? 'critical'
                                    : entry.priority === 'HIGH'
                                    ? 'warning'
                                    : entry.priority === 'MEDIUM'
                                    ? 'info'
                                    : 'neutral'
                                }
                              />
                            </td>
                            <td style={{ padding: 'var(--space-3)', color: 'var(--text-secondary)' }}>
                              {entry.category}
                            </td>
                            <td style={{ padding: 'var(--space-3)', color: 'var(--text-secondary)', maxWidth: '280px' }}>
                              {entry.reason}
                            </td>
                            <td style={{ padding: 'var(--space-3)' }}>
                              <span style={{ color: entry.active ? 'var(--status-success)' : 'var(--text-muted)' }}>
                                {entry.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            {canAddEntry && (
                              <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                                {entry.active && (
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
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
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
              backgroundColor: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 'var(--space-4)',
            }}
          >
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                maxWidth: '480px',
                width: '100%',
                padding: 'var(--space-6)',
              }}
            >
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>
                Create New Police Watchlist
              </h3>

              {modalError && (
                <div style={{ padding: 'var(--space-2)', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--status-danger)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateWatchlist}>
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Watchlist Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. Gandhinagar Inter-District Contraband Suspects"
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Owner Unit / Division *
                  </label>
                  <input
                    type="text"
                    required
                    value={newListOwner}
                    onChange={(e) => setNewListOwner(e.target.value)}
                    placeholder="e.g. Special Operations Group (SOG)"
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddWatchlistModal(false)}
                    style={{
                      padding: 'var(--space-2) var(--space-4)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      padding: 'var(--space-2) var(--space-4)',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 600,
                      cursor: 'pointer',
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
              backgroundColor: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 'var(--space-4)',
            }}
          >
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                maxWidth: '480px',
                width: '100%',
                padding: 'var(--space-6)',
              }}
            >
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>
                Flag License Plate in {selectedWatchlist?.name}
              </h3>

              {modalError && (
                <div style={{ padding: 'var(--space-2)', backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--status-danger)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                  {modalError}
                </div>
              )}

              <form onSubmit={handleAddEntry}>
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    License Plate (Auto-Normalized) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                    placeholder="e.g. GJ01AB1234"
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Category *
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      style={{
                        width: '100%',
                        padding: 'var(--space-2) var(--space-3)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        fontSize: 'var(--text-sm)',
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
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Alert Priority *
                    </label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as AlertSeverity)}
                      style={{
                        width: '100%',
                        padding: 'var(--space-2) var(--space-3)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        fontSize: 'var(--text-sm)',
                      }}
                    >
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Reason / FIR Reference *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder="e.g. FIR #402/2026 registered at Bodakdev Police Station"
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddEntryModal(false)}
                    style={{
                      padding: 'var(--space-2) var(--space-4)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      padding: 'var(--space-2) var(--space-4)',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 600,
                      cursor: 'pointer',
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
