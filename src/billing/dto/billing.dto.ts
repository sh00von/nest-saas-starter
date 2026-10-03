import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateCheckoutDto {
  /** A Stripe price id listed in STRIPE_PRICE_IDS. */
  @IsString()
  @MaxLength(255)
  priceId: string;
}

export class RedirectUrlDto {
  url: string;
}

export class SubscriptionDto {
  id: string;
  /** Stripe subscription status, e.g. `active`, `trialing`, `past_due`, `canceled`. */
  status: string;
  priceId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export class CurrentSubscriptionDto {
  @ApiProperty({ type: SubscriptionDto, nullable: true })
  subscription: SubscriptionDto | null;
}
