import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNull } from 'drizzle-orm';
import Stripe from 'stripe';
import type { Env } from '../config/env.js';
import { type Database, InjectDb } from '../database/database.module.js';
import { subscriptions, users } from '../database/schema/index.js';
import { UsersService } from '../users/users.service.js';

export const STRIPE = Symbol('STRIPE');

const SUBSCRIPTION_EVENTS = new Set<string>([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(STRIPE) private readonly stripe: Stripe,
    @InjectDb() private readonly db: Database,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createCheckoutSession(userId: string, priceId: string) {
    const allowed = this.config.get('STRIPE_PRICE_IDS', { infer: true });
    if (!allowed.includes(priceId)) {
      throw new BadRequestException('Unknown price');
    }
    const frontendUrl = this.config.get('FRONTEND_URL', { infer: true });
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: await this.getOrCreateCustomer(userId),
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { userId } },
      success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing`,
    });
    return { url: session.url! };
  }

  async createPortalSession(userId: string) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: await this.getOrCreateCustomer(userId),
      return_url: `${this.config.get('FRONTEND_URL', { infer: true })}/billing`,
    });
    return { url: session.url };
  }

  async getSubscription(userId: string) {
    const subscription = await this.db.query.subscriptions.findFirst({
      columns: {
        id: true,
        status: true,
        priceId: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
      where: eq(subscriptions.userId, userId),
      orderBy: desc(subscriptions.createdAt),
    });
    return subscription ?? null;
  }

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

  async handleEvent(event: Stripe.Event): Promise<void> {
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

  private async getOrCreateCustomer(userId: string): Promise<string> {
    const user = await this.users.getById(userId);
    if (user.stripeCustomerId) return user.stripeCustomerId;

    // The idempotency key makes concurrent first checkouts share one customer.
    const customer = await this.stripe.customers.create(
      { email: user.email, name: user.name ?? undefined, metadata: { userId } },
      { idempotencyKey: `customer-${userId}` },
    );
    await this.db
      .update(users)
      .set({ stripeCustomerId: customer.id })
      .where(and(eq(users.id, userId), isNull(users.stripeCustomerId)));
    return customer.id;
  }
}
