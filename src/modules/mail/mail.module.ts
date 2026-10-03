import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

/** Global: inject MailService anywhere to send email. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
