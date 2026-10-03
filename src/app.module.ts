import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { GoogleAuthModule } from './modules/google-auth/google-auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { UsersModule } from './modules/users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

// ConfigModule.forRoot() loads .env synchronously, so the optional modules
// below can be chosen from process.env right after it.
const configModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate: validateEnv,
});

/** Features that switch on when their configuration is present. */
const optionalModules = [
  ...(process.env.GOOGLE_CLIENT_ID ? [GoogleAuthModule] : []),
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
    // Infrastructure
    configModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    MailModule,
    // Features
    AuthModule,
    UsersModule,
    HealthModule,
    ...optionalModules,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
