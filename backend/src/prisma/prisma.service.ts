import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Configure database URL for Supabase transaction pooler (PgBouncer/Supavisor).
 * In transaction pooling mode (e.g. Supabase port 6543 / pooler.supabase.com),
 * named prepared statements must be disabled via `pgbouncer=true` to prevent
 * PostgreSQL error 42P05 ("prepared statement already exists").
 */
export function configureDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || !rawUrl.trim()) {
    return undefined;
  }

  const trimmed = rawUrl.trim();

  try {
    const parsed = new URL(trimmed);
    const isPooler =
      parsed.port === '6543' ||
      parsed.hostname.includes('pooler.supabase.com') ||
      parsed.hostname.includes('pgbouncer') ||
      parsed.searchParams.get('pgbouncer') === 'true' ||
      process.env.PGBOUNCER === 'true' ||
      process.env.PRISMA_PGBOUNCER === 'true';

    if (isPooler && parsed.searchParams.get('pgbouncer') !== 'true') {
      parsed.searchParams.set('pgbouncer', 'true');
      return parsed.toString();
    }
    return trimmed;
  } catch {
    const isPoolerPort = /:6543(\/|$|\?)/.test(trimmed);
    const isPoolerHost = /pooler\.supabase\.com|pgbouncer/i.test(trimmed);
    const isPoolerEnv =
      process.env.PGBOUNCER === 'true' || process.env.PRISMA_PGBOUNCER === 'true';
    const hasPgBouncer = /[?&]pgbouncer=true/i.test(trimmed);

    if ((isPoolerPort || isPoolerHost || isPoolerEnv) && !hasPgBouncer) {
      const separator = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${separator}pgbouncer=true`;
    }
    return trimmed;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    const configuredUrl = configureDatabaseUrl(rawUrl);

    super(
      configuredUrl
        ? {
            datasources: {
              db: {
                url: configuredUrl,
              },
            },
          }
        : undefined,
    );

    if (configuredUrl && configuredUrl !== rawUrl) {
      this.logger.log(
        'Configured Prisma runtime connection with pgbouncer=true for transaction pooler compatibility',
      );
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully (PostgreSQL 16 + PostGIS)');
    } catch (error: any) {
      this.logger.error(`Failed to connect to PostgreSQL database: ${error?.message || error}`);
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
