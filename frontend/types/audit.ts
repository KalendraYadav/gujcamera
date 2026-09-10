// ==============================================================================
// Audit Trail Domain Types
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 7.2 & 14.2)
// ==============================================================================

export interface AuditUser {
  id: string;
  name: string;
  badge_number: string;
  role: string;
  department: string | null;
}

export interface AuditLogItem {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_id: string | null;
  ip_address: string | null;
  status: 'SUCCESS' | 'FAILURE' | string;
  details: Record<string, any> | null;
  timestamp: string;
  user: AuditUser | null;
}

export interface AuditQueryFilter {
  user_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
  page?: number;
  limit?: number;
  sort_order?: 'asc' | 'desc';
  include_system_reads?: boolean;
}

export interface AuditListResponse {
  data: AuditLogItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
