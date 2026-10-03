import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { BillingController } from './billing.controller.js';
import { BillingListener } from './billing.listener.js';
import { BillingService } from './billing.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeWebhookService } from './stripe-webhook.service.js';
import { stripeProvider } from './stripe.provider.js';

/** Stripe subscriptions. Only loaded when STRIPE_SECRET_KEY is set. */
@Module({
  imports: [UsersModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    stripeProvider,
    BillingService,
    StripeWebhookService,
    BillingListener,
  ],
})
export class BillingModule {}
