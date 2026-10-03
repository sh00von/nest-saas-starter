import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * CSRF defence for routes that read or set auth cookies. Browsers only send
 * `Content-Type: application/json` cross-site after a CORS preflight, which
 * CORS_ORIGINS controls, so a hostile page cannot forge these requests with a
 * plain form or `fetch(..., { mode: 'no-cors' })`.
 */
@Injectable()
export class JsonOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const contentType = context.switchToHttp().getRequest<Request>().headers[
      'content-type'
    ];
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      throw new UnsupportedMediaTypeException(
        'Send Content-Type: application/json',
      );
    }
    return true;
  }
}
