// ==============================================================================
// Standardized REST API Error Envelope & Request Contracts
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8.1: API Contract Conventions)
// ==============================================================================

export interface ApiErrorPayload {
  error_code: string;
  message: string;
  request_id?: string;
  timestamp?: string;
}

export class ApiError extends Error {
  public readonly errorCode: string;
  public readonly statusCode: number;
  public readonly requestId?: string;
  public readonly timestamp?: string;

  constructor(payload: ApiErrorPayload, statusCode: number) {
    super(payload.message || 'An unexpected API error occurred');
    this.name = 'ApiError';
    this.errorCode = payload.error_code || 'API_ERROR';
    this.statusCode = statusCode;
    this.requestId = payload.request_id;
    this.timestamp = payload.timestamp;
  }
}

export interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
  requestId?: string;
}
