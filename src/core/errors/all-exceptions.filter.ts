import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';

/** The body of every error response. */
export interface ErrorBody {
  statusCode: number;
  /** Short name of the status, e.g. "Not Found". */
  error: string;
  /** Human-readable reason; a list for validation errors. */
  message: string | string[];
  /** Matches the `x-request-id` response header and the server logs. */
  requestId?: string;
  path: string;
  timestamp: string;
}

/** Postgres error codes that are the client's fault, not a server bug. */
const POSTGRES_ERRORS: Record<string, [HttpStatus, string]> = {
  '23505': [HttpStatus.CONFLICT, 'Resource already exists'],
  '23503': [HttpStatus.CONFLICT, 'Related resource is missing or in use'],
  '22P02': [HttpStatus.BAD_REQUEST, 'Malformed value'],
};

/**
 * Turns every thrown error into the same JSON shape. Unexpected errors are
 * logged with their stack and returned as a bare 500, so internals never
 * reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const [statusCode, message] = this.describe(exception);

    if (statusCode >= 500) {
      this.logger.error(exception);
    }

    const body: ErrorBody = {
      statusCode,
      error: HttpStatus[statusCode] ? toTitle(HttpStatus[statusCode]) : 'Error',
      message,
      requestId: req.id,
      path: req.originalUrl ?? req.url,
      timestamp: new Date().toISOString(),
    };
    this.adapterHost.httpAdapter.reply(ctx.getResponse(), body, statusCode);
  }

  private describe(exception: unknown): [number, string | string[]] {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response && 'message' in response
          ? (response.message as string | string[])
          : exception.message;
      return [exception.getStatus(), message];
    }
    const code = postgresCode(exception);
    if (code && POSTGRES_ERRORS[code]) return POSTGRES_ERRORS[code];
    return [HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'];
  }
}

/** Drizzle wraps driver errors; the Postgres code is on the cause. */
function postgresCode(error: unknown): string | undefined {
  for (let e = error; e && typeof e === 'object'; e = (e as Error).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

/** NOT_FOUND → "Not Found" */
function toTitle(name: string): string {
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}
