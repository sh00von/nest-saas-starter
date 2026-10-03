import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { BillingService } from './billing.service.js';
import {
  CreateCheckoutDto,
  CurrentSubscriptionDto,
  RedirectUrlDto,
} from './dto/billing.dto.js';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Start a Stripe Checkout session; redirect the user to the returned URL. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCheckoutDto,
  ): Promise<RedirectUrlDto> {
    return this.billing.createCheckoutSession(user.id, dto.priceId);
  }

  /** Open the Stripe customer portal to manage or cancel the subscription. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('portal')
  portal(@CurrentUser() user: AuthUser): Promise<RedirectUrlDto> {
    return this.billing.createPortalSession(user.id);
  }

  /** The current user's latest subscription (`null` if they never subscribed). */
  @ApiBearerAuth()
  @Get('subscription')
  async subscription(
    @CurrentUser() user: AuthUser,
  ): Promise<CurrentSubscriptionDto> {
    return { subscription: await this.billing.getSubscription(user.id) };
  }

  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!signature || !req.rawBody) {
      throw new BadRequestException('Missing Stripe signature');
    }
    await this.billing.handleEvent(
      this.billing.constructEvent(req.rawBody, signature),
    );
    return { received: true };
  }
}
