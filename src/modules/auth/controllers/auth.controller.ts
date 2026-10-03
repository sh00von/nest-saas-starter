import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  type AuthUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { JsonOnlyGuard } from '../../../common/guards/json-only.guard.js';
import {
  AuthResponseDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
} from '../dto/auth.dto.js';
import { type AuthResult, AuthService } from '../services/auth.service.js';
import { RefreshCookieService } from '../services/refresh-cookie.service.js';
import { SessionService } from '../services/session.service.js';
import { STRICT_LIMIT, sessionMeta } from './shared.js';

/** Where the refresh token travels: an httpOnly cookie, or the JSON body. */
type Transport = 'cookie' | 'body';

const tokenTransportHeader = ApiHeader({
  name: 'x-token-transport',
  required: false,
  description:
    'Send `body` to receive the refresh token in the response body instead of a cookie (mobile/CLI clients).',
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly cookie: RefreshCookieService,
  ) {}

  /** Create an account and start a session. A verification email is sent. */
  @Public()
  @UseGuards(JsonOnlyGuard)
  @Throttle(STRICT_LIMIT)
  @tokenTransportHeader
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.auth.register(dto, sessionMeta(req));
    return this.respond(res, result, requestedTransport(req));
  }

  /** Exchange email and password for an access token and refresh token. */
  @Public()
  @UseGuards(JsonOnlyGuard)
  @Throttle(STRICT_LIMIT)
  @tokenTransportHeader
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.auth.login(dto, sessionMeta(req));
    return this.respond(res, result, requestedTransport(req));
  }

  /**
   * Rotate the refresh token and issue a new access token. The new refresh
   * token goes back the way the old one came: cookie in, cookie out; body
   * in, body out. Reusing an old refresh token revokes the whole session.
   */
  @Public()
  @UseGuards(JsonOnlyGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const transport: Transport = dto.refreshToken ? 'body' : 'cookie';
    const token = dto.refreshToken ?? this.cookie.read(req);
    if (!token) throw new UnauthorizedException('Missing refresh token');
    try {
      return this.respond(res, await this.auth.refresh(token), transport);
    } catch (error) {
      if (transport === 'cookie') this.cookie.clear(res);
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
    await this.sessions.revoke(user.sessionId);
    this.cookie.clear(res);
  }

  /** End every session of the current user, on all devices. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revokeAll(user.id);
    this.cookie.clear(res);
  }

  private respond(
    res: Response,
    result: AuthResult,
    transport: Transport,
  ): AuthResponseDto {
    if (transport === 'cookie') {
      this.cookie.set(res, result.refreshToken, result.refreshTokenExpiresAt);
    }
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      refreshToken: transport === 'body' ? result.refreshToken : undefined,
      user: result.user,
    };
  }
}

function requestedTransport(req: Request): Transport {
  return req.headers['x-token-transport'] === 'body' ? 'body' : 'cookie';
}
