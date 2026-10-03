import { Inject, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../../config/env.js';

const STRIPE = Symbol('STRIPE');

/** Inject the Stripe client: `constructor(@InjectStripe() stripe: Stripe)` */
export const InjectStripe = () => Inject(STRIPE);

export const stripeProvider: Provider = {
  provide: STRIPE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) =>
    new Stripe(config.get('STRIPE_SECRET_KEY', { infer: true })!),
};
