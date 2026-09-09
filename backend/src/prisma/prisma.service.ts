import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully (PostgreSQL 16 + PostGIS)');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed cleanly');
  }

  async checkHealth(): Promise<{ isHealthy: boolean; details: string }> {
    try {
      const result: any = await this.$queryRaw`SELECT 1 as ping, PostGIS_Version() as postgis;`;
      if (result && result.length > 0) {
        return {
          isHealthy: true,
          details: `PostgreSQL responding, PostGIS ${result[0].postgis} active`,
        };
      }
      return { isHealthy: false, details: 'Unexpected query result' };
    } catch (error: any) {
      return { isHealthy: false, details: error.message };
    }
  }
}
