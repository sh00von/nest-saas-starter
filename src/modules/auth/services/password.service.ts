import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  hashPassword,
  verifyPassword,
} from '../../../common/crypto/password.js';
import { buildUrl } from '../../../common/url.js';
import type { Env } from '../../../config/env.js';
import { MailService } from '../../mail/mail.service.js';
import { resetPassword } from '../../mail/templates/index.js';
import { UsersService } from '../../users/users.service.js';
import type { ChangePasswordDto, ResetPasswordDto } from '../dto/auth.dto.js';
import { EmailTokenService } from './email-token.service.js';
import { SessionService } from './session.service.js';

/** Change, forgot and reset password. */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly emailTokens: EmailTokenService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Changes the password and signs out every other session. */
  async change(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.users.getById(userId);
    if (!user.passwordHash) {
      throw new BadRequestException(
        'No password set; use "forgot password" to create one',
      );
    }
    if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.users.update(userId, {
      passwordHash: await hashPassword(dto.newPassword),
    });
    await this.sessions.revokeAll(userId, sessionId);
  }

  /**
   * Returns immediately and emails in the background, so neither the
   * response nor its timing reveals whether the email is registered.
   */
  forgot(email: string): void {
    this.sendResetEmail(email).catch((error: unknown) =>
      this.logger.error('Failed to send password reset email', error),
    );
  }

  /** Sets a new password from an emailed token and signs out every session. */
  async reset(dto: ResetPasswordDto): Promise<void> {
    const userId = await this.emailTokens.consume(dto.token, 'password_reset');
    const user = await this.users.getById(userId);
    await this.users.update(userId, {
      passwordHash: await hashPassword(dto.newPassword),
      // Receiving the link proves the user controls the inbox.
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    });
    await this.sessions.revokeAll(userId);
  }

  private async sendResetEmail(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    const token = await this.emailTokens.issue(user.id, 'password_reset');
    const url = buildUrl(
      this.config.get('FRONTEND_URL', { infer: true }),
      'reset-password',
      { token },
    );
    await this.mail.send({ to: user.email, ...resetPassword(user.email, url) });
  }
}
