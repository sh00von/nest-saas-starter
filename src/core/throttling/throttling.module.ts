import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS, RedisModule } from '../redis/redis.module.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

/** Default limit for every route; tighten per route with `@Throttle()`. */
const DEFAULT_LIMIT = [{ ttl: 60_000, limit: 100 }];

/**
 * Global rate limiting. Counters live in Redis when available (shared by all
 * instances), otherwise in this process's memory.
 */
@Module({})
export class ThrottlingModule {
  static forRoot({ redis }: { redis: boolean }): DynamicModule {
    return {
      module: ThrottlingModule,
      imports: [
        redis
          ? ThrottlerModule.forRootAsync({
              imports: [RedisModule],
              inject: [REDIS],
              useFactory: (client: Redis) => ({
                throttlers: DEFAULT_LIMIT,
                storage: new RedisThrottlerStorage(client),
              }),
            })
          : ThrottlerModule.forRoot(DEFAULT_LIMIT),
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
