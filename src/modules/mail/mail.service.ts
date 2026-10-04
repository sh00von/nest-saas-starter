import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { MAIL_QUEUE } from './mail.constants.js';
import { type Mail, MailTransport } from './mail.transport.js';

export type { Mail } from './mail.transport.js';

/**
 * What the rest of the app uses to send email. With Redis, emails go on a
 * queue and are retried with backoff if SMTP fails; without it, they are
 * delivered immediately.
 */
@Injectable()
export class MailService {
  constructor(
    private readonly transport: MailTransport,
    @Optional() @InjectQueue(MAIL_QUEUE) private readonly queue?: Queue<Mail>,
  ) {}

  async send(mail: Mail): Promise<void> {
    if (!this.queue) return this.transport.send(mail);
    await this.queue.add('send', mail, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }
}
