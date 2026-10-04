import type { User } from '../../database/schema/index.js';

/**
 * Events other modules can react to without the users module knowing about
 * them (e.g. mail sends a verification email, billing cancels Stripe).
 */
export const UserEvents = {
  /** Emitted after a user is created by any sign-up method. */
  Registered: 'user.registered',
  /**
   * Emitted (and awaited) before a user is deleted. A listener that throws
   * aborts the deletion, so cleanup like cancelling billing cannot be skipped.
   */
  Deleting: 'user.deleting',
  /** Emitted after an admin bans a user; auth ends all their sessions. */
  Banned: 'user.banned',
} as const;

export interface UserEvent {
  user: User;
}
