import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import type { Env } from './config/env.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Stripe verifies webhook signatures against the unparsed body.
    rawBody: true,
    instrument: process.env.OBSERVE_APP_KEY ? ObserveInstrument : undefined,
  });
  setupApp(app);

  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API on http://localhost:${port} — docs at /docs`, 'Bootstrap');
}
await bootstrap();
