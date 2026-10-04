import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { MAIL_QUEUE } from './mail.constants.js';
import { MailProcessor } from './mail.processor.js';
import { MailService } from './mail.service.js';
import { MailTransport } from './mail.transport.js';

/** Global: inject MailService anywhere to send email. */
@Module({})
export class MailModule {
  /** `queue: true` (needs the core queue, i.e. REDIS_URL) enables retries. */
  static forRoot({ queue }: { queue: boolean }): DynamicModule {
    return {
      module: MailModule,
      global: true,
      imports: queue ? [BullModule.registerQueue({ name: MAIL_QUEUE })] : [],
      providers: [
        MailTransport,
        MailService,
        ...(queue ? [MailProcessor] : []),
      ],
      exports: [MailService],
    };
  }
}
