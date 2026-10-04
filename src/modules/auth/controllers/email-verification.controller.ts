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
import { TokenDto } from '../dto/auth.dto.js';
import { EmailVerificationService } from '../services/email-verification.service.js';

@ApiTags('Auth')
@Controller('auth/verify-email')
export class EmailVerificationController {
  constructor(private readonly verification: EmailVerificationService) {}

  /** Mark the email as verified with the emailed token. */
  @Public()
  @UseGuards(JsonOnlyGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  verify(@Body() dto: TokenDto): Promise<void> {
    return this.verification.verify(dto.token);
  }

  /** Send the verification email again. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend')
  resend(@CurrentUser() user: AuthUser): Promise<void> {
    return this.verification.resend(user.id);
  }
}
