import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import type { Env } from '../../config/env.js';
import { type Database, InjectDb } from '../../database/database.module.js';
import { subscriptions, users } from '../../database/schema/index.js';
import { InjectStripe } from './stripe.provider.js';

const SUBSCRIPTION_EVENTS = new Set<string>([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

/** Keeps the local `subscriptions` table in sync with Stripe. */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    @InjectStripe() private readonly stripe: Stripe,
    @InjectDb() private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Verifies the signature; throws BadRequest on a forged or stale payload. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true })!,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
  }

  async handle(event: Stripe.Event): Promise<void> {
    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      const subscription = event.data.object as Stripe.Subscription;
      await this.syncSubscription(subscription.id);
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (typeof session.subscription === 'string') {
        await this.syncSubscription(session.subscription);
      }
    }
  }

  /**
   * Re-reads the subscription from Stripe instead of trusting the event
   * payload, so retried and out-of-order webhooks always converge on the
   * latest state.
   */
  private async syncSubscription(subscriptionId: string): Promise<void> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const user = await this.db.query.users.findFirst({
      where: eq(users.stripeCustomerId, customerId),
    });
    if (!user) {
      this.logger.warn(`No user for Stripe customer ${customerId}; skipping`);
      return;
    }

    const item = sub.items.data[0];
    const values = {
      userId: user.id,
      status: sub.status,
      priceId: item?.price.id ?? '',
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
    await this.db
      .insert(subscriptions)
      .values({ id: sub.id, ...values })
      .onConflictDoUpdate({ target: subscriptions.id, set: values });
  }
}
