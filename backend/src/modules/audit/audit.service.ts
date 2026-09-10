import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Safe recursive sanitizer to strip potential sensitive tokens/passwords
   * from audit diffs before returning to the caller.
   */
  private sanitizeData(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeData(item));
    }
    const clean: Record<string, any> = {};
    const sensitiveKeys = new Set([
      'password',
      'passwordhash',
      'token',
      'access_token',
      'refresh_token',
      'jwt',
      'secret',
      'authorization',
    ]);

    for (const [key, val] of Object.entries(obj)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        clean[key] = '[REDACTED]';
      } else if (typeof val === 'object' && val !== null) {
        clean[key] = this.sanitizeData(val);
      } else {
        clean[key] = val;
      }
    }
    return clean;
  }

  /**
   * Query historical compliance audit records with role-enforced filtering and safe bounded pagination.
   */
  async findAuditLogs(query: AuditQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.actor_id) {
      where.actorId = query.actor_id;
    }

    if (query.action) {
      where.action = { equals: query.action, mode: 'insensitive' };
    }

    if (query.resource) {
      where.resource = { equals: query.resource, mode: 'insensitive' };
    }

    if (query.start_date || query.end_date) {
      where.ts = {};
      if (query.start_date) {
        where.ts.gte = new Date(query.start_date);
      }
      if (query.end_date) {
        where.ts.lte = new Date(query.end_date);
      }
    }

    // By default, exclude recursive query read logs unless explicitly requested
    if (!query.include_system_reads) {
      if (where.action) {
        // If specific action was requested, do not override unless it was AUDIT_LOG_ACCESSED
        if (typeof where.action === 'object' && where.action.equals?.toUpperCase() === 'AUDIT_LOG_ACCESSED') {
          // Allow explicit query for read logs
        }
      } else {
        where.action = { not: 'AUDIT_LOG_ACCESSED' };
      }
    }

    const [total, records] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { ts: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              role: { select: { name: true } },
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const sanitizedRecords = records.map((rec) => ({
      id: rec.id,
      actor_id: rec.actorId,
      actor_email: rec.actor?.email || 'SYSTEM / AUTOMATED',
      actor_role: rec.actor?.role?.name || 'SYSTEM',
      actor_department: rec.actor?.department?.name || 'SYSTEM_INTERNAL',
      action: rec.action,
      resource: rec.resource,
      before: this.sanitizeData(rec.before),
      after: this.sanitizeData(rec.after),
      ts: rec.ts.toISOString(),
      correlation_id: rec.correlationId,
    }));

    return {
      data: sanitizedRecords,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Helper to synchronously record an audit entry.
   */
  async recordAudit(params: {
    actorId?: string;
    action: string;
    resource: string;
    before?: any;
    after?: any;
    correlationId?: string;
  }) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId,
          action: params.action,
          resource: params.resource,
          before: params.before ? this.sanitizeData(params.before) : undefined,
          after: params.after ? this.sanitizeData(params.after) : undefined,
          correlationId: params.correlationId,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to record audit log (${params.action}): ${err.message}`);
      // Do not crash application on secondary audit errors
      return null;
    }
  }
}
