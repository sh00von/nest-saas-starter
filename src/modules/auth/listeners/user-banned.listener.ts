import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type UserEvent, UserEvents } from '../../users/users.events.js';
import { SessionService } from '../services/session.service.js';

/** Ends every session of a user an admin has banned. */
@Injectable()
export class UserBannedListener {
  constructor(private readonly sessions: SessionService) {}

  @OnEvent(UserEvents.Banned, {
    async: true,
    promisify: true,
    suppressErrors: false,
  })
  onUserBanned({ user }: UserEvent): Promise<void> {
    return this.sessions.revokeAll(user.id);
  }
}
