import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import Redis, { RedisOptions } from 'ioredis';

export interface StreamMessage {
  id: string;
  fields: Record<string, string>;
}

/**
 * Safely parse boolean configuration options (e.g. REDIS_TLS).
 * 'true' / true => true
 * 'false' / empty / missing / undefined / null => false
 */
export function parseRedisTlsOption(val: unknown): boolean {
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'string') {
    return val.trim().toLowerCase() === 'true';
  }
  return false;
}

/**
 * Build standard ioredis options supporting optional TLS (e.g. Upstash, AWS ElastiCache)
 * while preserving identical local Docker Redis behavior when TLS is absent/false.
 */
export function buildRedisOptions(config: {
  host?: string;
  port?: number | string;
  password?: string;
  tls?: unknown;
}): RedisOptions {
  const host = config.host || 'localhost';
  const port = Number(config.port) || 6379;
  const password = config.password ? config.password : undefined;
  const isTls = parseRedisTlsOption(config.tls);

  const options: RedisOptions = {
    host,
    port,
    password,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 500, 5000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  };

  if (isTls) {
    options.tls = {
      // Provide servername for SNI in managed TLS environments (Upstash / cloud TLS routers)
      // Omit servername if host is a raw IP address per TLS specification RFC 6066
      servername: host && !net.isIP(host) ? host : undefined,
    };
  }

  return options;
}

@Injectable()
export class RedisStreamClient implements OnModuleDestroy {
  private readonly logger = new Logger(RedisStreamClient.name);
  private client: Redis | null = null;
  private isConnected = false;
  private redisOptions: RedisOptions | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initClient();
  }

  private initClient(): void {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = Number(this.configService.get<number>('REDIS_PORT', 6379));
    const password = this.configService.get<string>('REDIS_PASSWORD', '');
    const rawTls = this.configService.get<string | boolean>('REDIS_TLS', false);

    const isTls = parseRedisTlsOption(rawTls);
    this.redisOptions = buildRedisOptions({
      host,
      port,
      password,
      tls: isTls,
    });

    try {
      this.client = new Redis(this.redisOptions);

      this.client.on('connect', () => {
        this.isConnected = true;
        // Sanitized log: never logs passwords or secrets
        this.logger.log(`Connected to Redis at ${host}:${port} (TLS: ${isTls ? 'enabled' : 'disabled'})`);
      });

      this.client.on('ready', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        // Do not leak credentials in error log
        this.logger.error(`Redis client error: ${err.message}`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    } catch (err: any) {
      this.logger.error(`Failed to initialize Redis client: ${err.message}`);
      this.client = null;
    }
  }

  /**
   * Returns current active Redis connection options (immutable copy)
   */
  public getOptions(): Readonly<RedisOptions> | null {
    return this.redisOptions;
  }

  /**
   * Factory method to create a duplicated or secondary Redis client
   * ensuring identical TLS, auth, and connection settings are inherited.
   */
  public createClient(overrideOptions?: Partial<RedisOptions>): Redis {
    if (!this.redisOptions) {
      throw new Error('Redis configuration is not initialized');
    }
    return new Redis({
      ...this.redisOptions,
      ...overrideOptions,
    });
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async ensureConsumerGroup(stream: string, group: string, startId = '$'): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }

    try {
      // XGROUP CREATE stream group startId MKSTREAM
      await this.client.xgroup('CREATE', stream, group, startId, 'MKSTREAM');
      this.logger.log(`Created consumer group '${group}' on stream '${stream}' (startId: ${startId})`);
    } catch (err: any) {
      if (err.message && err.message.includes('BUSYGROUP')) {
        // Consumer group already exists, this is completely normal and expected
        this.logger.debug(`Consumer group '${group}' already exists on stream '${stream}'`);
      } else {
        this.logger.error(`Error ensuring consumer group '${group}' on stream '${stream}': ${err.message}`);
        throw err;
      }
    }
  }

  async readGroup(
    group: string,
    consumer: string,
    stream: string,
    count = 10,
    blockMs = 2000,
  ): Promise<StreamMessage[]> {
    if (!this.client) {
      return [];
    }

    try {
      // XREADGROUP GROUP group consumer COUNT count BLOCK blockMs STREAMS stream >
      const result = (await this.client.xreadgroup(
        'GROUP',
        group,
        consumer,
        'COUNT',
        count,
        'BLOCK',
        blockMs,
        'STREAMS',
        stream,
        '>',
      )) as [string, [string, string[]][]][] | null;

      if (!result || result.length === 0) {
        return [];
      }

      const messages: StreamMessage[] = [];
      for (const [, entries] of result) {
        for (const [id, rawFields] of entries) {
          const fields: Record<string, string> = {};
          for (let i = 0; i < rawFields.length; i += 2) {
            fields[rawFields[i]] = rawFields[i + 1];
          }
          messages.push({ id, fields });
        }
      }

      return messages;
    } catch (err: any) {
      this.logger.error(`Error reading from stream '${stream}' via group '${group}': ${err.message}`);
      return [];
    }
  }

  async ack(stream: string, group: string, messageId: string): Promise<number> {
    if (!this.client) {
      return 0;
    }
    try {
      return await this.client.xack(stream, group, messageId);
    } catch (err: any) {
      this.logger.error(`Failed to XACK message ${messageId} on ${stream}/${group}: ${err.message}`);
      return 0;
    }
  }

  async publish(stream: string, fields: Record<string, string>): Promise<string> {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }
    const flatArgs: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      flatArgs.push(key, value);
    }
    return (await this.client.xadd(stream, '*', ...flatArgs)) as string;
  }

  /**
   * Publish a message to a standard Redis Pub/Sub channel for lightweight real-time notifications
   */
  async pubsubPublish(channel: string, message: string): Promise<number> {
    if (!this.client) {
      this.logger.warn(`Cannot publish to ${channel}: Redis client not initialized`);
      return 0;
    }
    try {
      return await this.client.publish(channel, message);
    } catch (err: any) {
      this.logger.error(`Error publishing to Redis channel ${channel}: ${err.message}`);
      return 0;
    }
  }

  /**
   * Set field in a Redis Hash (for active camera stream registry state)
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.hset(key, field, value);
    } catch (err: any) {
      this.logger.error(`Error setting hash ${key}.${field}: ${err.message}`);
      return 0;
    }
  }

  /**
   * Delete field from a Redis Hash
   */
  async hdel(key: string, field: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.hdel(key, field);
    } catch (err: any) {
      this.logger.error(`Error deleting hash field ${key}.${field}: ${err.message}`);
      return 0;
    }
  }

  /**
   * Get all fields and values from a Redis Hash
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) return {};
    try {
      return await this.client.hgetall(key);
    } catch (err: any) {
      this.logger.error(`Error getting all hash fields for ${key}: ${err.message}`);
      return {};
    }
  }

  /**
   * Get specific field from a Redis Hash
   */
  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.hget(key, field);
    } catch (err: any) {
      this.logger.error(`Error getting hash field ${key}.${field}: ${err.message}`);
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('Redis client connection cleanly disconnected');
      } catch {
        this.client.disconnect();
      }
      this.client = null;
    }
  }
}
