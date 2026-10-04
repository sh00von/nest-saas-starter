import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MAIL_QUEUE } from './mail.constants.js';
import { type Mail, MailTransport } from './mail.transport.js';

/** Worker for the mail queue. A thrown error makes BullMQ retry the job. */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(private readonly transport: MailTransport) {
    super();
  }

  process(job: Job<Mail>): Promise<void> {
    return this.transport.send(job.data);
  }
}
