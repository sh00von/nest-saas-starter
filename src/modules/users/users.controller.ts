import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserDto, UserListDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The authenticated user's profile. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return UserDto.from(await this.users.getById(user.id));
  }

  /** Update the authenticated user's profile. */
  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return UserDto.from(await this.users.update(user.id, dto));
  }

  /**
   * Permanently delete the account, its sessions and its data. An active
   * Stripe subscription is cancelled immediately.
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('me')
  deleteMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    return this.users.deleteAccount(user.id, dto.password);
  }

  /** List all users (admin only). */
  @Roles('admin')
  @Get()
  list(@Query() query: ListUsersDto): Promise<UserListDto> {
    return this.users.list(query.page, query.limit);
  }

  /** Get a user by id (admin only). */
  @Roles('admin')
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return UserDto.from(await this.users.getById(id));
  }
}
