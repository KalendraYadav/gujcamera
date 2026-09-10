import {
  Controller,
  Get,
  Query,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Audit & Compliance')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'SYSTEM_AUDITOR')
  @ApiOperation({
    summary: 'Query immutable system compliance audit logs (FR-015)',
    description: 'Provides filterable, paginated audit records for system auditors and administrators with role enforcement.',
  })
  @ApiResponse({ status: 200, description: 'Filtered paginated compliance audit logs' })
  @ApiResponse({ status: 401, description: 'Unauthorized: missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires SUPER_ADMIN or SYSTEM_AUDITOR role' })
  async getAuditLogs(
    @Query() query: AuditQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    const result = await this.auditService.findAuditLogs(query);

    // Record access event without causing recursive explosion
    // Marked with action AUDIT_LOG_ACCESSED which is excluded by default from subsequent queries
    this.auditService.recordAudit({
      actorId: user.id,
      action: 'AUDIT_LOG_ACCESSED',
      resource: 'audit_logs',
      after: {
        filter_action: query.action || 'ALL',
        filter_resource: query.resource || 'ALL',
        page: query.page,
        limit: query.limit,
        returned_count: result.data.length,
      },
      correlationId,
    });

    return result;
  }
}
