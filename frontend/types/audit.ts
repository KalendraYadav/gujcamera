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
  actor_id?: string | null;
  actor_email?: string;
  actor_role?: string;
  actor_department?: string;
  resource?: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  ts?: string;
  correlation_id?: string | null;
}

export interface AuditQueryFilter {
  user_id?: string;
  actor_id?: string;
  action?: string;
  resource?: string;
  resource_type?: string;
  resource_id?: string;
  from_date?: string;
  to_date?: string;
  start_date?: string;
  end_date?: string;
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
  pagination?: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
