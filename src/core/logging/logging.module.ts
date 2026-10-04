import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from '../../config/env.js';

const REQUEST_ID = /^[\w.-]{1,128}$/;

/**
 * Reuses a well-formed incoming `x-request-id` (e.g. from a load balancer)
 * or creates one, and echoes it back so clients can quote it in bug reports.
 */
function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}

/**
 * Structured JSON logs (pino) with one line per request. Every log line made
 * while handling a request carries its `reqId`. Readable output in development.
 */
export const LoggingModule = LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      genReqId: requestId,
      // Credentials never reach the logs.
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
      transport:
        !process.env.VERCEL &&
        config.get('NODE_ENV', { infer: true }) === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  }),
});
