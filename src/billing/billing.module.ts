import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../config/env.js';
import { UsersModule } from '../users/users.module.js';
import { BillingController } from './billing.controller.js';
import { BillingService, STRIPE } from './billing.service.js';

/** Only loaded when STRIPE_SECRET_KEY is set (see AppModule). */
@Module({
  imports: [UsersModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: STRIPE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Stripe(config.get('STRIPE_SECRET_KEY', { infer: true })!),
    },
  ],
})
export class BillingModule {}
