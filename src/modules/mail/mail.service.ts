import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';
import type { MailContent } from './templates/index.js';

export interface Mail extends MailContent {
  to: string;
}

/**
 * Sends mail over SMTP. Without SMTP_HOST, development prints each email to
 * the console; production only logs that it was dropped, because emails carry
 * login-equivalent links that must not end up in logs.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport?: Transporter;

  constructor(private readonly config: ConfigService<Env, true>) {
    const host = config.get('SMTP_HOST', { infer: true });
    if (host) {
      const port = config.get('SMTP_PORT', { infer: true });
      const user = config.get('SMTP_USER', { infer: true });
      this.transport = createTransport({
        host,
        port,
        // 465 is implicit TLS; other ports upgrade with STARTTLS.
        secure: port === 465,
        auth: user
          ? { user, pass: config.get('SMTP_PASS', { infer: true }) }
          : undefined,
      });
    }
  }

  async send(mail: Mail): Promise<void> {
    if (this.transport) {
      await this.transport.sendMail({
        from: this.config.get('MAIL_FROM', { infer: true }),
        ...mail,
      });
    } else if (this.config.get('NODE_ENV', { infer: true }) !== 'production') {
      this.logger.log(
        `\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`,
      );
    } else {
      this.logger.warn(`SMTP not configured; dropped email "${mail.subject}"`);
    }
  }
}
