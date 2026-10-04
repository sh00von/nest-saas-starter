import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator.js';
import { Public } from '../../../common/decorators/public.decorator.js';
import { JsonOnlyGuard } from '../../../common/guards/json-only.guard.js';
import {
  ChangePasswordDto,
  EmailDto,
  ResetPasswordDto,
} from '../dto/auth.dto.js';
import { PasswordService } from '../services/password.service.js';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JsonOnlyGuard)
export class PasswordController {
  constructor(private readonly passwords: PasswordService) {}

  /** Change password; every other session is signed out. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('change-password')
  change(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.passwords.change(user.id, user.sessionId, dto);
  }

  /**
   * Email a password reset link. Always returns 204, whether or not the
   * email is registered.
   */
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  forgot(@Body() dto: EmailDto): void {
    this.passwords.forgot(dto.email);
  }

  /** Set a new password with the emailed token; signs out every session. */
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.passwords.reset(dto);
  }
}
