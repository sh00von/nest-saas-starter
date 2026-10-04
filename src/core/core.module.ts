import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AllExceptionsFilter } from './errors/all-exceptions.filter.js';
import { LoggingModule } from './logging/logging.module.js';
import { ThrottlingModule } from './throttling/throttling.module.js';

/**
 * Cross-cutting infrastructure: logging, error format, events, and rate limits.
 * Feature modules live in `src/modules`.
 */
@Module({})
export class CoreModule {
  static forRoot(): DynamicModule {
    return {
      module: CoreModule,
      imports: [
        LoggingModule,
        EventEmitterModule.forRoot(),
        ThrottlingModule.forRoot(),
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
