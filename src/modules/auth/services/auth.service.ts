import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  hashPassword,
  verifyPassword,
} from '../../../common/crypto/password.js';
import type { User } from '../../../database/schema/index.js';
import { UserDto } from '../../users/dto/user.dto.js';
import { UsersService } from '../../users/users.service.js';
import type { LoginDto, RegisterDto } from '../dto/auth.dto.js';
import { AccessTokenService } from './access-token.service.js';
import { type SessionMeta, SessionService } from './session.service.js';

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: UserDto;
}

/**
 * Email/password sign-up and sign-in, and token refresh. Other sign-in
 * methods (e.g. Google) call `startSession` once they know the user.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email is already registered');
    }
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      passwordHash: await hashPassword(dto.password),
    });
    return this.startSession(user, meta);
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const valid = await verifyPassword(user?.passwordHash, dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.startSession(user, meta);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const rotated = await this.sessions.rotate(refreshToken);
    const user = await this.users.findById(rotated.userId);
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    return this.buildResult(user, rotated.sessionId, rotated);
  }

  async startSession(user: User, meta: SessionMeta): Promise<AuthResult> {
    const issued = await this.sessions.createSession(user.id, meta);
    return this.buildResult(user, issued.sessionId, issued);
  }

  private async buildResult(
    user: User,
    sessionId: string,
    issued: { refreshToken: string; expiresAt: Date },
  ): Promise<AuthResult> {
    return {
      accessToken: await this.accessTokens.sign({
        sub: user.id,
        role: user.role,
        sid: sessionId,
      }),
      expiresIn: this.accessTokens.ttlSeconds,
      refreshToken: issued.refreshToken,
      refreshTokenExpiresAt: issued.expiresAt,
      user: UserDto.from(user),
    };
  }
}
