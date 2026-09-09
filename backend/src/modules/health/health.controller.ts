import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'System health probe & infrastructure connectivity status' })
  @ApiResponse({ status: 200, description: 'Health check passed' })
  async getHealth() {
    const dbHealth = await this.prisma.checkHealth();

    const isHealthy = dbHealth.isHealthy;

    return {
      status: isHealthy ? 'HEALTHY' : 'DEGRADED',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      services: {
        application: 'UP',
        database: isHealthy ? 'CONNECTED' : 'ERROR',
        postgis: isHealthy ? 'OPERATIONAL' : 'ERROR',
        database_details: dbHealth.details,
      },
      note: 'Application and core database connectivity verified. Camera fleet health is tracked separately under /api/v1/cameras/health.',
    };
  }
}
