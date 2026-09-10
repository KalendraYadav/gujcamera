import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface StreamMessage {
  id: string;
  fields: Record<string, string>;
}

@Injectable()
export class RedisStreamClient implements OnModuleDestroy {
  private readonly logger = new Logger(RedisStreamClient.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.initClient();
  }

  private initClient(): void {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = Number(this.configService.get<number>('REDIS_PORT', 6379));
    const password = this.configService.get<string>('REDIS_PASSWORD', '');

    try {
      this.client = new Redis({
        host,
        port,
        password: password ? password : undefined,
        lazyConnect: false,
        retryStrategy: (times) => {
          const delay = Math.min(times * 500, 5000);
          this.logger.warn(`Redis connection failed (attempt ${times}). Retrying in ${delay}ms...`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Connected to Redis at ${host}:${port}`);
      });

      this.client.on('ready', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
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
