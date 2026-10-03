import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { buildUrl } from '../../common/url.js';
import type { Env } from '../../config/env.js';
import { type Database, InjectDb } from '../../database/database.module.js';
import { accounts, type User } from '../../database/schema/index.js';
import type { SessionMeta } from '../auth/services/session.service.js';
import { type AuthResult, AuthService } from '../auth/services/auth.service.js';
import { SessionService } from '../auth/services/session.service.js';
import { UsersService } from '../users/users.service.js';

const PROVIDER = 'google';

export interface GoogleAuthorization {
  url: string;
  /** Must come back unchanged on the callback (CSRF protection). */
  state: string;
  /** PKCE secret; needed to redeem the authorization code. */
  codeVerifier: string;
}

interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
}

/** "Sign in with Google" via OAuth 2.0 authorization code + PKCE. */
@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    config: ConfigService<Env, true>,
  ) {
    this.clientId = config.get('GOOGLE_CLIENT_ID', { infer: true })!;
    this.client = new OAuth2Client({
      clientId: this.clientId,
      clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      redirectUri: buildUrl(
        config.get('API_URL', { infer: true }),
        'auth/google/callback',
      ),
    });
  }

  async createAuthorization(): Promise<GoogleAuthorization> {
    const { codeVerifier, codeChallenge } =
      await this.client.generateCodeVerifierAsync();
    const state = randomBytes(16).toString('base64url');
    const url = this.client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: 'select_account',
    });
    return { url, state, codeVerifier: codeVerifier! };
  }

  /** Redeems the authorization code and signs the user in. */
  async signIn(
    code: string,
    codeVerifier: string,
    meta: SessionMeta,
  ): Promise<AuthResult> {
    const { tokens } = await this.client.getToken({ code, codeVerifier });
    if (!tokens.id_token) throw new UnauthorizedException('No ID token');

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account has no verified email');
    }

    const user = await this.findOrCreateUser({
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
    });
    return this.auth.startSession(user, meta);
  }

  private async findOrCreateUser(profile: GoogleProfile): Promise<User> {
    const linked = await this.db.query.accounts.findFirst({
      where: and(
        eq(accounts.provider, PROVIDER),
        eq(accounts.providerAccountId, profile.sub),
      ),
      with: { user: true },
    });
    if (linked) return linked.user;

    let user = await this.users.findByEmail(profile.email);
    if (user && !user.emailVerifiedAt) {
      // Whoever registered this email never proved they own it, and Google
      // just proved this person does. Drop the unverified password and its
      // sessions so a squatter cannot keep access to the account.
      user = await this.users.update(user.id, {
        passwordHash: null,
        emailVerifiedAt: new Date(),
      });
      await this.sessions.revokeAll(user.id);
    }
    user ??= await this.users.create({
      email: profile.email,
      name: profile.name,
      passwordHash: null,
      emailVerifiedAt: new Date(),
    });

    await this.db
      .insert(accounts)
      .values({
        userId: user.id,
        provider: PROVIDER,
        providerAccountId: profile.sub,
      })
      .onConflictDoNothing();
    return user;
  }
}
