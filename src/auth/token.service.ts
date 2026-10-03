import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { type Database, InjectDb } from '../database/database.module.js';
import { sessions, type UserRole } from '../database/schema/index.js';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  sid: string;
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface IssuedRefreshToken {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Splits `<session id>.<secret>`; returns null for anything malformed. */
export function parseRefreshToken(
  token: string,
): { sessionId: string; secret: string } | null {
  const [sessionId, secret, ...rest] = token.split('.');
  if (rest.length || !secret || !sessionId || !UUID_RE.test(sessionId)) {
    return null;
  }
  return { sessionId, secret };
}

@Injectable()
export class TokenService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  async createSession(
    userId: string,
    meta: SessionMeta,
  ): Promise<IssuedRefreshToken> {
    const secret = this.newSecret();
    const expiresAt = this.newExpiry();
    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        tokenHash: hashSecret(secret),
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 512),
        ip: meta.ip,
      })
      .returning({ id: sessions.id });
    return {
      sessionId: session.id,
      refreshToken: `${session.id}.${secret}`,
      expiresAt,
    };
  }

  /**
   * Exchanges a refresh token for a new one. The swap is a single conditional
   * UPDATE, so two concurrent refreshes with the same token cannot both win.
   * A token that fails the swap (replayed, expired or revoked) revokes its
   * session, which logs out whoever holds the current token as well.
   */
  async rotate(
    refreshToken: string,
  ): Promise<IssuedRefreshToken & { userId: string }> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) throw new UnauthorizedException('Invalid refresh token');

    const now = new Date();
    const secret = this.newSecret();
    const expiresAt = this.newExpiry();
    const [session] = await this.db
      .update(sessions)
      .set({ tokenHash: hashSecret(secret), expiresAt, lastUsedAt: now })
      .where(
        and(
          eq(sessions.id, parsed.sessionId),
          eq(sessions.tokenHash, hashSecret(parsed.secret)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .returning({ userId: sessions.userId });

    if (!session) {
      await this.revoke(parsed.sessionId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      userId: session.userId,
      sessionId: parsed.sessionId,
      refreshToken: `${parsed.sessionId}.${secret}`,
      expiresAt,
    };
  }

  async revoke(sessionId: string, userId?: string): Promise<boolean> {
    const revoked = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
          userId ? eq(sessions.userId, userId) : undefined,
        ),
      )
      .returning({ id: sessions.id });
    return revoked.length > 0;
  }

  async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
        ),
      );
  }

  listActive(userId: string) {
    return this.db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ip: sessions.ip,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(sessions.lastUsedAt);
  }

  private newSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  private newExpiry(): Date {
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
