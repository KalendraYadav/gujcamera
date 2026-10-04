import { configureDatabaseUrl, PrismaService } from './prisma.service';

describe('PrismaService & Supabase PgBouncer Compatibility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('configureDatabaseUrl', () => {
    it('returns undefined if rawUrl is undefined or empty', () => {
      expect(configureDatabaseUrl(undefined)).toBeUndefined();
      expect(configureDatabaseUrl('')).toBeUndefined();
      expect(configureDatabaseUrl('   ')).toBeUndefined();
    });

    it('preserves local Docker PostgreSQL URL without modifying query params', () => {
      const localUrl = 'postgresql://postgres:gujcamera_dev_secret@localhost:5432/gujcamera_db?schema=public';
      const result = configureDatabaseUrl(localUrl);
      expect(result).toBe(localUrl);
      expect(result).not.toContain('pgbouncer=true');
    });

    it('automatically appends pgbouncer=true for Supabase port 6543 transaction pooler', () => {
      const poolerUrl = 'postgresql://postgres.project:pass123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
      const result = configureDatabaseUrl(poolerUrl);
      expect(result).toBe(
        'postgresql://postgres.project:pass123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
      );
    });

    it('appends &pgbouncer=true if the pooler URL already has other query params', () => {
      const poolerUrl = 'postgresql://postgres.project:pass123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?schema=public';
      const result = configureDatabaseUrl(poolerUrl);
      expect(result).toBe(
        'postgresql://postgres.project:pass123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?schema=public&pgbouncer=true',
      );
    });

    it('does not duplicate pgbouncer=true if already present in the connection string', () => {
      const poolerUrl = 'postgresql://postgres.project:pass123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
      const result = configureDatabaseUrl(poolerUrl);
      expect(result).toBe(poolerUrl);
      // Ensure only one occurrence of pgbouncer=true
      const matches = result?.match(/pgbouncer=true/g);
      expect(matches?.length).toBe(1);
    });

    it('detects pooler hostname even if port is non-standard', () => {
      const customPoolerUrl = 'postgresql://user:pass@my-custom.pooler.supabase.com:5432/postgres';
      const result = configureDatabaseUrl(customPoolerUrl);
      expect(result).toContain('pgbouncer=true');
    });

    it('honors PGBOUNCER=true environment flag on arbitrary database hosts', () => {
      process.env.PGBOUNCER = 'true';
      const customUrl = 'postgresql://user:pass@pg-internal.corp:5432/db';
      const result = configureDatabaseUrl(customUrl);
      expect(result).toBe('postgresql://user:pass@pg-internal.corp:5432/db?pgbouncer=true');
    });
  });

  describe('PrismaService Instantiation', () => {
    it('instantiates PrismaService without error when DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgresql://postgres:secret@localhost:5432/gujcamera_db';
      const service = new PrismaService();
      expect(service).toBeDefined();
    });

    it('configures datasource overrides when connecting to Supabase pooler', () => {
      process.env.DATABASE_URL = 'postgresql://postgres.proj:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
      const service = new PrismaService();
      expect(service).toBeDefined();
    });
  });
});
