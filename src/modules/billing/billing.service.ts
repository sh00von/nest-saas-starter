import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNull } from 'drizzle-orm';
import Stripe from 'stripe';
import { buildUrl } from '../../common/url.js';
import type { Env } from '../../config/env.js';
import { type Database, InjectDb } from '../../database/database.module.js';
import { subscriptions, users } from '../../database/schema/index.js';
import { UsersService } from '../users/users.service.js';
import { InjectStripe } from './stripe.provider.js';

/** What users do: subscribe, manage billing, read their subscription. */
@Injectable()
export class BillingService {
  constructor(
    @InjectStripe() private readonly stripe: Stripe,
    @InjectDb() private readonly db: Database,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createCheckoutSession(userId: string, priceId: string) {
    const allowed = this.config.get('STRIPE_PRICE_IDS', { infer: true });
    if (!allowed.includes(priceId)) {
      throw new BadRequestException('Unknown price');
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: await this.getOrCreateCustomer(userId),
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { userId } },
      // Stripe fills in {CHECKOUT_SESSION_ID}; it must not be URL-encoded.
      success_url: `${this.frontendUrl('billing/success')}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: this.frontendUrl('billing'),
    });
    return { url: session.url! };
  }

  async createPortalSession(userId: string) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: await this.getOrCreateCustomer(userId),
      return_url: this.frontendUrl('billing'),
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

  private frontendUrl(path: string): string {
    return buildUrl(this.config.get('FRONTEND_URL', { infer: true }), path);
  }
}
