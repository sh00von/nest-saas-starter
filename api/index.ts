import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import { AppModule } from '../dist/app.module.js';
import { setupApp } from '../dist/setup-app.js';

const server: Express = express();
let isReady = false;
let readyPromise: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bufferLogs: true,
  });
  setupApp(app);
  await app.init();
  isReady = true;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isReady) {
    if (!readyPromise) {
      readyPromise = bootstrap();
    }
    await readyPromise;
  }
  server(req, res);
}
