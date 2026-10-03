// ==============================================================================
// Dashboard & Operational Command Center Controller
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 8, 14.2)
//                  Phase 9 Operational Command Center Specification
// ==============================================================================

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService, OperationalSummaryResponse } from './dashboard.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('operational-summary')
  @Roles('OPERATOR', 'INVESTIGATOR', 'DEPARTMENT_ADMIN', 'SUPER_ADMIN', 'SYSTEM_AUDITOR')
  @ApiOperation({
    summary: 'Get unified operational intelligence summary for state command center',
    description:
      'Aggregates real-time subsystem health, camera fleet telemetry, active priority alerts, watchlist matches, recent CCTV observations, and jurisdiction distributions in a single high-performance payload.',
  })
  @ApiResponse({ status: 200, description: 'Operational command center summary' })
  @ApiResponse({ status: 401, description: 'Unauthorized: missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient privileges' })
  async getOperationalSummary(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OperationalSummaryResponse> {
    return this.dashboardService.getOperationalSummary(user);
  }
}
