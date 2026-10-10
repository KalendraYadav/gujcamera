import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisStreamClient } from '../../common/events/redis/redis-stream.client';
import { SightingEventConsumer } from '../../common/events/consumers/sighting-event.consumer';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisClient: RedisStreamClient,
    private readonly sightingConsumer: SightingEventConsumer,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'System health probe & infrastructure connectivity status' })
  @ApiResponse({ status: 200, description: 'Health check passed' })
  async getHealth() {
    const dbHealth = await this.prisma.checkHealth();
    const redisHealthy = await this.redisClient.isHealthy();

    const isHealthy = dbHealth.isHealthy;

    let aiWorkerState: any = {
      status: 'UNAVAILABLE',
      note: 'No active AI worker heartbeat detected in Redis',
    };

    if (redisHealthy) {
      try {
        const telemetryRaw = await this.redisClient.get('gujcamera:telemetry:ai-worker');
        if (telemetryRaw) {
          const parsed = JSON.parse(telemetryRaw);
          const nowSec = Date.now() / 1000;
          const isFresh = nowSec - (parsed.timestamp || 0) < 30;
          let resolvedStatus = parsed.status || 'HEALTHY';
          if (!isFresh) {
            resolvedStatus = 'STALE';
          }

          const isProcessingActive = Boolean(
            parsed.last_processing_timestamp &&
            nowSec - parsed.last_processing_timestamp < 30,
          );

          aiWorkerState = {
            status: resolvedStatus,
            worker_name: parsed.worker_name,
            uptime_seconds: parsed.uptime_seconds,
            heartbeat_timestamp: parsed.timestamp ? new Date(parsed.timestamp * 1000).toISOString() : null,
            last_processing_timestamp: parsed.last_processing_timestamp ? new Date(parsed.last_processing_timestamp * 1000).toISOString() : null,
            is_fresh: isFresh,
            is_processing_active: isProcessingActive,
            streams: parsed.streams,
            inference_latency_ms: {
              avg: parsed.inference?.avg_latency_ms ?? null,
              p50: parsed.inference?.p50_latency_ms ?? null,
              p95: parsed.inference?.p95_latency_ms ?? null,
              p99: parsed.inference?.p99_latency_ms ?? null,
            },
            e2e_latency_ms: {
              avg: parsed.inference?.e2e_avg_latency_ms ?? null,
              p50: parsed.inference?.e2e_p50_latency_ms ?? null,
              p95: parsed.inference?.e2e_p95_latency_ms ?? null,
            },
            ocr: {
              engine: parsed.inference?.ocr_engine ?? null,
              processed: parsed.inference?.total_ocr_processed ?? 0,
              success: parsed.inference?.total_ocr_success ?? 0,
              avg_latency_ms: parsed.inference?.avg_ocr_latency_ms ?? null,
              p50_latency_ms: parsed.inference?.p50_ocr_latency_ms ?? null,
              p95_latency_ms: parsed.inference?.p95_ocr_latency_ms ?? null,
            },
            events: {
              published: parsed.events?.published ?? 0,
              publish_errors: parsed.events?.publish_errors ?? 0,
              buffer_size: parsed.events?.buffer_size ?? 0,
              buffer_drops: parsed.events?.buffer_drops ?? 0,
            },
            system: parsed.system,
          };
        }
      } catch (err: any) {
        aiWorkerState = {
          status: 'DEGRADED',
          note: `Failed to resolve AI worker heartbeat: ${err.message}`,
        };
      }
    }

    return {
      status: isHealthy ? (redisHealthy ? 'HEALTHY' : 'DEGRADED') : 'DEGRADED',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      services: {
        application: 'UP',
        database: isHealthy ? 'CONNECTED' : 'ERROR',
        postgis: isHealthy ? 'OPERATIONAL' : 'ERROR',
        redis: redisHealthy ? 'CONNECTED' : 'DEGRADED',
        ai_worker: aiWorkerState,
        event_consumer: {
          status: redisHealthy ? 'RUNNING' : 'DEGRADED',
          stream: this.sightingConsumer.streamName,
          group: this.sightingConsumer.consumerGroup,
          received: this.sightingConsumer.totalEventsReceived,
          persisted: this.sightingConsumer.totalSightingsPersisted,
          duplicates: this.sightingConsumer.totalDuplicatesDetected,
          alerts: this.sightingConsumer.totalAlertsTriggered,
          errors: this.sightingConsumer.totalProcessingErrors,
          pending_recovered: this.sightingConsumer.totalPendingRecovered,
          pending_reclaimed: this.sightingConsumer.totalPendingReclaimAttempts,
          dead_letters: this.sightingConsumer.totalDeadLettersDropped,
        },
        database_details: dbHealth.details,
      },
      note: 'Application, core database, Redis Streams event boundary, and AI worker telemetry verified. Camera fleet health is tracked separately under /api/v1/cameras/health.',
    };
  }
}
