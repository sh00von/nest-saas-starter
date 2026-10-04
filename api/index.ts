import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

const server: Express = express();
let isReady = false;
let readyPromise: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    rawBody: true,
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
  try {
    if (!isReady) {
      if (!readyPromise) {
        readyPromise = bootstrap().catch((err: unknown) => {
          readyPromise = null;
          throw err;
        });
      }
      await readyPromise;
    }
    server(req, res);
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.stack || err.message : String(err);
    console.error('Serverless Function Invocation Error:\n', errorMsg);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          statusCode: 500,
          error: 'FUNCTION_INVOCATION_FAILED',
          message:
            err instanceof Error
              ? err.message
              : 'Serverless initialization failed',
          details: errorMsg,
        }),
      );
    }
  }
}
