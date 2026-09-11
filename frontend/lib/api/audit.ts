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

    // Canonical query parameter translation matching backend AuditQueryDto
    const actorId = filter?.actor_id || filter?.user_id;
    if (actorId) query.set('actor_id', actorId);

    if (filter?.action) query.set('action', filter.action);

    const resource = filter?.resource || filter?.resource_type;
    if (resource) query.set('resource', resource);

    const startDate = filter?.start_date || filter?.from_date;
    if (startDate) query.set('start_date', startDate);

    const endDate = filter?.end_date || filter?.to_date;
    if (endDate) query.set('end_date', endDate);

    if (filter?.page) query.set('page', String(filter.page));
    if (filter?.limit) query.set('limit', String(filter.limit));
    if (filter?.include_system_reads !== undefined) {
      query.set('include_system_reads', String(filter.include_system_reads));
    }
    // NOTE: sort_order and status are not whitelisted on backend AuditQueryDto.
    // Immutable audit logs are always ordered ts: desc by the backend service.

    const qs = query.toString();
    const raw = await apiClient.get<any>(qs ? `/audit?${qs}` : '/audit');

    // Robust normalization accommodating both backend pagination and mock formats
    const rawList: any[] = Array.isArray(raw) ? raw : raw?.data || [];
    const rawPagination = raw?.pagination || raw?.meta || {};

    const total = rawPagination.total ?? rawList.length;
    const page = rawPagination.page ?? filter?.page ?? 1;
    const limit = rawPagination.limit ?? filter?.limit ?? 15;
    const totalPages =
      rawPagination.total_pages ??
      rawPagination.totalPages ??
      (limit > 0 ? Math.ceil(total / limit) : 1);

    const data = rawList.map((item: any) => {
      const status =
        item.status ||
        (item.action &&
        (item.action.toUpperCase().includes('FAIL') || item.action.toUpperCase().includes('BREACH'))
          ? 'FAILURE'
          : 'SUCCESS');

      const timestamp = item.ts || item.timestamp || new Date().toISOString();
      const resourceType = item.resource || item.resource_type || 'System';

      const user = item.user
        ? item.user
        : item.actor_email
        ? {
            id: item.actor_id || '',
            name: item.actor_email,
            badge_number: item.actor_role || 'OFFICER',
            role: item.actor_role || 'SUPER_ADMIN',
            department: item.actor_department || null,
          }
        : null;

      const details =
        item.details !== undefined
          ? item.details
          : item.before || item.after
          ? { before: item.before, after: item.after }
          : null;

      return {
        id: item.id,
        action: item.action,
        resource_type: resourceType,
        resource_id: item.correlation_id || item.actor_id || null,
        user_id: item.actor_id || item.user_id || null,
        ip_address: item.ip_address || null,
        status,
        details,
        timestamp,
        user,
        // Canonical backend fields
        actor_id: item.actor_id,
        actor_email: item.actor_email,
        actor_role: item.actor_role,
        actor_department: item.actor_department,
        resource: item.resource,
        before: item.before,
        after: item.after,
        ts: item.ts,
        correlation_id: item.correlation_id,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
      pagination: {
        total,
        page,
        limit,
        total_pages: totalPages,
      },
    };
  },
};
