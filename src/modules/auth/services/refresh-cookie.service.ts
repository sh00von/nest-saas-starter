import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { API_PREFIX } from '../../../common/api-version.js';
import type { Env } from '../../../config/env.js';

const NAME = 'refresh_token';

/** The httpOnly cookie that carries the refresh token for browsers. */
@Injectable()
export class RefreshCookieService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  read(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[NAME];
  }

  set(res: Response, token: string, expires: Date): void {
    res.cookie(NAME, token, { ...this.options(), expires });
  }

  clear(res: Response): void {
    res.clearCookie(NAME, this.options());
  }

  /** Shared by every short-lived auth cookie. */
  options(path = `${API_PREFIX}/auth`): CookieOptions {
    const sameSite = this.config.get('COOKIE_SAME_SITE', { infer: true });
    return {
      httpOnly: true,
      // SameSite=None is only accepted by browsers on secure cookies.
      secure:
        sameSite === 'none' ||
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite,
      path,
    };
  }
}
