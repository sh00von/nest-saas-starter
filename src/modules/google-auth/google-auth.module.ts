import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { GoogleAuthService } from './google-auth.service.js';

/** "Sign in with Google". Only loaded when GOOGLE_CLIENT_ID is set. */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService],
})
export class GoogleAuthModule {}
