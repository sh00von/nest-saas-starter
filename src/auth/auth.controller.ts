import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { Env } from '../config/env.js';
import { type AuthResult, AuthService } from './auth.service.js';
import {
  AuthResponseDto,
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  SessionDto,
} from './dto/auth.dto.js';
import { TokenService } from './token.service.js';

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/auth';
const STRICT_LIMIT = { default: { limit: 5, ttl: 60_000 } };

const tokenTransportHeader = ApiHeader({
  name: 'x-token-transport',
  required: false,
  description:
    'Send `body` to receive the refresh token in the response body (mobile/CLI). Browsers should omit it and use the httpOnly cookie.',
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Create an account and start a session. */
  @Public()
  @Throttle(STRICT_LIMIT)
  @tokenTransportHeader
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(req, res, await this.auth.register(dto, meta(req)));
  }

  /** Exchange email and password for an access token and refresh token. */
  @Public()
  @Throttle(STRICT_LIMIT)
  @tokenTransportHeader
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(req, res, await this.auth.login(dto, meta(req)));
  }

  /**
   * Rotate the refresh token (from the cookie or the body) and issue a new
   * access token. Reusing an old refresh token revokes the whole session.
   */
  @Public()
  @tokenTransportHeader
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const token =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ??
      dto.refreshToken;
    if (!token) throw new UnauthorizedException('Missing refresh token');
    try {
      return this.respond(req, res, await this.auth.refresh(token));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  /** End the current session. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.sessionId);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  /** End every session of the current user, on all devices. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  /** Change password; every other session is signed out. */
  @ApiBearerAuth()
  @Throttle(STRICT_LIMIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.auth.changePassword(user.id, user.sessionId, dto);
  }

  /** Active sessions (devices) of the current user. */
  @ApiBearerAuth()
  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    const sessions = await this.tokens.listActive(user.id);
    return sessions.map((s) => ({ ...s, current: s.id === user.sessionId }));
  }

  /** Revoke one of the current user's sessions. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!(await this.tokens.revoke(id, user.id))) {
      throw new NotFoundException('Session not found');
    }
  }

  private respond(
    req: Request,
    res: Response,
    result: AuthResult,
  ): AuthResponseDto {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.cookieOptions(),
      expires: result.refreshTokenExpiresAt,
    });
    const wantsBody = req.headers['x-token-transport'] === 'body';
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      refreshToken: wantsBody ? result.refreshToken : undefined,
      user: result.user,
    };
  }

  private cookieOptions(): CookieOptions {
    const sameSite = this.config.get('COOKIE_SAME_SITE', { infer: true });
    return {
      httpOnly: true,
      // SameSite=None is only accepted by browsers on secure cookies.
      secure:
        sameSite === 'none' ||
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite,
      path: COOKIE_PATH,
    };
  }
}

function meta(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}
