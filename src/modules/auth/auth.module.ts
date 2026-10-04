import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../../config/env.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { EmailVerificationController } from './controllers/email-verification.controller.js';
import { PasswordController } from './controllers/password.controller.js';
import { SessionsController } from './controllers/sessions.controller.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { UserBannedListener } from './listeners/user-banned.listener.js';
import { AccessTokenService } from './services/access-token.service.js';
import { AuthService } from './services/auth.service.js';
import { EmailTokenService } from './services/email-token.service.js';
import { EmailVerificationService } from './services/email-verification.service.js';
import { PasswordService } from './services/password.service.js';
import { RefreshCookieService } from './services/refresh-cookie.service.js';
import { SessionService } from './services/session.service.js';

/**
 * Email/password auth, sessions and refresh tokens, password reset and email
 * verification. Also installs the global JWT and role guards.
 */
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
          algorithm: 'HS256',
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [
    AuthController,
    PasswordController,
    EmailVerificationController,
    SessionsController,
  ],
  providers: [
    AccessTokenService,
    AuthService,
    EmailTokenService,
    EmailVerificationService,
    PasswordService,
    RefreshCookieService,
    SessionService,
    UserBannedListener,
    // Order matters: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  // For other sign-in modules (e.g. Google) to start sessions.
  exports: [AuthService, SessionService, RefreshCookieService],
})
export class AuthModule {}
