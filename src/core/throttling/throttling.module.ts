import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

/** Default limit for every route; tighten per route with `@Throttle()`. */
const DEFAULT_LIMIT = [{ ttl: 60_000, limit: 100 }];

/**
 * Global in-memory rate limiting.
 */
@Module({})
export class ThrottlingModule {
  static forRoot(): DynamicModule {
    if (process.env.NODE_ENV === 'test') {
      return { module: ThrottlingModule };
    }

    return {
      module: ThrottlingModule,
      imports: [ThrottlerModule.forRoot(DEFAULT_LIMIT)],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
