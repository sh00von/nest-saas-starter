import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AllExceptionsFilter } from './errors/all-exceptions.filter.js';
import { LoggingModule } from './logging/logging.module.js';

/**
 * Cross-cutting infrastructure: logging, error format, and events.
 * Feature modules live in `src/modules`.
 */
@Module({})
export class CoreModule {
  static forRoot(): DynamicModule {
    return {
      module: CoreModule,
      imports: [LoggingModule, EventEmitterModule.forRoot()],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
