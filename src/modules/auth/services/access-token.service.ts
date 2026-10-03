import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../../config/env.js';
import type { UserRole } from '../../../database/schema/index.js';

export interface AccessTokenPayload {
  /** User id */
  sub: string;
  role: UserRole;
  /** Session id, so a request knows which session it belongs to. */
  sid: string;
}

/** Signs and verifies the short-lived JWT access tokens. */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get ttlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  sign(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  /** Throws if the token is malformed, tampered with or expired. */
  verify(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }
}
