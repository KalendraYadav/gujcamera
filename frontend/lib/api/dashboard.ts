// ==============================================================================
// Dashboard API Client
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8, 14.2)
//                  Phase 9 Operational Command Center Specification
// ==============================================================================

import { apiClient } from './client';
import { OperationalSummaryResponse } from '@/types/dashboard';

export const dashboardApi = {
  /**
   * Fetch aggregated operational command center summary
   */
  async getOperationalSummary(): Promise<OperationalSummaryResponse> {
    return apiClient.get<OperationalSummaryResponse>('/dashboard/operational-summary');
  },
};
