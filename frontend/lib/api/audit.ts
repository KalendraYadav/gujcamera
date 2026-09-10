// ==============================================================================
// Audit Log Query API Client
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.2, 14.2)
// ==============================================================================

import { apiClient } from './client';
import { AuditListResponse, AuditQueryFilter } from '@/types/audit';

export const auditApi = {
  /**
   * Query immutable system audit logs with filtering and pagination
   * Requires SUPER_ADMIN or SYSTEM_AUDITOR role
   */
  async getAuditLogs(filter?: AuditQueryFilter): Promise<AuditListResponse> {
    const query = new URLSearchParams();
    if (filter?.user_id) query.set('user_id', filter.user_id);
    if (filter?.action) query.set('action', filter.action);
    if (filter?.resource_type) query.set('resource_type', filter.resource_type);
    if (filter?.resource_id) query.set('resource_id', filter.resource_id);
    if (filter?.from_date) query.set('from_date', filter.from_date);
    if (filter?.to_date) query.set('to_date', filter.to_date);
    if (filter?.status) query.set('status', filter.status);
    if (filter?.page) query.set('page', String(filter.page));
    if (filter?.limit) query.set('limit', String(filter.limit));
    if (filter?.sort_order) query.set('sort_order', filter.sort_order);
    if (filter?.include_system_reads !== undefined) {
      query.set('include_system_reads', String(filter.include_system_reads));
    }

    const qs = query.toString();
    return apiClient.get<AuditListResponse>(qs ? `/audit?${qs}` : '/audit');
  },
};
