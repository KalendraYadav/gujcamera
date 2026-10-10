// ==============================================================================
// Watchlist Historical Backfill Service (Phase 2)
// NETRAVA Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md Section 6.2 & Section 7.1
// ==============================================================================

import {
  Injectable,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertsGateway } from '../alerts/alerts.gateway';
import { AlertsService } from '../alerts/alerts.service';
import { classifySightingIncidentRelation } from './utils/incident-classifier.util';

export interface BackfillOptions {
  actorId?: string | null;
  requestId?: string;
  lookbackHours?: number;
  referenceTime?: Date;
}

export interface BackfillResult {
  entryId: string;
  plateNormalized: string;
  status:
    | 'COMPLETED'
    | 'SKIPPED_INACTIVE_OR_EXPIRED'
    | 'SKIPPED_DISABLED'
    | 'ENTRY_NOT_FOUND'
    | 'ERROR';
  reason?: string;
  lookbackStart?: Date;
  lookbackEnd?: Date;
  sightingsExamined: number;
  alertsGenerated: number;
  duplicatesSkipped: number;
  alertIds: string[];
  durationMs: number;
  message?: string;
}

@Injectable()
export class WatchlistBackfillService {
  private readonly logger = new Logger(WatchlistBackfillService.name);

  // Configuration options with production-safe defaults
  public readonly defaultLookbackHours: number;
  public readonly maxLookbackHours: number;
  public readonly batchSize: number;
  public readonly maxMatches: number;
  public readonly isEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() @Inject(AlertsGateway) private readonly alertsGateway?: AlertsGateway,
    @Optional() @Inject(AlertsService) private readonly alertsService?: AlertsService,
  ) {
    this.isEnabled =
      this.configService.get<string>('WATCHLIST_BACKFILL_ENABLED', 'true') !== 'false';
    this.defaultLookbackHours = parseInt(
      this.configService.get<string>('WATCHLIST_BACKFILL_LOOKBACK_HOURS', '72'),
      10,
    );
    this.maxLookbackHours = parseInt(
      this.configService.get<string>('WATCHLIST_BACKFILL_MAX_LOOKBACK_HOURS', '720'),
      10,
    );
    this.batchSize = parseInt(
      this.configService.get<string>('WATCHLIST_BACKFILL_BATCH_SIZE', '100'),
      10,
    );
    this.maxMatches = parseInt(
      this.configService.get<string>('WATCHLIST_BACKFILL_MAX_MATCHES', '250'),
      10,
    );
  }

  /**
   * Asynchronously trigger historical backfill without blocking the calling thread.
   * Guarantees HTTP response returns immediately while backfill executes via setImmediate.
   */
  triggerBackfill(entryId: string, options?: BackfillOptions): void {
    if (!this.isEnabled) {
      this.logger.debug(`[Backfill] Backfill disabled via config. Skipping entry '${entryId}'`);
      return;
    }

    setImmediate(async () => {
      try {
        await this.processBackfill(entryId, options);
      } catch (err: any) {
        this.logger.error(
          `[Backfill] Unhandled asynchronous error in backfill for entry '${entryId}': ${err.message}`,
          err.stack,
        );
      }
    });
  }

  /**
   * Asynchronously trigger backfill for all active entries in a watchlist (e.g. upon activation)
   */
  async triggerWatchlistBackfill(watchlistId: string, options?: BackfillOptions): Promise<void> {
    if (!this.isEnabled) return;

    setImmediate(async () => {
      try {
        const entries = await this.prisma.watchlistEntry.findMany({
          where: { watchlistId, active: true },
          select: { id: true },
        });

        this.logger.log(
          `[Backfill] Triggering historical backfill for ${entries.length} active entries in watchlist '${watchlistId}'`,
        );

        for (const entry of entries) {
          await this.processBackfill(entry.id, options);
        }
      } catch (err: any) {
        this.logger.error(
          `[Backfill] Error triggering backfill for watchlist '${watchlistId}': ${err.message}`,
        );
      }
    });
  }

  /**
   * Execute historical backfill with strict idempotency, lookback boundaries, and batching.
   */
  async processBackfill(entryId: string, options?: BackfillOptions): Promise<BackfillResult> {
    const startTime = Date.now();

    if (!this.isEnabled) {
      return {
        entryId,
        plateNormalized: '',
        status: 'SKIPPED_DISABLED',
        reason: 'FEATURE_DISABLED',
        sightingsExamined: 0,
        alertsGenerated: 0,
        duplicatesSkipped: 0,
        alertIds: [],
        durationMs: Date.now() - startTime,
        message: 'Watchlist backfill is disabled via WATCHLIST_BACKFILL_ENABLED=false',
      };
    }

    // 1. Fetch current entry state from database
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
      this.logger.warn(`[Backfill] Watchlist entry '${entryId}' not found. Aborting.`);
      return {
        entryId,
        plateNormalized: '',
        status: 'ENTRY_NOT_FOUND',
        reason: `Watchlist entry with ID '${entryId}' does not exist`,
        sightingsExamined: 0,
        alertsGenerated: 0,
        duplicatesSkipped: 0,
        alertIds: [],
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Rule 13: Enforce current active and expiration status
    const now = new Date();
    if (!entry.active) {
      this.logger.warn(
        `[Backfill] Entry '${entryId}' (${entry.plateNormalized}) is inactive. Aborting historical matching.`,
      );
      return {
        entryId,
        plateNormalized: entry.plateNormalized,
        status: 'SKIPPED_INACTIVE_OR_EXPIRED',
        reason: 'ENTRY_INACTIVE',
        sightingsExamined: 0,
        alertsGenerated: 0,
        duplicatesSkipped: 0,
        alertIds: [],
        durationMs: Date.now() - startTime,
        message: 'Watchlist entry is inactive; historical matching skipped per status policy.',
      };
    }

    if (entry.expiresAt && entry.expiresAt <= now) {
      this.logger.warn(
        `[Backfill] Entry '${entryId}' (${entry.plateNormalized}) expired at ${entry.expiresAt.toISOString()}. Aborting historical matching.`,
      );
      return {
        entryId,
        plateNormalized: entry.plateNormalized,
        status: 'SKIPPED_INACTIVE_OR_EXPIRED',
        reason: 'ENTRY_EXPIRED',
        sightingsExamined: 0,
        alertsGenerated: 0,
        duplicatesSkipped: 0,
        alertIds: [],
        durationMs: Date.now() - startTime,
        message: 'Watchlist entry has expired; historical matching skipped per status policy.',
      };
    }

    // 3. Compute explicitly bounded time range
    const requestedLookback = options?.lookbackHours ?? this.defaultLookbackHours;
    const effectiveLookbackHours = Math.min(
      Math.max(requestedLookback, 1),
      this.maxLookbackHours,
    );

    const referenceTime = options?.referenceTime || entry.createdAt;
    const lookbackEnd = referenceTime;
    const lookbackStart = new Date(
      referenceTime.getTime() - effectiveLookbackHours * 3600 * 1000,
    );

    this.logger.log(
      `[Backfill] Commencing backfill for plate '${entry.plateNormalized}' (Entry: ${entryId}) | Window: ${lookbackStart.toISOString()} -> ${lookbackEnd.toISOString()} (${effectiveLookbackHours}h lookback)`,
    );

    // 4. Bounded Keyset-Batched Sighting Query & Match Processing
    let sightingsExamined = 0;
    let alertsGenerated = 0;
    let duplicatesSkipped = 0;
    const alertIds: string[] = [];
    let lastSeenTs: Date | undefined = undefined;
    let lastSeenId: string | undefined = undefined;

    try {
      while (sightingsExamined < this.maxMatches) {
        // Re-verify entry status at batch boundary in case of concurrent deactivation
        if (sightingsExamined > 0) {
          const freshStatus = await this.prisma.watchlistEntry.findUnique({
            where: { id: entryId },
            select: { active: true, expiresAt: true },
          });
          if (
            !freshStatus ||
            !freshStatus.active ||
            (freshStatus.expiresAt && freshStatus.expiresAt <= new Date())
          ) {
            this.logger.warn(
              `[Backfill] Entry '${entryId}' deactivated or expired during batch execution. Stopping backfill early.`,
            );
            break;
          }
        }

        const take = Math.min(this.batchSize, this.maxMatches - sightingsExamined);
        const whereClause: any = {
          plateNormalized: entry.plateNormalized,
          ts: {
            gte: lookbackStart,
            lte: lookbackEnd,
          },
        };

        if (lastSeenTs && lastSeenId) {
          whereClause.OR = [
            { ts: { lt: lastSeenTs } },
            { ts: lastSeenTs, id: { lt: lastSeenId } },
          ];
        }

        const batch = await this.prisma.vehicleSighting.findMany({
          where: whereClause,
          take,
          orderBy: [{ ts: 'desc' }, { id: 'desc' }],
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

        if (batch.length === 0) {
          break;
        }

        sightingsExamined += batch.length;
        const lastItem = batch[batch.length - 1];
        lastSeenTs = lastItem.ts;
        lastSeenId = lastItem.id;

        for (const sighting of batch) {
          // Rule 9: Idempotency check. Do NOT duplicate alert for exact (sourceSightingId, watchlistEntryId)
          const existingAlert = await this.prisma.alert.findFirst({
            where: {
              sourceSightingId: sighting.id,
              watchlistEntryId: entry.id,
            },
            select: { id: true },
          });

          if (existingAlert) {
            duplicatesSkipped++;
            continue;
          }

          // Create historical alert preserving original observation timestamp
          try {
            const alert = await this.prisma.alert.create({
              data: {
                sourceSightingId: sighting.id,
                watchlistEntryId: entry.id,
                severity: entry.priority,
                status: AlertStatus.NEW,
                ts: sighting.ts, // Preserves original sighting timestamp
              },
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

            alertsGenerated++;
            alertIds.push(alert.id);

            const incidentClassification = classifySightingIncidentRelation(
              sighting.ts,
              entry.incidentStart,
              entry.incidentEnd,
            );
            const incidentTimeRelevance =
              incidentClassification === 'INCIDENT_TIME_UNKNOWN'
                ? 'UNESTABLISHED_NO_INCIDENT_TIMESTAMP'
                : incidentClassification;

            // Record synchronous audit log for historical alert creation
            await this.recordAuditLog(
              options?.actorId || null,
              'ALERT_CREATE_HISTORICAL',
              'Alert',
              null,
              {
                alert_id: alert.id,
                plate_normalized: sighting.plateNormalized,
                source_sighting_id: sighting.id,
                watchlist_entry_id: entry.id,
                severity: alert.severity,
                camera_id: sighting.cameraId,
                match_type: 'HISTORICAL_BACKFILL',
                incident_classification: incidentClassification,
                incident_time_relevance: incidentTimeRelevance,
                incident_start: entry.incidentStart ? entry.incidentStart.toISOString() : null,
                incident_end: entry.incidentEnd ? entry.incidentEnd.toISOString() : null,
                sighting_ts: sighting.ts,
                entry_created_at: entry.createdAt,
                processed_at: alert.createdAt,
              },
              options?.requestId,
            );

            // Real-time WebSocket broadcast with explicit match_type
            if (this.alertsGateway) {
              const formatted = this.alertsService
                ? this.alertsService.formatAlertResponse(alert)
                : this.formatAlertFallback(alert);
              this.alertsGateway.broadcastAlert(formatted);
            }
          } catch (createErr: any) {
            if (createErr.code === 'P2002') {
              duplicatesSkipped++;
              continue;
            }
            this.logger.error(
              `[Backfill] Failed to create alert for historical sighting '${sighting.id}': ${createErr.message}`,
            );
          }
        }
      }

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `[Backfill] Completed backfill for entry '${entryId}' (${entry.plateNormalized}): Examined=${sightingsExamined}, Generated=${alertsGenerated}, DuplicatesSkipped=${duplicatesSkipped} in ${durationMs}ms`,
      );

      return {
        entryId,
        plateNormalized: entry.plateNormalized,
        status: 'COMPLETED',
        lookbackStart,
        lookbackEnd,
        sightingsExamined,
        alertsGenerated,
        duplicatesSkipped,
        alertIds,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `[Backfill] Error executing historical backfill for entry '${entryId}': ${err.message}`,
        err.stack,
      );
      return {
        entryId,
        plateNormalized: entry.plateNormalized,
        status: 'ERROR',
        reason: err.message,
        lookbackStart,
        lookbackEnd,
        sightingsExamined,
        alertsGenerated,
        duplicatesSkipped,
        alertIds,
        durationMs,
      };
    }
  }

  /**
   * Fallback formatting when AlertsService is not injected
   */
  private formatAlertFallback(alert: any) {
    const isHistorical = alert.sighting && alert.watchlistEntry
      ? new Date(alert.sighting.ts).getTime() < new Date(alert.watchlistEntry.createdAt).getTime()
      : false;

    return {
      id: alert.id,
      severity: alert.severity,
      status: alert.status,
      timestamp: alert.ts,
      match_type: isHistorical ? 'HISTORICAL_BACKFILL' : 'LIVE',
      is_historical: isHistorical,
      processed_at: alert.createdAt,
      entry_created_at: alert.watchlistEntry ? alert.watchlistEntry.createdAt : null,
      incident_time_relevance: isHistorical
        ? 'UNESTABLISHED_NO_INCIDENT_TIMESTAMP'
        : 'REAL_TIME_MONITORING',
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
                  location: alert.sighting.camera.location,
                  department: alert.sighting.camera.department,
                }
              : null,
            vehicle: alert.sighting.vehicle,
          }
        : null,
      watchlist_match: alert.watchlistEntry,
      acknowledged_by: alert.acknowledgedBy,
      resolved_by: alert.resolvedBy,
      created_at: alert.createdAt,
      updated_at: alert.updatedAt,
    };
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
          correlationId:
            correlationId && correlationId.length === 36 ? correlationId : null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to record audit log for action: ${action}`, err);
    }
  }
}
