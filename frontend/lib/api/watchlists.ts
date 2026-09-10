// ==============================================================================
// Watchlist Management API Client
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8.2, 14.2)
// ==============================================================================

import { apiClient } from './client';
import {
  Watchlist,
  WatchlistEntry,
  CreateWatchlistPayload,
  CreateWatchlistEntryPayload,
  UpdateWatchlistEntryPayload,
} from '@/types/watchlist';

export const watchlistsApi = {
  /**
   * List all registered police watchlists with entry counts
   */
  async listWatchlists(params?: { search?: string; department_id?: string; limit?: number }): Promise<Watchlist[]> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.department_id) query.set('department_id', params.department_id);
    if (params?.limit) query.set('limit', String(params.limit));

    const qs = query.toString();
    const res = await apiClient.get<any>(qs ? `/watchlists?${qs}` : '/watchlists');
    // Backend returns { data: Watchlist[] } or array directly
    return Array.isArray(res) ? res : res.data || [];
  },

  /**
   * Get single watchlist deep-dive with entries
   */
  async getWatchlist(id: string): Promise<Watchlist> {
    return apiClient.get<Watchlist>(`/watchlists/${id}`);
  },

  /**
   * Create new police watchlist
   */
  async createWatchlist(payload: CreateWatchlistPayload): Promise<Watchlist> {
    return apiClient.post<Watchlist>('/watchlists', payload);
  },

  /**
   * Activate all entries in watchlist
   */
  async activateWatchlist(id: string): Promise<Watchlist> {
    return apiClient.post<Watchlist>(`/watchlists/${id}/activate`, {});
  },

  /**
   * Deactivate all entries in watchlist
   */
  async deactivateWatchlist(id: string): Promise<Watchlist> {
    return apiClient.post<Watchlist>(`/watchlists/${id}/deactivate`, {});
  },

  /**
   * List flagged plate entries in a watchlist
   */
  async listEntries(watchlistId: string): Promise<WatchlistEntry[]> {
    const res = await apiClient.get<any>(`/watchlists/${watchlistId}/entries`);
    return Array.isArray(res) ? res : res.data || [];
  },

  /**
   * Flag a license plate into a watchlist
   */
  async addEntry(watchlistId: string, payload: CreateWatchlistEntryPayload): Promise<WatchlistEntry> {
    return apiClient.post<WatchlistEntry>(`/watchlists/${watchlistId}/entries`, payload);
  },

  /**
   * Update watchlist entry details
   */
  async updateEntry(entryId: string, payload: UpdateWatchlistEntryPayload): Promise<WatchlistEntry> {
    return apiClient.patch<WatchlistEntry>(`/watchlists/entries/${entryId}`, payload);
  },

  /**
   * Deactivate a flagged plate entry (soft-delete)
   */
  async deactivateEntry(entryId: string): Promise<WatchlistEntry> {
    return apiClient.post<WatchlistEntry>(`/watchlists/entries/${entryId}/deactivate`, {});
  },
};
