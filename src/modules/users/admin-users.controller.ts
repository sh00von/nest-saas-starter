import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { SetRoleDto } from './dto/set-role.dto.js';
import { UserDto, UserListDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

/** User management for admins. */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  /** List all users, newest first. */
  @Get()
  list(@Query() query: ListUsersDto): Promise<UserListDto> {
    return this.users.list(query.page, query.limit);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return UserDto.from(await this.users.getById(id));
  }

  /** Change a user's role (applies at their next token refresh, ≤ 15 min). */
  @Patch(':id/role')
  async setRole(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ): Promise<UserDto> {
    return UserDto.from(await this.users.setRole(admin.id, id, dto.role));
  }

  /**
   * Ban a user: sign-in is blocked and every session ends. An access token
   * already issued keeps working until it expires (≤ 15 min).
   */
  @HttpCode(HttpStatus.OK)
  @Post(':id/ban')
  async ban(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserDto> {
    return UserDto.from(await this.users.ban(admin.id, id));
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/unban')
  async unban(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserDto> {
    return UserDto.from(await this.users.unban(admin.id, id));
  }
}
