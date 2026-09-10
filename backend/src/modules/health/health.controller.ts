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

    return {
      status: isHealthy ? (redisHealthy ? 'HEALTHY' : 'DEGRADED') : 'DEGRADED',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      services: {
        application: 'UP',
        database: isHealthy ? 'CONNECTED' : 'ERROR',
        postgis: isHealthy ? 'OPERATIONAL' : 'ERROR',
        redis: redisHealthy ? 'CONNECTED' : 'DEGRADED',
        event_consumer: {
          status: redisHealthy ? 'RUNNING' : 'DEGRADED',
          stream: this.sightingConsumer.streamName,
          group: this.sightingConsumer.consumerGroup,
          received: this.sightingConsumer.totalEventsReceived,
          persisted: this.sightingConsumer.totalSightingsPersisted,
          duplicates: this.sightingConsumer.totalDuplicatesDetected,
          alerts: this.sightingConsumer.totalAlertsTriggered,
          errors: this.sightingConsumer.totalProcessingErrors,
        },
        database_details: dbHealth.details,
      },
      note: 'Application, core database, and Redis Streams event boundary connectivity verified. Camera fleet health is tracked separately under /api/v1/cameras/health.',
    };
  }
}
