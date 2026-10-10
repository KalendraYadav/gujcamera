// ==============================================================================
// Dashboard & Operational Command Center Service
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 6, 8, 14.2)
//                  Phase 9 Operational Command Center Specification
//
// Provides high-performance, single-query aggregation for the Operational
// Command Center. Avoids N+1 requests by compiling system health, camera telemetry,
// active alert priorities, watchlist matches, recent CCTV sightings, jurisdiction
// distributions, and recent investigation audit events into a single payload.
// ==============================================================================

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisStreamClient } from '../../common/events/redis/redis-stream.client';
import { SightingEventConsumer } from '../../common/events/consumers/sighting-event.consumer';
import { MediaGatewayService } from '../cameras/media-gateway.service';
import { CamerasService } from '../cameras/cameras.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { OperationalStatus, AlertSeverity, AlertStatus } from '@prisma/client';

export interface SystemHealthState {
  database: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  stream_gateway: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  ai_pipeline: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  event_pipeline: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  camera_network: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  postgis: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
}

export interface CameraOverviewState {
  total: number;
  online: number;
  degraded: number;
  offline: number;
  error: number;
  configured_prototype_sources: number;
}

export interface AlertSummaryItem {
  id: string;
  severity: string;
  status: string;
  category: string;
  reason: string;
  plate: string;
  camera_name: string;
  city: string;
  timestamp: string;
}

export interface WatchlistSummaryItem {
  plate: string;
  category: string;
  priority: string;
  camera_name: string;
  city: string;
  timestamp: string;
  alert_id?: string;
}

export interface RecentSightingItem {
  id: string;
  plate: string;
  camera_name: string;
  city: string;
  confidence: number;
  consensus_frames: number;
  has_evidence: boolean;
  timestamp: string;
  is_watchlisted: boolean;
}

export interface JurisdictionSummaryItem {
  id: string;
  name: string;
  code: string;
  total_cameras: number;
  online_cameras: number;
  active_alerts: number;
  recent_sightings: number;
}

export interface InvestigationAuditEvent {
  id: string;
  timestamp: string;
  actor_email: string;
  actor_role: string;
  action: string;
  resource: string;
  target?: string;
}

export interface OperationalSummaryResponse {
  timestamp: string;
  system: SystemHealthState;
  cameras: CameraOverviewState;
  alerts: {
    total_active: number;
    critical: number;
    high: number;
    medium: number;
    recent: AlertSummaryItem[];
  };
  watchlists: {
    total_watchlists: number;
    active_entries: number;
    recent_matches: WatchlistSummaryItem[];
  };
  sightings: {
    recent_observations: RecentSightingItem[];
  };
  jurisdictions: JurisdictionSummaryItem[];
  investigations: {
    recent_events: InvestigationAuditEvent[];
  };
  disclaimer: string;
}

