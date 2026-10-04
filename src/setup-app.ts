import {
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { API_VERSION } from './common/api-version.js';
import type { Env } from './config/env.js';

/**
 * Global middleware, pipes and docs. Shared by main.ts and the e2e tests so
 * tests exercise the same app that ships.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService<Env, true>);
  const express = app as NestExpressApplication;
  app.useLogger(app.get(Logger));

  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) express.set('trust proxy', trustProxy);

  // The API only serves JSON (plus the docs page, which loads Scalar from a
  // CDN), so a Content-Security-Policy adds nothing here.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Routes are served under /v1/...
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Nest SaaS Starter API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addCookieAuth('refresh_token')
      .build(),
  );
  // Raw spec at /openapi.json (for codegen); Scalar UI at /docs.
  SwaggerModule.setup('docs', app, document, {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: 'openapi.json',
  });
  app.use('/docs', apiReference({ content: document }));
}
