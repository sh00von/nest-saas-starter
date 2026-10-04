import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { type UserRole, userRole } from '../../../database/schema/index.js';

export class SetRoleDto {
  @ApiProperty({ enum: userRole.enumValues })
  @IsIn(userRole.enumValues)
  role: UserRole;
}
