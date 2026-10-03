import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Stripe from 'stripe';
import { type UserEvent, UserEvents } from '../users/users.events.js';
import { InjectStripe } from './stripe.provider.js';

/** Statuses that can still charge the customer. */
const BILLABLE = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

/** Reacts to user lifecycle events from the users module. */
@Injectable()
export class BillingListener {
  private readonly logger = new Logger(BillingListener.name);

  constructor(@InjectStripe() private readonly stripe: Stripe) {}

  /**
   * Cancels every billable subscription immediately before the user is
   * deleted. If Stripe fails, the error aborts the deletion, so an account
   * is never deleted while it can still be charged.
   */
  @OnEvent(UserEvents.Deleting, {
    async: true,
    promisify: true,
    suppressErrors: false,
  })
  async onUserDeleting({ user }: UserEvent): Promise<void> {
    if (!user.stripeCustomerId) return;
    for await (const sub of this.stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'all',
    })) {
      if (BILLABLE.has(sub.status)) {
        await this.stripe.subscriptions.cancel(sub.id);
        this.logger.log(`Cancelled ${sub.id} for deleted user ${user.id}`);
      }
    }
  }
}