const CANONICAL_JURISDICTIONS = [
  { id: 'ahmedabad', name: 'Ahmedabad', code: 'AHM' },
  { id: 'surat', name: 'Surat', code: 'SUR' },
  { id: 'vadodara', name: 'Vadodara', code: 'VAD' },
  { id: 'rajkot', name: 'Rajkot', code: 'RJK' },
  { id: 'gandhinagar', name: 'Gandhinagar', code: 'GND' },
  { id: 'expressway', name: 'NE-1 Expressway Corridor', code: 'EXP' },
];

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(RedisStreamClient) private readonly redisClient?: RedisStreamClient,
    @Optional() @Inject(SightingEventConsumer) private readonly sightingConsumer?: SightingEventConsumer,
    @Optional() @Inject(MediaGatewayService) private readonly mediaGatewayService?: MediaGatewayService,
    @Optional() @Inject(CamerasService) private readonly camerasService?: CamerasService,
  ) {}

  /**
   * Aggregate operational intelligence summary across all modules
   */
  async getOperationalSummary(user: AuthenticatedUser): Promise<OperationalSummaryResponse> {
    const timestamp = new Date().toISOString();

    // 1. Parallel Subsystem Checks & Aggregations
    const [
      dbHealthRes,
      redisHealthyRes,
      mediaGatewayRes,
      cameraHealthRes,
      camerasWithLocRes,
      activeAlertsCountRes,
      criticalAlertsCountRes,
      highAlertsCountRes,
      mediumAlertsCountRes,
      recentAlertsRes,
      watchlistsCountRes,
      activeEntriesCountRes,
      recentSightingsRes,
      recentAuditLogsRes,
    ] = await Promise.allSettled([
      // Database health
      this.prisma.checkHealth(),
      // Redis health
      this.redisClient ? this.redisClient.isHealthy() : Promise.resolve(false),
      // MediaMTX Gateway health
      this.mediaGatewayService ? this.mediaGatewayService.checkHealth(1500) : Promise.resolve({ isHealthy: false }),
      // Camera health counts
      this.camerasService
        ? this.camerasService.getCameraHealthSummary()
        : Promise.resolve({ total_cameras: 0, online: 0, degraded: 0, offline: 0, error: 0 }),
      // All cameras with location for jurisdiction mapping
      this.prisma.camera.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          operationalStatus: true,
          location: { select: { district: true, address: true } },
          _count: {
            select: {
              sightings: true,
            },
          },
        },
      }),
      // Active Alerts Total
      this.prisma.alert.count({
        where: { status: { in: [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.INVESTIGATING] } },
      }),
      // Critical Alerts
      this.prisma.alert.count({
        where: {
          status: { in: [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.INVESTIGATING] },
          severity: AlertSeverity.CRITICAL,
        },
      }),
      // High Alerts
      this.prisma.alert.count({
        where: {
          status: { in: [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.INVESTIGATING] },
          severity: AlertSeverity.HIGH,
        },
      }),
      // Medium Alerts
      this.prisma.alert.count({
        where: {
          status: { in: [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.INVESTIGATING] },
          severity: AlertSeverity.MEDIUM,
        },
      }),
      // Recent Alerts (Top 6)
      this.prisma.alert.findMany({
        take: 6,
        orderBy: { ts: 'desc' },
        include: {
          sighting: {
            include: {
              camera: {
                include: { location: true },
              },
            },
          },
          watchlistEntry: true,
        },
      }),
      // Watchlists total
      this.prisma.watchlist.count(),
      // Active Watchlist entries
      this.prisma.watchlistEntry.count({ where: { active: true } }),
      // Recent CCTV Sightings (Top 8)
      this.prisma.vehicleSighting.findMany({
        take: 8,
        orderBy: { ts: 'desc' },
        include: {
          camera: {
            include: { location: true },
          },
          alerts: {
            select: { id: true },
          },
        },
      }),
      // Recent Audit Logs (Top 6)
      this.prisma.auditLog.findMany({
        take: 6,
        orderBy: { ts: 'desc' },
        include: {
          actor: {
            select: {
              email: true,
              role: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // 2. Resolve System Health
    const dbHealthy = dbHealthRes.status === 'fulfilled' && dbHealthRes.value.isHealthy;
    const redisHealthy = redisHealthyRes.status === 'fulfilled' && redisHealthyRes.value;
    const gatewayHealthy = mediaGatewayRes.status === 'fulfilled' && mediaGatewayRes.value.isHealthy;

    let aiPipelineStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' = 'HEALTHY';
    if (!redisHealthy) {
      aiPipelineStatus = 'DEGRADED';
    } else if (this.sightingConsumer && this.sightingConsumer.totalProcessingErrors > 0) {
      aiPipelineStatus = 'DEGRADED';
    } else if (this.redisClient && typeof this.redisClient.get === 'function') {
      try {
        const telemetryRaw = await this.redisClient.get('gujcamera:telemetry:ai-worker');
        if (!telemetryRaw) {
          aiPipelineStatus = 'UNAVAILABLE';
        } else {
          const parsed = JSON.parse(telemetryRaw);
          const nowSec = Date.now() / 1000;
          const isFresh = nowSec - (parsed.timestamp || 0) < 30;
          const isProcessingStalled = Boolean(
            parsed.last_processing_timestamp &&
            nowSec - parsed.last_processing_timestamp > 30 &&
            parsed.streams?.total > 0,
          );
          if (!isFresh || parsed.status === 'STOPPED') {
            aiPipelineStatus = 'UNAVAILABLE';
          } else if (
            parsed.status === 'DEGRADED' ||
            isProcessingStalled ||
            (parsed.events?.buffer_drops && parsed.events.buffer_drops > 0) ||
            (parsed.inference?.p95_latency_ms && parsed.inference.p95_latency_ms > 350)
          ) {
            aiPipelineStatus = 'DEGRADED';
          } else {
            aiPipelineStatus = 'HEALTHY';
          }
        }
      } catch {
        aiPipelineStatus = 'DEGRADED';
      }
    }

    const camSummary = cameraHealthRes.status === 'fulfilled' ? cameraHealthRes.value : null;
    const totalCameras = camSummary?.total_cameras || 0;
    const onlineCameras = camSummary?.online || 0;
    const degradedCameras = camSummary?.degraded || 0;
    const offlineCameras = camSummary?.offline || 0;
    const errorCameras = camSummary?.error || 0;

    let cameraNetworkStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = 'ONLINE';
    if (totalCameras === 0 || onlineCameras === 0) {
      cameraNetworkStatus = 'OFFLINE';
    } else if (degradedCameras > 0 || offlineCameras > 0 || errorCameras > 0) {
      cameraNetworkStatus = 'DEGRADED';
    }

    const system: SystemHealthState = {
      database: dbHealthy ? 'HEALTHY' : 'UNAVAILABLE',
      postgis: dbHealthy ? 'HEALTHY' : 'UNAVAILABLE',
      stream_gateway: gatewayHealthy ? 'HEALTHY' : 'DEGRADED',
      ai_pipeline: aiPipelineStatus,
      event_pipeline: redisHealthy ? 'HEALTHY' : 'DEGRADED',
      camera_network: cameraNetworkStatus,
    };

    const cameras: CameraOverviewState = {
      total: totalCameras,
      online: onlineCameras,
      degraded: degradedCameras,
      offline: offlineCameras,
      error: errorCameras,
      configured_prototype_sources: totalCameras,
    };

    // 4. Resolve Active Alerts
    const totalActiveAlerts = activeAlertsCountRes.status === 'fulfilled' ? activeAlertsCountRes.value : 0;
    const criticalAlerts = criticalAlertsCountRes.status === 'fulfilled' ? criticalAlertsCountRes.value : 0;
    const highAlerts = highAlertsCountRes.status === 'fulfilled' ? highAlertsCountRes.value : 0;
    const mediumAlerts = mediumAlertsCountRes.status === 'fulfilled' ? mediumAlertsCountRes.value : 0;

    const rawAlerts = recentAlertsRes.status === 'fulfilled' ? recentAlertsRes.value : [];
    const recentAlerts: AlertSummaryItem[] = rawAlerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      status: a.status,
      category: a.watchlistEntry?.category || 'SIGHTING_FLAG',
      reason: a.watchlistEntry?.reason || 'Flagged CCTV observation',
      plate: a.watchlistEntry?.plateNormalized || a.sighting?.plateNormalized || 'UNKNOWN',
      camera_name: a.sighting?.camera?.name || 'SURVEILLANCE CAMERA',
      city: a.sighting?.camera?.location?.district || 'Gujarat',
      timestamp: a.ts.toISOString(),
    }));

    // 5. Resolve Watchlist Matches
    const totalWatchlists = watchlistsCountRes.status === 'fulfilled' ? watchlistsCountRes.value : 0;
    const activeEntries = activeEntriesCountRes.status === 'fulfilled' ? activeEntriesCountRes.value : 0;

    const recentMatches: WatchlistSummaryItem[] = rawAlerts
      .filter((a) => a.watchlistEntry)
      .slice(0, 5)
      .map((a) => ({
        plate: a.watchlistEntry!.plateNormalized,
        category: a.watchlistEntry!.category,
        priority: a.watchlistEntry!.priority,
        camera_name: a.sighting?.camera?.name || 'SURVEILLANCE CAMERA',
        city: a.sighting?.camera?.location?.district || 'Gujarat',
        timestamp: a.ts.toISOString(),
        alert_id: a.id,
      }));

    // 6. Resolve Recent Vehicle Observations (CCTV Sightings)
    const rawSightings = recentSightingsRes.status === 'fulfilled' ? recentSightingsRes.value : [];
    const recentSightings: RecentSightingItem[] = rawSightings.map((s) => ({
      id: s.id,
      plate: s.plateNormalized,
      camera_name: s.camera?.name || 'SURVEILLANCE CAMERA',
      city: s.camera?.location?.district || 'Gujarat',
      confidence: Number(s.confidence),
      consensus_frames: s.consensusOf,
      has_evidence: Boolean(s.frameRef),
      timestamp: s.ts.toISOString(),
      is_watchlisted: Array.isArray(s.alerts) && s.alerts.length > 0,
    }));

    // 7. Resolve Jurisdiction Activity
    const allCameras = camerasWithLocRes.status === 'fulfilled' ? camerasWithLocRes.value : [];
    const cameraCityMap = new Map<string, string>(); // cameraId -> jurisdiction id

    // Dynamically discover any registered districts from camera records beyond canonical fixtures
    const canonicalNames = new Set(CANONICAL_JURISDICTIONS.map((j) => j.name.toUpperCase()));
    const discoveredDistricts = new Set<string>();
    for (const c of allCameras) {
      const dist = c.location?.district?.trim();
      const nameUpper = (c.name || '').toUpperCase();
      const addrUpper = (c.location?.address || '').toUpperCase();
      const isExpressway = nameUpper.includes('EXPRESSWAY') || addrUpper.includes('EXPRESSWAY') || nameUpper.includes('CORRIDOR');
      if (dist && !isExpressway && !canonicalNames.has(dist.toUpperCase())) {
        discoveredDistricts.add(dist);
      }
    }

    const allJurisdictionTargets = [
      ...CANONICAL_JURISDICTIONS,
      ...Array.from(discoveredDistricts).map((dist) => ({
        id: dist.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: dist,
        code: dist.substring(0, 3).toUpperCase(),
      })),
    ];

    const jurisdictions: JurisdictionSummaryItem[] = allJurisdictionTargets.map((j) => {
      // Find matching cameras
      const matchingCameras = allCameras.filter((c) => {
        const nameUpper = (c.name || '').toUpperCase();
        const addrUpper = (c.location?.address || '').toUpperCase();
        const distUpper = (c.location?.district || '').toUpperCase();

        if (j.id === 'expressway') {
          return nameUpper.includes('EXPRESSWAY') || addrUpper.includes('EXPRESSWAY') || nameUpper.includes('CORRIDOR');
        }
        if (nameUpper.includes('EXPRESSWAY') || addrUpper.includes('EXPRESSWAY')) {
          return false; // Assigned to expressway
        }
        return distUpper === j.name.toUpperCase();
      });

      matchingCameras.forEach((c) => cameraCityMap.set(c.id, j.id));

      const onlineCount = matchingCameras.filter((c) => c.operationalStatus === OperationalStatus.ONLINE).length;
      const sightingsCount = matchingCameras.reduce((acc, c) => acc + (c._count?.sightings || 0), 0);

      // Count active alerts whose sighting camera is in this jurisdiction
      const matchingAlerts = rawAlerts.filter((a) => {
        const camId = a.sighting?.cameraId;
        return camId && cameraCityMap.get(camId) === j.id;
      }).length;

      return {
        id: j.id,
        name: j.name,
        code: j.code,
        total_cameras: matchingCameras.length,
        online_cameras: onlineCount,
        active_alerts: matchingAlerts,
        recent_sightings: sightingsCount,
      };
    });

    // 8. Resolve Recent Investigation Events
    const rawAuditLogs = recentAuditLogsRes.status === 'fulfilled' ? recentAuditLogsRes.value : [];
    const recentAuditEvents: InvestigationAuditEvent[] = rawAuditLogs.map((log) => {
      const details = (log.after as any) || {};
      const target = details.plate_normalized || details.plate || details.search_query || details.evidence_id || details.camera_id;
      return {
        id: log.id,
        timestamp: log.ts.toISOString(),
        actor_email: log.actor?.email || 'SYSTEM / AUTOMATED',
        actor_role: log.actor?.role?.name || 'SYSTEM',
        action: log.action,
        resource: log.resource,
        target: target ? String(target) : undefined,
      };
    });

    return {
      timestamp,
      system,
      cameras,
      alerts: {
        total_active: totalActiveAlerts,
        critical: criticalAlerts,
        high: highAlerts,
        medium: mediumAlerts,
        recent: recentAlerts,
      },
      watchlists: {
        total_watchlists: totalWatchlists,
        active_entries: activeEntries,
        recent_matches: recentMatches,
      },
      sightings: {
        recent_observations: recentSightings,
      },
      jurisdictions,
      investigations: {
        recent_events: recentAuditEvents,
      },
      disclaimer:
        'NETRAVA correlates discrete CCTV sightings using timestamps, camera locations and observed vehicle identifiers. Metrics reflect configured prototype and research sources, not nationwide deployment.',
    };
  }
}
