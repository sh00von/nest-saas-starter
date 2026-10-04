import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { validateEnv } from './config/env.js';
import { CoreModule } from './core/core.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { GoogleAuthModule } from './modules/google-auth/google-auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { UsersModule } from './modules/users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

// ConfigModule.forRoot() loads .env synchronously, so everything below can
// read process.env to decide which optional modules to load.
const configModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate: validateEnv,
});

const env = process.env;

/** Features that switch on when their configuration is present. */
const optionalModules = [
  ...(env.GOOGLE_CLIENT_ID ? [GoogleAuthModule] : []),
  ...(env.STRIPE_SECRET_KEY ? [BillingModule] : []),
  ...(env.S3_BUCKET ? [FilesModule] : []),
  // Tracing, logs and metrics: https://observe.nestjs.com
  ...(env.OBSERVE_APP_KEY
    ? [
        ObserveModule.forRoot({
          appKey: env.OBSERVE_APP_KEY,
          appSecret: env.OBSERVE_APP_SECRET ?? '',
          serviceId: 'nest-saas-starter',
        }),
      ]
    : []),
];

@Module({
  imports: [
    // Infrastructure
    configModule,
    CoreModule.forRoot(),
    DatabaseModule,
    MailModule.forRoot({ queue: Boolean(env.REDIS_URL) }),
    // Features
    AuthModule,
    UsersModule,
    HealthModule,
    ...optionalModules,
  ],
})
export class AppModule {}
