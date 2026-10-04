import { type ArgumentsHost, NotFoundException } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import {
  AllExceptionsFilter,
  type ErrorBody,
} from './all-exceptions.filter.js';

function run(exception: unknown): { status: number; body: ErrorBody } {
  let result!: { status: number; body: ErrorBody };
  const adapterHost = {
    httpAdapter: {
      reply: (_res: unknown, body: ErrorBody, status: number) => {
        result = { status, body };
      },
    },
  } as unknown as HttpAdapterHost;
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1', originalUrl: '/v1/things' }),
      getResponse: () => ({}),
    }),
  } as ArgumentsHost;
  new AllExceptionsFilter(adapterHost).catch(exception, host);
  return result;
}

/** Shaped like Drizzle's DrizzleQueryError wrapping a postgres.js error. */
function dbError(code: string): Error {
  return new Error('Failed query', {
    cause: Object.assign(new Error('pg'), { code }),
  });
}

describe('AllExceptionsFilter', () => {
  it('keeps HTTP errors and adds request context', () => {
    const { status, body } = run(new NotFoundException('No such thing'));
    expect(status).toBe(404);
    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'No such thing',
      requestId: 'req-1',
      path: '/v1/things',
    });
  });

  it.each([
    ['23505', 409],
    ['23503', 409],
    ['22P02', 400],
  ])('maps Postgres error %s to %i', (code, expected) => {
    expect(run(dbError(code)).status).toBe(expected);
  });

  it('hides unexpected errors behind a bare 500', () => {
    const { status, body } = run(new Error('secret connection string'));
    expect(status).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
