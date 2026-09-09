import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma, AlertSeverity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateWatchlistDto, UpdateWatchlistDto, WatchlistQueryDto } from './dto/watchlist.dto';
import { CreateWatchlistEntryDto, UpdateWatchlistEntryDto, WatchlistEntryQueryDto } from './dto/watchlist-entry.dto';
import { normalizeLicensePlate, isValidPlateFormat } from '../vehicles/utils/plate-normalizer';

@Injectable()
export class WatchlistsService {
  private readonly logger = new Logger(WatchlistsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Watchlist (Super Admin across depts, Dept Admin for own dept)
   */
  async createWatchlist(dto: CreateWatchlistDto, user: AuthenticatedUser, requestId?: string) {
    const departmentId = dto.department_id;

    // RBAC: Department Admins can only create watchlists for their assigned department
    if (user.role === 'DEPARTMENT_ADMIN' && user.departmentId !== departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only create watchlists for their assigned department',
      });
    }

    // Verify department exists
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new BadRequestException({
        error_code: 'DEPARTMENT_NOT_FOUND',
        message: `Department with ID '${departmentId}' does not exist`,
      });
    }

    const watchlist = await this.prisma.watchlist.create({
      data: {
        name: dto.name,
        departmentId,
        owner: dto.owner,
      },
      include: {
        department: {
          select: { id: true, name: true },
        },
        _count: {
          select: { entries: true },
        },
      },
    });

    // Synchronous audit log
    await this.recordAuditLog(
      user.id,
      'WATCHLIST_CREATE',
      'Watchlist',
      null,
      {
        id: watchlist.id,
        name: watchlist.name,
        department_id: watchlist.departmentId,
        owner: watchlist.owner,
      },
      requestId,
    );

    return {
      id: watchlist.id,
      name: watchlist.name,
      department_id: watchlist.departmentId,
      department_name: watchlist.department.name,
      owner: watchlist.owner,
      entries_count: watchlist._count.entries,
      created_at: watchlist.createdAt,
    };
  }

  /**
   * List watchlists with filters and pagination
   */
  async listWatchlists(query: WatchlistQueryDto, user: AuthenticatedUser, requestId?: string) {
    const limit = query.limit || 20;
    const where: Prisma.WatchlistWhereInput = {};

    if (query.department_id) {
      where.departmentId = query.department_id;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { owner: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.cursor) {
      where.id = { gt: query.cursor };
    }

    const [watchlists, total] = await Promise.all([
      this.prisma.watchlist.findMany({
        where,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        include: {
          department: { select: { id: true, name: true } },
          _count: { select: { entries: true } },
        },
      }),
      this.prisma.watchlist.count({ where }),
    ]);

    let nextCursor: string | null = null;
    let data = watchlists;
    if (watchlists.length > limit) {
      const nextItem = data.pop();
      nextCursor = nextItem?.id || null;
    }

    return {
      data: data.map((w) => ({
        id: w.id,
        name: w.name,
        department_id: w.departmentId,
        department_name: w.department.name,
        owner: w.owner,
        entries_count: w._count.entries,
        created_at: w.createdAt,
      })),
      pagination: {
        limit,
        total,
        next_cursor: nextCursor,
      },
    };
  }

  /**
   * Get single watchlist deep-dive
   */
  async getWatchlist(id: string, user: AuthenticatedUser, requestId?: string) {
    const watchlist = await this.prisma.watchlist.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { entries: true } },
      },
    });

    if (!watchlist) {
      throw new NotFoundException({
        error_code: 'WATCHLIST_NOT_FOUND',
        message: `Watchlist with ID '${id}' does not exist`,
      });
    }

    // Active vs inactive entries count
    const [activeCount, inactiveCount] = await Promise.all([
      this.prisma.watchlistEntry.count({ where: { watchlistId: id, active: true } }),
      this.prisma.watchlistEntry.count({ where: { watchlistId: id, active: false } }),
    ]);

    return {
      id: watchlist.id,
      name: watchlist.name,
      department_id: watchlist.departmentId,
      department_name: watchlist.department.name,
      owner: watchlist.owner,
      total_entries: watchlist._count.entries,
      active_entries: activeCount,
      inactive_entries: inactiveCount,
      created_at: watchlist.createdAt,
    };
  }

  /**
   * Update watchlist details (name, owner)
   */
  async updateWatchlist(id: string, dto: UpdateWatchlistDto, user: AuthenticatedUser, requestId?: string) {
    const existing = await this.prisma.watchlist.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        error_code: 'WATCHLIST_NOT_FOUND',
        message: `Watchlist with ID '${id}' does not exist`,
      });
    }

    // RBAC: Department Admins can only update watchlists of their own department
    if (user.role === 'DEPARTMENT_ADMIN' && user.departmentId !== existing.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only update watchlists belonging to their assigned department',
      });
    }

    const updated = await this.prisma.watchlist.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.owner && { owner: dto.owner }),
      },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { entries: true } },
      },
    });

    await this.recordAuditLog(
      user.id,
      'WATCHLIST_UPDATE',
      'Watchlist',
      { name: existing.name, owner: existing.owner },
      { name: updated.name, owner: updated.owner },
      requestId,
    );

    return {
      id: updated.id,
      name: updated.name,
      department_id: updated.departmentId,
      department_name: updated.department.name,
      owner: updated.owner,
      entries_count: updated._count.entries,
      created_at: updated.createdAt,
    };
  }

  /**
   * Activate all entries in the watchlist
   */
  async activateWatchlist(id: string, user: AuthenticatedUser, requestId?: string) {
    const existing = await this.prisma.watchlist.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        error_code: 'WATCHLIST_NOT_FOUND',
        message: `Watchlist with ID '${id}' does not exist`,
      });
    }

    if (user.role === 'DEPARTMENT_ADMIN' && user.departmentId !== existing.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only manage watchlists belonging to their assigned department',
      });
    }

    const result = await this.prisma.watchlistEntry.updateMany({
      where: { watchlistId: id, active: false },
      data: { active: true },
    });

    await this.recordAuditLog(
      user.id,
      'WATCHLIST_ACTIVATE',
      'Watchlist',
      { id, active_entries_before: 'partial/inactive' },
      { id, activated_count: result.count },
      requestId,
    );

    return {
      message: 'Watchlist successfully activated',
      id,
      entries_activated: result.count,
    };
  }

  /**
   * Deactivate all entries in the watchlist
   */
  async deactivateWatchlist(id: string, user: AuthenticatedUser, requestId?: string) {
    const existing = await this.prisma.watchlist.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        error_code: 'WATCHLIST_NOT_FOUND',
        message: `Watchlist with ID '${id}' does not exist`,
      });
    }

    if (user.role === 'DEPARTMENT_ADMIN' && user.departmentId !== existing.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only manage watchlists belonging to their assigned department',
      });
    }

    const result = await this.prisma.watchlistEntry.updateMany({
      where: { watchlistId: id, active: true },
      data: { active: false },
    });

    await this.recordAuditLog(
      user.id,
      'WATCHLIST_DEACTIVATE',
      'Watchlist',
      { id, active_entries_before: 'active' },
      { id, deactivated_count: result.count },
      requestId,
    );

    return {
      message: 'Watchlist successfully deactivated',
      id,
      entries_deactivated: result.count,
    };
  }

  /**
   * Add a flagged plate entry to a Watchlist
   */
  async addEntry(watchlistId: string, dto: CreateWatchlistEntryDto, user: AuthenticatedUser, requestId?: string) {
    const watchlist = await this.prisma.watchlist.findUnique({
      where: { id: watchlistId },
    });
    if (!watchlist) {
      throw new NotFoundException({
        error_code: 'WATCHLIST_NOT_FOUND',
        message: `Watchlist with ID '${watchlistId}' does not exist`,
      });
    }

    // RBAC: Department Admins can only add entries to their own department's watchlist
    if (user.role === 'DEPARTMENT_ADMIN' && user.departmentId !== watchlist.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only add entries to watchlists of their assigned department',
      });
    }

    // Plate normalization (e.g. 'gj 01-ab 1234' -> 'GJ01AB1234')
    const plateNormalized = normalizeLicensePlate(dto.plate);
    if (!isValidPlateFormat(plateNormalized)) {
      throw new BadRequestException({
        error_code: 'INVALID_PLATE_FORMAT',
        message: `Invalid vehicle license plate format '${dto.plate}'. Must match standard Indian registration formats (e.g. GJ01AB1234)`,
      });
    }

    // Prevent duplicate active entry on the same watchlist
    const existingActive = await this.prisma.watchlistEntry.findFirst({
      where: {
        watchlistId,
        plateNormalized,
        active: true,
      },
    });
    if (existingActive) {
      throw new ConflictException({
        error_code: 'DUPLICATE_WATCHLIST_ENTRY',
        message: `Plate '${plateNormalized}' is already actively flagged on this watchlist`,
      });
    }

    const expiresAt = dto.expires_at ? new Date(dto.expires_at) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid expires_at timestamp format',
      });
    }

    const entry = await this.prisma.watchlistEntry.create({
      data: {
        watchlistId,
        plateNormalized,
        category: dto.category,
        reason: dto.reason,
        priority: dto.priority || AlertSeverity.HIGH,
        addedBy: user.email || user.id,
        expiresAt,
        active: true,
      },
    });

    // Synchronous audit log
    await this.recordAuditLog(
      user.id,
      'WATCHLIST_ENTRY_CREATE',
      'WatchlistEntry',
      null,
      {
        id: entry.id,
        watchlist_id: watchlistId,
        plate_normalized: entry.plateNormalized,
        category: entry.category,
        priority: entry.priority,
        expires_at: entry.expiresAt,
      },
      requestId,
    );

    return {
      id: entry.id,
      watchlist_id: entry.watchlistId,
      plate_normalized: entry.plateNormalized,
      category: entry.category,
      reason: entry.reason,
      priority: entry.priority,
      added_by: entry.addedBy,
      expires_at: entry.expiresAt,
      active: entry.active,
      created_at: entry.createdAt,
    };
  }

  /**
   * List entries of a specific watchlist
   */
  async listEntries(watchlistId: string, query: WatchlistEntryQueryDto, user: AuthenticatedUser, requestId?: string) {
    const watchlist = await this.prisma.watchlist.findUnique({ where: { id: watchlistId } });
    if (!watchlist) {
      throw new NotFoundException({
        error_code: 'WATCHLIST_NOT_FOUND',
        message: `Watchlist with ID '${watchlistId}' does not exist`,
      });
    }

    const limit = query.limit || 20;
    const where: Prisma.WatchlistEntryWhereInput = { watchlistId };

    if (query.active !== undefined) {
      where.active = query.active;
    }

    if (query.category) {
      where.category = { equals: query.category, mode: 'insensitive' };
    }

    if (query.search) {
      const normSearch = normalizeLicensePlate(query.search);
      where.OR = [
        { plateNormalized: { contains: normSearch || query.search, mode: 'insensitive' } },
        { reason: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.cursor) {
      where.id = { gt: query.cursor };
    }

    const [entries, total] = await Promise.all([
      this.prisma.watchlistEntry.findMany({
        where,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.watchlistEntry.count({ where }),
    ]);

    let nextCursor: string | null = null;
    let data = entries;
    if (entries.length > limit) {
      const nextItem = data.pop();
      nextCursor = nextItem?.id || null;
    }

    return {
      watchlist_id: watchlistId,
      watchlist_name: watchlist.name,
      data: data.map((e) => ({
        id: e.id,
        watchlist_id: e.watchlistId,
        plate_normalized: e.plateNormalized,
        category: e.category,
        reason: e.reason,
        priority: e.priority,
        added_by: e.addedBy,
        expires_at: e.expiresAt,
        active: e.active,
        created_at: e.createdAt,
      })),
      pagination: {
        limit,
        total,
        next_cursor: nextCursor,
      },
    };
  }

  /**
   * Get single watchlist entry detail
   */
  async getEntry(entryId: string, user: AuthenticatedUser, requestId?: string) {
    const entry = await this.prisma.watchlistEntry.findUnique({
      where: { id: entryId },
      include: {
        watchlist: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException({
        error_code: 'WATCHLIST_ENTRY_NOT_FOUND',
        message: `Watchlist entry with ID '${entryId}' does not exist`,
      });
    }

    return {
      id: entry.id,
      watchlist_id: entry.watchlistId,
      watchlist_name: entry.watchlist.name,
      department_id: entry.watchlist.departmentId,
      department_name: entry.watchlist.department.name,
      plate_normalized: entry.plateNormalized,
      category: entry.category,
      reason: entry.reason,
      priority: entry.priority,
      added_by: entry.addedBy,
      expires_at: entry.expiresAt,
      active: entry.active,
      created_at: entry.createdAt,
    };
  }

  /**
   * Update entry details (category, reason, priority, expires_at, active)
   */
  async updateEntry(entryId: string, dto: UpdateWatchlistEntryDto, user: AuthenticatedUser, requestId?: string) {
    const entry = await this.prisma.watchlistEntry.findUnique({
      where: { id: entryId },
      include: { watchlist: true },
    });

    if (!entry) {
      throw new NotFoundException({
        error_code: 'WATCHLIST_ENTRY_NOT_FOUND',
        message: `Watchlist entry with ID '${entryId}' does not exist`,
      });
    }

    if (user.role === 'DEPARTMENT_ADMIN' && user.departmentId !== entry.watchlist.departmentId) {
      throw new ForbiddenException({
        error_code: 'DEPARTMENT_ACCESS_DENIED',
        message: 'Department Admins can only update entries belonging to their assigned department',
      });
    }

    const expiresAt = dto.expires_at ? new Date(dto.expires_at) : undefined;
    if (expiresAt && isNaN(expiresAt.getTime())) {
      throw new BadRequestException({
        error_code: 'BAD_REQUEST',
        message: 'Invalid expires_at timestamp format',
      });
    }

    const updated = await this.prisma.watchlistEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.category && { category: dto.category }),
        ...(dto.reason && { reason: dto.reason }),
        ...(dto.priority && { priority: dto.priority }),
        ...(expiresAt !== undefined && { expiresAt }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    const action = dto.active === false ? 'WATCHLIST_ENTRY_DEACTIVATE' : 'WATCHLIST_ENTRY_UPDATE';
    await this.recordAuditLog(
      user.id,
      action,
      'WatchlistEntry',
      {
        category: entry.category,
        reason: entry.reason,
        priority: entry.priority,
        active: entry.active,
      },
      {
        category: updated.category,
        reason: updated.reason,
        priority: updated.priority,
        active: updated.active,
      },
      requestId,
    );

    return {
      id: updated.id,
      watchlist_id: updated.watchlistId,
      plate_normalized: updated.plateNormalized,
      category: updated.category,
      reason: updated.reason,
      priority: updated.priority,
      added_by: updated.addedBy,
      expires_at: updated.expiresAt,
      active: updated.active,
      created_at: updated.createdAt,
    };
  }

  /**
   * Deactivate single entry (soft-delete per Section 6.2)
   */
  async deactivateEntry(entryId: string, user: AuthenticatedUser, requestId?: string) {
    return this.updateEntry(entryId, { active: false }, user, requestId);
  }

  /**
   * Match normalized plate against active, non-expired watchlist entries
   */
  async findActiveMatchesForPlate(plateNormalized: string) {
    const now = new Date();
    return this.prisma.watchlistEntry.findMany({
      where: {
        plateNormalized,
        active: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      include: {
        watchlist: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /**
   * Synchronous audit record helper
   */
  private async recordAuditLog(
    actorId: string | null,
    action: string,
    resource: string,
    before: any,
    after: any,
    correlationId?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource,
          before: before || null,
          after: after || null,
          correlationId: correlationId && correlationId.length === 36 ? correlationId : null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to record audit log for action: ${action}`, err);
    }
  }
}
