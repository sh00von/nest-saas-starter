import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, verify } from 'argon2';
import type { User } from '../database/schema/index.js';
import { UserDto } from '../users/dto/user.dto.js';
import { UsersService } from '../users/users.service.js';
import type {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
} from './dto/auth.dto.js';
import { type SessionMeta, TokenService } from './token.service.js';

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: UserDto;
}

@Injectable()
export class AuthService {
  // Verified against when the email is unknown, so login takes the same time
  // whether or not the account exists.
  private readonly dummyHash = hash('timing-equalizer');

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta): Promise<AuthResult> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('Email is already registered');
    }
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      passwordHash: await hash(dto.password),
    });
    return this.startSession(user, meta);
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    const valid = await verify(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.startSession(user, meta);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const rotated = await this.tokens.rotate(refreshToken);
    const user = await this.users.findById(rotated.userId);
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    return this.buildResult(user, rotated.sessionId, rotated);
  }

  async logout(sessionId: string): Promise<void> {
    await this.tokens.revoke(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAll(userId);
  }

  /** Changes the password and signs out every other session. */
  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.users.getById(userId);
    if (!(await verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.users.update(userId, {
      passwordHash: await hash(dto.newPassword),
    });
    await this.tokens.revokeAll(userId, sessionId);
  }

  private async startSession(
    user: User,
    meta: SessionMeta,
  ): Promise<AuthResult> {
    const issued = await this.tokens.createSession(user.id, meta);
    return this.buildResult(user, issued.sessionId, issued);
  }

  private async buildResult(
    user: User,
    sessionId: string,
    issued: { refreshToken: string; expiresAt: Date },
  ): Promise<AuthResult> {
    return {
      accessToken: await this.tokens.signAccessToken({
        sub: user.id,
        role: user.role,
        sid: sessionId,
      }),
      expiresIn: this.tokens.accessTokenTtlSeconds,
      refreshToken: issued.refreshToken,
      refreshTokenExpiresAt: issued.expiresAt,
      user: UserDto.from(user),
    };
  }
}
