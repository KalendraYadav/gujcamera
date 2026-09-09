import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma, AlertStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AlertQueryDto } from './dto/alert-query.dto';
import { AlertTransitionDto } from './dto/alert-transition.dto';
import { normalizeLicensePlate } from '../vehicles/utils/plate-normalizer';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Process a vehicle sighting against active watchlist entries and generate alerts
   * Core PoC match: Vehicle.plate_normalized = WatchlistEntry.plate_normalized
   * Enforces deduplication on (source_sighting_id, watchlist_entry_id)
   */
  async processSightingMatch(sightingId: string, correlationId?: string) {
    const sighting = await this.prisma.vehicleSighting.findUnique({
      where: { id: sightingId },
      include: {
        camera: {
          include: {
            location: true,
            department: { select: { id: true, name: true } },
          },
        },
        vehicle: true,
      },
    });

    if (!sighting) {
      throw new NotFoundException({
        error_code: 'SIGHTING_NOT_FOUND',
        message: `Vehicle sighting with ID '${sightingId}' does not exist`,
      });
    }

    const now = new Date();
    // Query active, non-expired watchlist entries for this normalized plate
    const activeEntries = await this.prisma.watchlistEntry.findMany({
      where: {
        plateNormalized: sighting.plateNormalized,
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

    if (activeEntries.length === 0) {
      return {
        sighting_id: sighting.id,
        plate_normalized: sighting.plateNormalized,
        matched: false,
        alerts_generated: 0,
        alerts: [],
      };
    }

    const generatedAlerts = [];

    for (const entry of activeEntries) {
      // Deduplication check: Do not duplicate alert for the exact same sighting and watchlist entry
      const existingAlert = await this.prisma.alert.findFirst({
        where: {
          sourceSightingId: sighting.id,
          watchlistEntryId: entry.id,
        },
        include: {
          sighting: {
            include: {
              camera: { include: { location: true, department: { select: { id: true, name: true } } } },
              vehicle: true,
            },
          },
          watchlistEntry: {
            include: {
              watchlist: { include: { department: { select: { id: true, name: true } } } },
            },
          },
          acknowledgedBy: { select: { id: true, email: true } },
          resolvedBy: { select: { id: true, email: true } },
        },
      });

      if (existingAlert) {
        generatedAlerts.push(this.formatAlertResponse(existingAlert));
        continue;
      }

      // Create new Alert in canonical 'NEW' status
      const alert = await this.prisma.alert.create({
        data: {
          sourceSightingId: sighting.id,
          watchlistEntryId: entry.id,
          severity: entry.priority,
          status: AlertStatus.NEW,
          ts: sighting.ts,
        },
        include: {
          sighting: {
            include: {
              camera: { include: { location: true, department: { select: { id: true, name: true } } } },
              vehicle: true,
            },
          },
          watchlistEntry: {
            include: {
              watchlist: { include: { department: { select: { id: true, name: true } } } },
            },
          },
          acknowledgedBy: { select: { id: true, email: true } },
          resolvedBy: { select: { id: true, email: true } },
        },
      });

      // Synchronous audit record for alert creation
      await this.recordAuditLog(
        null, // System actor for automated alert creation
        'ALERT_CREATE',
        null,
        {
          alert_id: alert.id,
          plate_normalized: sighting.plateNormalized,
          source_sighting_id: sighting.id,
          watchlist_entry_id: entry.id,
          severity: alert.severity,
          camera_id: sighting.cameraId,
        },
        correlationId,
      );

      generatedAlerts.push(this.formatAlertResponse(alert));
    }

    return {
      sighting_id: sighting.id,
      plate_normalized: sighting.plateNormalized,
      matched: true,
      alerts_generated: generatedAlerts.length,
      alerts: generatedAlerts,
    };
  }

  /**
   * List and filter alerts with pagination and indexed ordering
   */
  async listAlerts(query: AlertQueryDto, user: AuthenticatedUser, requestId?: string) {
    const limit = query.limit || 20;
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const where: Prisma.AlertWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.watchlist_id) {
      where.watchlistEntry = { watchlistId: query.watchlist_id };
    }

    if (query.plate) {
      const normPlate = normalizeLicensePlate(query.plate);
      where.sighting = {
        ...(where.sighting as any),
        plateNormalized: { contains: normPlate, mode: 'insensitive' },
      };
    }

    if (query.camera_id) {
      where.sighting = {
        ...(where.sighting as any),
        cameraId: query.camera_id,
      };
    }

    if (query.department_id) {
      where.sighting = {
        ...(where.sighting as any),
        camera: { departmentId: query.department_id },
      };
    }

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
      throw new BadRequestException({ error_code: 'BAD_REQUEST', message: 'Invalid from timestamp format' });
    }
    if (toDate && isNaN(toDate.getTime())) {
      throw new BadRequestException({ error_code: 'BAD_REQUEST', message: 'Invalid to timestamp format' });
    }

    if (fromDate || toDate) {
      where.ts = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
    }

    if (query.cursor) {
      where.id = { gt: query.cursor };
    }

    const [alerts, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        take: limit,
        skip: query.cursor ? undefined : skip,
        orderBy: [{ status: 'asc' }, { ts: 'desc' }],
        include: {
          sighting: {
            include: {
              camera: {
                include: {
                  location: true,
                  department: { select: { id: true, name: true } },
                },
              },
              vehicle: true,
            },
          },
          watchlistEntry: {
            include: {
              watchlist: {
                include: {
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
          acknowledgedBy: { select: { id: true, email: true } },
          resolvedBy: { select: { id: true, email: true } },
        },
      }),
      this.prisma.alert.count({ where }),
    ]);

    return {
      data: alerts.map((a) => this.formatAlertResponse(a)),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Deep-dive single alert details with full observation evidence
   */
  async getAlert(id: string, user: AuthenticatedUser, requestId?: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        sighting: {
          include: {
            camera: {
              include: {
                location: true,
                department: { select: { id: true, name: true } },
              },
            },
            vehicle: true,
          },
        },
        watchlistEntry: {
          include: {
            watchlist: {
              include: {
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
        acknowledgedBy: { select: { id: true, email: true } },
        resolvedBy: { select: { id: true, email: true } },
      },
    });

    if (!alert) {
      throw new NotFoundException({
        error_code: 'ALERT_NOT_FOUND',
        message: `Alert with ID '${id}' does not exist`,
      });
    }

    return this.formatAlertResponse(alert);
  }

  /**
   * Transition alert status according to the canonical state machine:
   * NEW -> ACKNOWLEDGED (Operator, Super Admin)
   * NEW -> DISMISSED (Operator, Super Admin)
   * ACKNOWLEDGED -> INVESTIGATING (Investigator, Super Admin)
   * ACKNOWLEDGED -> DISMISSED (Investigator, Super Admin)
   * INVESTIGATING -> RESOLVED (Investigator, Super Admin)
   * INVESTIGATING -> DISMISSED (Investigator, Super Admin)
   */
  async transitionAlertStatus(id: string, dto: AlertTransitionDto, user: AuthenticatedUser, requestId?: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        sighting: {
          include: {
            camera: {
              include: {
                location: true,
                department: { select: { id: true, name: true } },
              },
            },
            vehicle: true,
          },
        },
        watchlistEntry: {
          include: {
            watchlist: {
              include: {
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException({
        error_code: 'ALERT_NOT_FOUND',
        message: `Alert with ID '${id}' does not exist`,
      });
    }

    const currentStatus = alert.status;
    const targetStatus = dto.status;

    if (currentStatus === targetStatus) {
      throw new ConflictException({
        error_code: 'INVALID_STATE_TRANSITION',
        message: `Alert is already in status '${currentStatus}'`,
      });
    }

    // 1. Terminal state check: Once in RESOLVED or DISMISSED, no transitions are permitted
    if (currentStatus === AlertStatus.RESOLVED || currentStatus === AlertStatus.DISMISSED) {
      throw new ConflictException({
        error_code: 'INVALID_STATE_TRANSITION',
        message: `Alert in terminal status '${currentStatus}' cannot be transitioned to '${targetStatus}'`,
      });
    }

    // 2. Validate RBAC role authorization for this target transition
    this.validateRoleForTransition(currentStatus, targetStatus, user.role);

    // 3. Validate state machine topology
    this.validateLifecycleTransition(currentStatus, targetStatus);

    // Build update payload
    const updateData: Prisma.AlertUpdateInput = {
      status: targetStatus,
    };

    if (targetStatus === AlertStatus.ACKNOWLEDGED) {
      updateData.acknowledgedBy = { connect: { id: user.id } };
    } else if (targetStatus === AlertStatus.RESOLVED) {
      updateData.resolvedBy = { connect: { id: user.id } };
    } else if (targetStatus === AlertStatus.DISMISSED) {
      updateData.dismissalReason = dto.reason || 'Alert dismissed by operator/investigator';
    }

    const updated = await this.prisma.alert.update({
      where: { id },
      data: updateData,
      include: {
        sighting: {
          include: {
            camera: {
              include: {
                location: true,
                department: { select: { id: true, name: true } },
              },
            },
            vehicle: true,
          },
        },
        watchlistEntry: {
          include: {
            watchlist: {
              include: {
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
        acknowledgedBy: { select: { id: true, email: true } },
        resolvedBy: { select: { id: true, email: true } },
      },
    });

    // Determine audit action name
    let auditAction = 'ALERT_STATUS_TRANSITION';
    if (targetStatus === AlertStatus.ACKNOWLEDGED) auditAction = 'ALERT_ACKNOWLEDGE';
    else if (targetStatus === AlertStatus.INVESTIGATING) auditAction = 'ALERT_INVESTIGATE';
    else if (targetStatus === AlertStatus.RESOLVED) auditAction = 'ALERT_RESOLVE';
    else if (targetStatus === AlertStatus.DISMISSED) auditAction = 'ALERT_DISMISS';

    await this.recordAuditLog(
      user.id,
      auditAction,
      {
        alert_id: id,
        previous_status: currentStatus,
      },
      {
        alert_id: id,
        new_status: targetStatus,
        reason: dto.reason || null,
      },
      requestId,
    );

    return this.formatAlertResponse(updated);
  }

  /**
   * State Machine Validator
   */
  private validateLifecycleTransition(current: AlertStatus, target: AlertStatus) {
    if (current === AlertStatus.RESOLVED || current === AlertStatus.DISMISSED) {
      throw new ConflictException({
        error_code: 'INVALID_STATE_TRANSITION',
        message: `Alert in terminal status '${current}' cannot be transitioned to '${target}'`,
      });
    }

    if (current === AlertStatus.NEW) {
      if (target !== AlertStatus.ACKNOWLEDGED && target !== AlertStatus.DISMISSED) {
        throw new ConflictException({
          error_code: 'INVALID_STATE_TRANSITION',
          message: `Cannot transition alert from '${current}' to '${target}'. Allowed transitions from NEW: ACKNOWLEDGED, DISMISSED`,
        });
      }
      return;
    }

    if (current === AlertStatus.ACKNOWLEDGED) {
      if (target !== AlertStatus.INVESTIGATING && target !== AlertStatus.DISMISSED) {
        throw new ConflictException({
          error_code: 'INVALID_STATE_TRANSITION',
          message: `Cannot transition alert from '${current}' to '${target}'. Allowed transitions from ACKNOWLEDGED: INVESTIGATING, DISMISSED`,
        });
      }
      return;
    }

    if (current === AlertStatus.INVESTIGATING) {
      if (target !== AlertStatus.RESOLVED && target !== AlertStatus.DISMISSED) {
        throw new ConflictException({
          error_code: 'INVALID_STATE_TRANSITION',
          message: `Cannot transition alert from '${current}' to '${target}'. Allowed transitions from INVESTIGATING: RESOLVED, DISMISSED`,
        });
      }
      return;
    }

    throw new ConflictException({
      error_code: 'INVALID_STATE_TRANSITION',
      message: `Invalid state transition from '${current}' to '${target}'`,
    });
  }

  /**
   * RBAC State Machine Role Validator
   */
  private validateRoleForTransition(current: AlertStatus, target: AlertStatus, role: string) {
    if (role === 'SUPER_ADMIN') {
      return; // Super Admin has administrative override
    }

    if (current === AlertStatus.NEW && target === AlertStatus.ACKNOWLEDGED) {
      if (role !== 'OPERATOR') {
        throw new ForbiddenException({
          error_code: 'FORBIDDEN_RESOURCE',
          message: 'Only OPERATOR or SUPER_ADMIN can acknowledge new alerts',
        });
      }
      return;
    }

    if (current === AlertStatus.NEW && target === AlertStatus.DISMISSED) {
      if (role !== 'OPERATOR') {
        throw new ForbiddenException({
          error_code: 'FORBIDDEN_RESOURCE',
          message: 'Only OPERATOR or SUPER_ADMIN can dismiss new alerts',
        });
      }
      return;
    }

    if (target === AlertStatus.INVESTIGATING) {
      if (role !== 'INVESTIGATOR') {
        throw new ForbiddenException({
          error_code: 'FORBIDDEN_RESOURCE',
          message: 'Only INVESTIGATOR or SUPER_ADMIN can start alert investigations',
        });
      }
      return;
    }

    if (target === AlertStatus.RESOLVED) {
      if (role !== 'INVESTIGATOR') {
        throw new ForbiddenException({
          error_code: 'FORBIDDEN_RESOURCE',
          message: 'Only INVESTIGATOR or SUPER_ADMIN can resolve alerts',
        });
      }
      return;
    }

    if ((current === AlertStatus.ACKNOWLEDGED || current === AlertStatus.INVESTIGATING) && target === AlertStatus.DISMISSED) {
      if (role !== 'INVESTIGATOR') {
        throw new ForbiddenException({
          error_code: 'FORBIDDEN_RESOURCE',
          message: 'Only INVESTIGATOR or SUPER_ADMIN can dismiss active investigations',
        });
      }
      return;
    }

    throw new ForbiddenException({
      error_code: 'FORBIDDEN_RESOURCE',
      message: `Role '${role}' is not authorized to transition alert from '${current}' to '${target}'`,
    });
  }

  /**
   * Format alert response, ensuring clean relational structure and excluding sensitive credentials
   */
  private formatAlertResponse(alert: any) {
    return {
      id: alert.id,
      severity: alert.severity,
      status: alert.status,
      timestamp: alert.ts,
      source_sighting: alert.sighting
        ? {
            id: alert.sighting.id,
            timestamp: alert.sighting.ts,
            confidence: Number(alert.sighting.confidence),
            consensus_frames: alert.sighting.consensusOf,
            frame_ref: alert.sighting.frameRef,
            camera: alert.sighting.camera
              ? {
                  id: alert.sighting.camera.id,
                  name: alert.sighting.camera.name,
                  coordinates: {
                    lat: Number(alert.sighting.camera.lat),
                    long: Number(alert.sighting.camera.long),
                  },
                  location: alert.sighting.camera.location
                    ? {
                        address: alert.sighting.camera.location.address,
                        zone: alert.sighting.camera.location.zone,
                        district: alert.sighting.camera.location.district,
                      }
                    : null,
                  department: alert.sighting.camera.department
                    ? {
                        id: alert.sighting.camera.department.id,
                        name: alert.sighting.camera.department.name,
                      }
                    : null,
                }
              : null,
            vehicle: alert.sighting.vehicle
              ? {
                  plate_normalized: alert.sighting.vehicle.plateNormalized,
                  first_seen: alert.sighting.vehicle.firstSeen,
                  last_seen: alert.sighting.vehicle.lastSeen,
                  attributes: alert.sighting.vehicle.attributes,
                }
              : null,
          }
        : null,
      watchlist_match: alert.watchlistEntry
        ? {
            entry_id: alert.watchlistEntry.id,
            plate_normalized: alert.watchlistEntry.plateNormalized,
            category: alert.watchlistEntry.category,
            reason: alert.watchlistEntry.reason,
            priority: alert.watchlistEntry.priority,
            added_by: alert.watchlistEntry.addedBy,
            watchlist: alert.watchlistEntry.watchlist
              ? {
                  id: alert.watchlistEntry.watchlist.id,
                  name: alert.watchlistEntry.watchlist.name,
                  department: alert.watchlistEntry.watchlist.department
                    ? {
                        id: alert.watchlistEntry.watchlist.department.id,
                        name: alert.watchlistEntry.watchlist.department.name,
                      }
                    : null,
                }
              : null,
          }
        : null,
      acknowledged_by: alert.acknowledgedBy
        ? { id: alert.acknowledgedBy.id, email: alert.acknowledgedBy.email }
        : null,
      resolved_by: alert.resolvedBy
        ? { id: alert.resolvedBy.id, email: alert.resolvedBy.email }
        : null,
      dismissal_reason: alert.dismissalReason || null,
      created_at: alert.createdAt,
      updated_at: alert.updatedAt,
      disclaimer:
        'Watchlist plate match does not confirm human identity or suspect guilt; corroborating physical evidence and investigator verification required.',
    };
  }

  /**
   * Synchronous audit record helper
   */
  private async recordAuditLog(
    actorId: string | null,
    action: string,
    before: any,
    after: any,
    correlationId?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource: 'Alert',
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
