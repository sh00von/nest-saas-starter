import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { buildUrl } from '../../common/url.js';
import type { Env } from '../../config/env.js';
import { sessionMeta, STRICT_LIMIT } from '../auth/controllers/shared.js';
import { RefreshCookieService } from '../auth/services/refresh-cookie.service.js';
import { GoogleAuthService } from './google-auth.service.js';

const FLOW_COOKIE = 'google_oauth';
const FLOW_COOKIE_PATH = '/auth/google';
const FLOW_TTL_MS = 10 * 60 * 1000;

/**
 * Browser redirect flow:
 * frontend links to `GET /auth/google` → Google → `GET /auth/google/callback`
 * → redirect to `FRONTEND_URL/auth/callback` with the refresh cookie set.
 * The frontend then calls `POST /auth/refresh` to get an access token.
 * On failure it redirects to `FRONTEND_URL/login?error=google`.
 */
@ApiTags('Auth')
@Public()
@Throttle(STRICT_LIMIT)
@Controller('auth/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(
    private readonly google: GoogleAuthService,
    private readonly refreshCookie: RefreshCookieService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Start "Sign in with Google" (open this in the browser, not via fetch). */
  @Get()
  async start(@Res() res: Response): Promise<void> {
    const { url, state, codeVerifier } =
      await this.google.createAuthorization();
    res.cookie(FLOW_COOKIE, `${state}.${codeVerifier}`, {
      ...this.refreshCookie.options(FLOW_COOKIE_PATH),
      // Lax so the cookie comes back on Google's top-level redirect.
      sameSite: 'lax',
      maxAge: FLOW_TTL_MS,
    });
    res.redirect(url);
  }

  /** Google redirects here after the user signs in. */
  @Get('callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<void> {
    const flow = (req.cookies as Record<string, string> | undefined)?.[
      FLOW_COOKIE
    ];
    res.clearCookie(FLOW_COOKIE, {
      ...this.refreshCookie.options(FLOW_COOKIE_PATH),
      sameSite: 'lax',
    });
    const [expectedState, codeVerifier] = flow?.split('.') ?? [];

    if (!code || !state || !codeVerifier || state !== expectedState) {
      return this.redirect(res, 'login', { error: 'google' });
    }
    try {
      const result = await this.google.signIn(
        code,
        codeVerifier,
        sessionMeta(req),
      );
      this.refreshCookie.set(
        res,
        result.refreshToken,
        result.refreshTokenExpiresAt,
      );
      this.redirect(res, 'auth/callback');
    } catch (error) {
      this.logger.warn(`Google sign-in failed: ${String(error)}`);
      this.redirect(res, 'login', { error: 'google' });
    }
  }

  private redirect(
    res: Response,
    path: string,
    params?: Record<string, string>,
  ): void {
    res.redirect(
      buildUrl(this.config.get('FRONTEND_URL', { infer: true }), path, params),
    );
  }
}
