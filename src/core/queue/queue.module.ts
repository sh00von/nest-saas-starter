import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';

/**
 * BullMQ background jobs on Redis. Only loaded when REDIS_URL is set.
 * Feature modules register their own queues with `BullModule.registerQueue`.
 */
export const QueueModule = BullModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    connection: {
      url: config.get('REDIS_URL', { infer: true }),
      // Required by BullMQ workers: they block on Redis indefinitely.
      maxRetriesPerRequest: null,
    },
  }),
});
