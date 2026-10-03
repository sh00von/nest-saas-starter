import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { BillingService } from './billing.service.js';
import {
  CreateCheckoutDto,
  CurrentSubscriptionDto,
  RedirectUrlDto,
} from './dto/billing.dto.js';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Start a Stripe Checkout session; redirect the user to the returned URL. */
  @HttpCode(HttpStatus.OK)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCheckoutDto,
  ): Promise<RedirectUrlDto> {
    return this.billing.createCheckoutSession(user.id, dto.priceId);
  }

  /** Open the Stripe customer portal to manage or cancel the subscription. */
  @HttpCode(HttpStatus.OK)
  @Post('portal')
  portal(@CurrentUser() user: AuthUser): Promise<RedirectUrlDto> {
    return this.billing.createPortalSession(user.id);
  }

  /** The current user's latest subscription (`null` if they never subscribed). */
  @Get('subscription')
  async subscription(
    @CurrentUser() user: AuthUser,
  ): Promise<CurrentSubscriptionDto> {
    return { subscription: await this.billing.getSubscription(user.id) };
  }
}
