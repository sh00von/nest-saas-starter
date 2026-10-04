import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Mail } from '../../src/modules/mail/mail.service.js';
import { MailTransport } from '../../src/modules/mail/mail.transport.js';
import { setupApp } from '../../src/setup-app.js';

/** Collects emails instead of sending them. */
export class MailOutbox {
  readonly sent: Mail[] = [];

  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }

  /** Waits for the next email to `to` (emails are sent in the background). */
  async next(to: string, timeoutMs = 5000): Promise<Mail> {
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

interface TestAppOptions {
  /** Extra env vars, e.g. to switch on an optional module. */
  env?: Record<string, string>;
  /** Provider overrides: [token, value]. */
  overrides?: [unknown, unknown][];
}

/**
 * Boots the real app with emails captured. AppModule is imported after `env`
 * is applied because optional modules are chosen at import time (vitest
 * isolates modules per test file).
 */
export async function createTestApp(options: TestAppOptions = {}) {
  try {
    // Also exposes vars outside the app schema (e.g. SEED_ADMIN_*) to tests.
    process.loadEnvFile();
  } catch {
    // no .env file (CI sets real env vars)
  }
  process.env.LOG_LEVEL ??= 'silent';
  Object.assign(process.env, options.env);
  const { AppModule } = await import('../../src/app.module.js');

  const outbox = new MailOutbox();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailTransport)
    .useValue(outbox);
  for (const [token, value] of options.overrides ?? []) {
    builder = builder.overrideProvider(token as string).useValue(value);
  }
  const moduleRef = await builder.compile();

  const app: INestApplication<App> = moduleRef.createNestApplication({
    bufferLogs: true,
  });
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

/** Registers a user and returns its tokens (body transport). */
export async function registerUser(
  t: TestApp,
  email: string,
  password = 'first-password',
) {
  const res = await t
    .http()
    .post('/v1/auth/register')
    .set('x-token-transport', 'body')
    .send({ email, password })
    .expect(201);
  return res.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
}
