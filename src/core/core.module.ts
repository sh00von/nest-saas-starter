import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AllExceptionsFilter } from './errors/all-exceptions.filter.js';
import { LoggingModule } from './logging/logging.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ThrottlingModule } from './throttling/throttling.module.js';

/**
 * Cross-cutting infrastructure: logging, error format, events, rate limits,
 * and (with REDIS_URL) Redis and the job queue. Feature modules live in
 * `src/modules`.
 */
@Module({})
export class CoreModule {
  /** Call after ConfigModule.forRoot() so `.env` has been loaded. */
  static forRoot(): DynamicModule {
    const redis = Boolean(process.env.REDIS_URL);
    return {
      module: CoreModule,
      imports: [
        LoggingModule,
        EventEmitterModule.forRoot(),
        ...(redis ? [RedisModule, QueueModule] : []),
        ThrottlingModule.forRoot({ redis }),
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
