import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { BillingModule } from './billing/billing.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

// ConfigModule.forRoot() loads .env synchronously, so the optional modules
// below can be chosen from process.env right after it.
const configModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate: validateEnv,
});

const optionalModules = [
  // Billing endpoints only exist when Stripe is configured.
  ...(process.env.STRIPE_SECRET_KEY ? [BillingModule] : []),
  // Tracing, logs and metrics: https://observe.nestjs.com
  ...(process.env.OBSERVE_APP_KEY
    ? [
        ObserveModule.forRoot({
          appKey: process.env.OBSERVE_APP_KEY,
          appSecret: process.env.OBSERVE_APP_SECRET ?? '',
          serviceId: 'nest-starter',
        }),
      ]
    : []),
];

@Module({
  imports: [
    configModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    UsersModule,
    ...optionalModules,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
