import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { StripeWebhookService } from './stripe-webhook.service.js';

/** Stripe calls this; authenticated by the `stripe-signature` header. */
@ApiExcludeController()
@Public()
// Unversioned: the URL is registered in the Stripe dashboard.
@Controller({ path: 'billing/webhook', version: VERSION_NEUTRAL })
export class StripeWebhookController {
  constructor(private readonly webhooks: StripeWebhookService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!signature || !req.rawBody) {
      throw new BadRequestException('Missing Stripe signature');
    }
    await this.webhooks.handle(
      this.webhooks.constructEvent(req.rawBody, signature),
    );
    return { received: true };
  }
}
