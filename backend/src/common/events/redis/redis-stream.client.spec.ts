import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import {
  RedisStreamClient,
  buildRedisOptions,
  parseRedisTlsOption,
} from './redis-stream.client';

// Mock ioredis so unit tests do not require a live network socket
jest.mock('ioredis');

describe('RedisStreamClient & Production TLS Compatibility', () => {
  const MockedRedis = Redis as unknown as jest.MockedClass<typeof Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // 1. Boolean Parsing Logic
  // ============================================================================
  describe('parseRedisTlsOption', () => {
    it('parses "true" string variants as true', () => {
      expect(parseRedisTlsOption('true')).toBe(true);
      expect(parseRedisTlsOption('TRUE')).toBe(true);
      expect(parseRedisTlsOption('True')).toBe(true);
      expect(parseRedisTlsOption('  true  ')).toBe(true);
      expect(parseRedisTlsOption(true)).toBe(true);
    });

    it('parses "false", empty, or non-true values as false', () => {
      expect(parseRedisTlsOption('false')).toBe(false);
      expect(parseRedisTlsOption('FALSE')).toBe(false);
      expect(parseRedisTlsOption('False')).toBe(false);
      expect(parseRedisTlsOption('')).toBe(false);
      expect(parseRedisTlsOption('   ')).toBe(false);
      expect(parseRedisTlsOption(false)).toBe(false);
      expect(parseRedisTlsOption(undefined)).toBe(false);
      expect(parseRedisTlsOption(null)).toBe(false);
      expect(parseRedisTlsOption('1')).toBe(false);
      expect(parseRedisTlsOption('yes')).toBe(false);
      expect(parseRedisTlsOption('enabled')).toBe(false);
    });
  });

  // ============================================================================
  // 2. buildRedisOptions — Local Docker vs Managed Production Configuration
  // ============================================================================
  describe('buildRedisOptions', () => {
    it('builds local Docker configuration with plain TCP and undefined TLS', () => {
      const opts = buildRedisOptions({
        host: 'localhost',
        port: 6379,
        password: '',
        tls: false,
      });

      expect(opts.host).toBe('localhost');
      expect(opts.port).toBe(6379);
      expect(opts.password).toBeUndefined();
      expect(opts.tls).toBeUndefined();
      expect(opts.maxRetriesPerRequest).toBe(3);
      expect(opts.lazyConnect).toBe(false);
    });

    it('defaults to localhost:6379 when host and port are omitted', () => {
      const opts = buildRedisOptions({});

      expect(opts.host).toBe('localhost');
      expect(opts.port).toBe(6379);
      expect(opts.password).toBeUndefined();
      expect(opts.tls).toBeUndefined();
    });

    it('builds managed TLS configuration with SNI servername (e.g. Upstash)', () => {
      const opts = buildRedisOptions({
        host: 'champion-meerkat-194304.upstash.io',
        port: 6379,
        password: 'super-secret-production-token',
        tls: 'true',
      });

      expect(opts.host).toBe('champion-meerkat-194304.upstash.io');
      expect(opts.port).toBe(6379);
      expect(opts.password).toBe('super-secret-production-token');
      expect(opts.tls).toBeDefined();
      expect(opts.tls).toEqual({
        servername: 'champion-meerkat-194304.upstash.io',
      });
    });

    it('omits SNI servername when host is a raw IPv4/IPv6 address per RFC 6066', () => {
      const ipv4Opts = buildRedisOptions({
        host: '10.0.0.15',
        port: 6379,
        tls: true,
      });
      expect(ipv4Opts.tls).toEqual({ servername: undefined });

      const ipv6Opts = buildRedisOptions({
        host: '::1',
        port: 6379,
        tls: 'true',
      });
      expect(ipv6Opts.tls).toEqual({ servername: undefined });
    });

    it('ignores empty string password and converts to undefined', () => {
      const opts = buildRedisOptions({
        host: 'localhost',
        port: 6379,
        password: '',
      });
      expect(opts.password).toBeUndefined();
    });
  });

  // ============================================================================
  // 3. RedisStreamClient Service Lifecycle & Instantiation
  // ============================================================================
  describe('RedisStreamClient NestJS Service', () => {
    it('initializes with plain TCP for local Docker Redis (REDIS_TLS absent)', async () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'REDIS_HOST') return 'localhost';
          if (key === 'REDIS_PORT') return 6379;
          if (key === 'REDIS_PASSWORD') return '';
          if (key === 'REDIS_TLS') return false;
          return defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisStreamClient,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<RedisStreamClient>(RedisStreamClient);
      const options = service.getOptions();

      expect(options).toBeDefined();
      expect(options?.host).toBe('localhost');
      expect(options?.port).toBe(6379);
      expect(options?.password).toBeUndefined();
      expect(options?.tls).toBeUndefined();

      expect(MockedRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379,
        }),
      );
      const callArgs = (MockedRedis.mock.calls as any[])[0][0] as RedisOptions;
      expect(callArgs.tls).toBeUndefined();
    });

    it('initializes with TLS enabled when REDIS_TLS is set to "true"', async () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'REDIS_HOST') return 'redis.cloud.managed.net';
          if (key === 'REDIS_PORT') return 6380;
          if (key === 'REDIS_PASSWORD') return 'cloud_secret_password';
          if (key === 'REDIS_TLS') return 'true';
          return defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisStreamClient,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<RedisStreamClient>(RedisStreamClient);
      const options = service.getOptions();

      expect(options).toBeDefined();
      expect(options?.host).toBe('redis.cloud.managed.net');
      expect(options?.port).toBe(6380);
      expect(options?.password).toBe('cloud_secret_password');
      expect(options?.tls).toEqual({
        servername: 'redis.cloud.managed.net',
      });

      expect(MockedRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'redis.cloud.managed.net',
          port: 6380,
          password: 'cloud_secret_password',
          tls: { servername: 'redis.cloud.managed.net' },
        }),
      );
    });

    it('createClient factory inherits exact active configuration (including TLS & auth)', async () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'REDIS_HOST') return 'upstash.endpoint.io';
          if (key === 'REDIS_PORT') return 6379;
          if (key === 'REDIS_PASSWORD') return 'auth_token';
          if (key === 'REDIS_TLS') return 'true';
          return defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisStreamClient,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<RedisStreamClient>(RedisStreamClient);

      // Create a duplicated/secondary client instance (e.g. for dedicated subscriptions)
      const secondaryClient = service.createClient({ maxRetriesPerRequest: 1 });
      expect(secondaryClient).toBeDefined();

      expect(MockedRedis).toHaveBeenLastCalledWith(
        expect.objectContaining({
          host: 'upstash.endpoint.io',
          port: 6379,
          password: 'auth_token',
          tls: { servername: 'upstash.endpoint.io' },
          maxRetriesPerRequest: 1,
        }),
      );
    });

    it('cleanly closes connection on module destroy', async () => {
      const mockQuit = jest.fn().mockResolvedValue('OK');
      MockedRedis.prototype.quit = mockQuit;

      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => defaultValue),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisStreamClient,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const service = module.get<RedisStreamClient>(RedisStreamClient);
      await service.onModuleDestroy();

      expect(mockQuit).toHaveBeenCalled();
    });
  });
});
