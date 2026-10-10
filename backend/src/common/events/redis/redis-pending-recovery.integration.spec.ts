import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisStreamClient } from './redis-stream.client';

/**
 * Phase 4.2 — Real Redis Stream Pending Recovery Integration Test
 * Verifies XAUTOCLAIM against live Redis without mutating PostgreSQL or judge demo records.
 */
describe('Redis Stream Pending Recovery (Live Redis Integration)', () => {
  let redisClient: RedisStreamClient;
  let testStream: string;
  let testGroup: string;

  beforeAll(async () => {
    const configServiceMock = {
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
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    redisClient = module.get<RedisStreamClient>(RedisStreamClient);
    testStream = `test:stream:pending:${Date.now()}`;
    testGroup = `test:group:pending:${Date.now()}`;
  });

  afterAll(async () => {
    if (redisClient) {
      // Clean up temporary test stream
      try {
        const client = (redisClient as any).client;
        if (client) {
          await client.del(testStream);
        }
      } catch {}
      await redisClient.onModuleDestroy();
    }
  });

  it('reclaims an unacknowledged pending message from a crashed consumer using autoClaim on real Redis', async () => {
    const isHealthy = await redisClient.isHealthy();
    if (!isHealthy) {
      console.warn('Skipping live Redis integration test: Redis not reachable');
      return;
    }

    // 1. Ensure consumer group exists
    await redisClient.ensureConsumerGroup(testStream, testGroup, '0');

    // 2. Publish two messages into the stream
    const msgId1 = await redisClient.publish(testStream, {
      payload: JSON.stringify({ sighting_id: 's-live-test-1', plate: 'GJ01AB1111' }),
    });
    const msgId2 = await redisClient.publish(testStream, {
      payload: JSON.stringify({ sighting_id: 's-live-test-2', plate: 'GJ01AB2222' }),
    });

    expect(msgId1).toBeDefined();
    expect(msgId2).toBeDefined();

    // 3. Consumer "crashed-worker-1" reads msgId1 and msgId2 but DOES NOT ACK them
    const messages = await redisClient.readGroup(
      testGroup,
      'crashed-worker-1',
      testStream,
      2,
      1000,
    );

    expect(messages.length).toBe(2);
    expect(messages.map((m) => m.id)).toContain(msgId1);
    expect(messages.map((m) => m.id)).toContain(msgId2);

    // Both messages are now in PEL owned by "crashed-worker-1"
    // Wait 50ms so messages have non-zero idle time
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Consumer "new-worker-2" runs autoClaim with minIdleTimeMs = 20ms
    const claimResult = await redisClient.autoClaim(
      testStream,
      testGroup,
      'new-worker-2',
      20, // minIdleTimeMs
      '0-0',
      10,
    );

    expect(claimResult.messages.length).toBeGreaterThanOrEqual(1);
    const reclaimedIds = claimResult.messages.map((m) => m.id);
    expect(reclaimedIds).toContain(msgId1);

    // 5. Acknowledge the reclaimed messages
    const ackCount1 = await redisClient.ack(testStream, testGroup, msgId1);
    const ackCount2 = await redisClient.ack(testStream, testGroup, msgId2);

    expect(ackCount1).toBe(1);
    expect(ackCount2).toBe(1);

    // 6. Verify that PEL is now empty for these messages
    const postAckClaim = await redisClient.autoClaim(
      testStream,
      testGroup,
      'new-worker-2',
      0,
      '0-0',
      10,
    );
    const remainingIds = postAckClaim.messages.map((m) => m.id);
    expect(remainingIds).not.toContain(msgId1);
    expect(remainingIds).not.toContain(msgId2);
  });
});
