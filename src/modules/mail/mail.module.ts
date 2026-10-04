import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { MailTransport } from './mail.transport.js';

/** Global: inject MailService anywhere to send email. */
@Global()
@Module({
  providers: [MailTransport, MailService],
  exports: [MailService],
})
export class MailModule {}
