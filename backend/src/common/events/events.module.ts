import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlertsModule } from '../../modules/alerts/alerts.module';
import { RedisStreamClient } from './redis/redis-stream.client';
import { SightingEventConsumer } from './consumers/sighting-event.consumer';

@Module({
  imports: [ConfigModule, PrismaModule, AlertsModule],
  providers: [RedisStreamClient, SightingEventConsumer],
  exports: [RedisStreamClient, SightingEventConsumer],
})
export class EventsModule {}
