import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { buildUrl } from '../../../common/url.js';
import type { Env } from '../../../config/env.js';
import type { User } from '../../../database/schema/index.js';
import { MailService } from '../../mail/mail.service.js';
import { verifyEmail } from '../../mail/templates/index.js';
import { type UserEvent, UserEvents } from '../../users/users.events.js';
import { UsersService } from '../../users/users.service.js';
import { EmailTokenService } from './email-token.service.js';

/** Sends verification links and marks emails as verified. */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly users: UsersService,
    private readonly emailTokens: EmailTokenService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Every new, unverified user gets a verification email. */
  @OnEvent(UserEvents.Registered, { async: true })
  async onUserRegistered({ user }: UserEvent): Promise<void> {
    if (user.emailVerifiedAt) return;
    try {
      await this.send(user);
    } catch (error) {
      this.logger.error('Failed to send verification email', error);
    }
  }

  /** Sends the email again; does nothing if already verified. */
  async resend(userId: string): Promise<void> {
    const user = await this.users.getById(userId);
    if (!user.emailVerifiedAt) await this.send(user);
  }

  async verify(token: string): Promise<void> {
    const userId = await this.emailTokens.consume(token, 'email_verification');
    await this.users.update(userId, { emailVerifiedAt: new Date() });
  }

  private async send(user: User): Promise<void> {
    const token = await this.emailTokens.issue(user.id, 'email_verification');
    const url = buildUrl(
      this.config.get('FRONTEND_URL', { infer: true }),
      'verify-email',
      { token },
    );
    await this.mail.send({ to: user.email, ...verifyEmail(user.email, url) });
  }
}
