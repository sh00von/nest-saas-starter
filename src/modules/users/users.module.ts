import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/** User records, profile and admin endpoints. Emits `UserEvents`. */
@Module({
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
