import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { count, desc, eq } from 'drizzle-orm';
import { verifyPassword } from '../../common/crypto/password.js';
import { type Database, InjectDb } from '../../database/database.module.js';
import {
  type NewUser,
  type User,
  type UserRole,
  users,
} from '../../database/schema/index.js';
import { UserDto } from './dto/user.dto.js';
import { type UserEvent, UserEvents } from './users.events.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly events: EventEmitter2,
  ) {}

  findById(id: string): Promise<User | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  findByEmail(email: string): Promise<User | undefined> {
    return this.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Creates a user and announces it with `user.registered`. */
  async create(values: NewUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values({ ...values, email: values.email.toLowerCase() })
      .returning();
    this.events.emit(UserEvents.Registered, { user } satisfies UserEvent);
    return user;
  }

  async update(
    id: string,
    values: Partial<Omit<NewUser, 'id' | 'email'>>,
  ): Promise<User> {
    const [user] = await this.db
      .update(users)
      .set(values)
      .where(eq(users.id, id))
      .returning();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Permanently deletes the user and everything that cascades from it.
   * Accounts with a password must confirm it.
   */
  async deleteAccount(id: string, password?: string): Promise<void> {
    const user = await this.getById(id);
    if (
      user.passwordHash &&
      !(await verifyPassword(user.passwordHash, password ?? ''))
    ) {
      throw new UnauthorizedException('Password is incorrect');
    }
    // Listeners (e.g. billing) clean up first; if one fails, nothing is deleted.
    await this.events.emitAsync(UserEvents.Deleting, {
      user,
    } satisfies UserEvent);
    await this.db.delete(users).where(eq(users.id, id));
  }

  /** Admin: change a user's role. Takes effect at their next token refresh. */
  async setRole(actorId: string, userId: string, role: UserRole) {
    this.assertNotSelf(actorId, userId);
    return this.update(userId, { role });
  }

  /** Admin: block sign-in and end every session of the user. */
  async ban(actorId: string, userId: string): Promise<User> {
    this.assertNotSelf(actorId, userId);
    const user = await this.update(userId, { bannedAt: new Date() });
    await this.events.emitAsync(UserEvents.Banned, {
      user,
    } satisfies UserEvent);
    return user;
  }

  /** Admin: allow the user to sign in again. */
  unban(actorId: string, userId: string): Promise<User> {
    this.assertNotSelf(actorId, userId);
    return this.update(userId, { bannedAt: null });
  }

  async list(page: number, limit: number) {
    const [items, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ total: count() }).from(users),
    ]);
    return { items: items.map((u) => UserDto.from(u)), total, page, limit };
  }

  /** Admins cannot lock themselves out. */
  private assertNotSelf(actorId: string, userId: string): void {
    if (actorId === userId) {
      throw new BadRequestException('You cannot do this to your own account');
    }
  }
}
