import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../../../common/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator.js';
import { AccessTokenService } from '../services/access-token.service.js';

/**
 * Registered globally: every route needs a valid access token unless it is
 * marked `@Public()`. Access tokens are stateless, so a revoked session stays
 * usable until its access token expires (JWT_ACCESS_TTL_SECONDS).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const payload = await this.accessTokens.verify(token);
      request.user = {
        id: payload.sub,
        role: payload.role,
        sessionId: payload.sid,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return true;
  }
}
