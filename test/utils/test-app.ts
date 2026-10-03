import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { type Mail, MailService } from '../../src/modules/mail/mail.service.js';
import { setupApp } from '../../src/setup-app.js';

/** Collects emails instead of sending them. */
export class MailOutbox {
  readonly sent: Mail[] = [];

  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }

  /** Waits for the next email to `to` (emails are sent in the background). */
  async next(to: string, timeoutMs = 2000): Promise<Mail> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = this.sent.findIndex((m) => m.to === to);
      if (index !== -1) return this.sent.splice(index, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No email to ${to}`);
  }

  /** The `token` query param of the link in an email. */
  static token(mail: Mail): string {
    const match = /[?&]token=([\w-]+)/.exec(mail.text);
    if (!match) throw new Error('No token in email');
    return match[1];
  }
}

export async function createTestApp() {
  const outbox = new MailOutbox();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(outbox)
    .compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return { app, outbox, http: () => request(app.getHttpServer()) };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** First `name=value` pair of a Set-Cookie header. */
export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const header = res.headers['set-cookie'] as string[] | undefined;
  if (!header?.[0]) throw new Error('No Set-Cookie header');
  return header[0].split(';')[0];
}
