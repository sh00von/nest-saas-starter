import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator.js';
import { SessionDto } from '../dto/auth.dto.js';
import { SessionService } from '../services/session.service.js';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionService) {}

  /** Active sessions (devices) of the current user. */
  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    const sessions = await this.sessions.listActive(user.id);
    return sessions.map((s) => ({ ...s, current: s.id === user.sessionId }));
  }

  /** Revoke one of the current user's sessions. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!(await this.sessions.revoke(id, user.id))) {
      throw new NotFoundException('Session not found');
    }
  }
}
