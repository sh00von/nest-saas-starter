import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type UserEvent, UserEvents } from '../users/users.events.js';
import { FilesService } from './files.service.js';

/** Reacts to user lifecycle events from the users module. */
@Injectable()
export class FilesListener {
  constructor(private readonly files: FilesService) {}

  /**
   * Deletes the user's objects from S3 before the user is deleted. If S3
   * fails, the deletion is aborted rather than leaving orphaned files.
   */
  @OnEvent(UserEvents.Deleting, {
    async: true,
    promisify: true,
    suppressErrors: false,
  })
  onUserDeleting({ user }: UserEvent): Promise<void> {
    return this.files.removeAllObjects(user.id);
  }
}
