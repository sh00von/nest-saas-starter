import { Injectable, NotFoundException } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';
import { type Database, InjectDb } from '../database/database.module.js';
import { type NewUser, type User, users } from '../database/schema/index.js';
import { UserDto } from './dto/user.dto.js';

@Injectable()
export class UsersService {
  constructor(@InjectDb() private readonly db: Database) {}

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

  async create(values: NewUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values({ ...values, email: values.email.toLowerCase() })
      .returning();
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
}
