import { ApiProperty } from '@nestjs/swagger';
import type { User, UserRole } from '../../../database/schema/index.js';

export class UserDto {
  id: string;
  email: string;
  name: string | null;
  @ApiProperty({ enum: ['user', 'admin'] })
  role: UserRole;
  emailVerified: boolean;
  /** False for accounts that only sign in with Google. */
  hasPassword: boolean;
  banned: boolean;
  createdAt: Date;

  static from(user: User): UserDto {
    return Object.assign(new UserDto(), {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      hasPassword: user.passwordHash !== null,
      banned: user.bannedAt !== null,
      createdAt: user.createdAt,
    });
  }
}

export class UserListDto {
  @ApiProperty({ type: [UserDto] })
  items: UserDto[];
  total: number;
  page: number;
  limit: number;
}
