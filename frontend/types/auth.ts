// ==============================================================================
// Authentication & RBAC Domain Types
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8.1 & Section 14)
// ==============================================================================

export type PoliceRole =
  | 'SUPER_ADMIN'
  | 'DEPARTMENT_ADMIN'
  | 'INVESTIGATOR'
  | 'OPERATOR'
  | 'SYSTEM_AUDITOR'
  | 'VIEWER';

export interface PoliceUser {
  id: string;
  email: string;
  role: PoliceRole;
  department_id: string;
  department_name?: string;
  mfa_enabled?: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: PoliceUser;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthState {
  user: PoliceUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
