import { Injectable } from '@nestjs/common';
import { type Mail, MailTransport } from './mail.transport.js';

export type { Mail } from './mail.transport.js';

/**
 * What the rest of the app uses to send email.
 */
@Injectable()
export class MailService {
  constructor(private readonly transport: MailTransport) {}

  send(mail: Mail): Promise<void> {
    return this.transport.send(mail);
  }
}
