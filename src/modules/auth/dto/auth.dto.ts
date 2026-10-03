import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserDto } from '../../users/dto/user.dto.js';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** 8–128 characters. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  /** Only needed when not using the `refresh_token` cookie. */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  /** 8–128 characters. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class EmailDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;
}

export class TokenDto {
  /** The token from the emailed link. */
  @IsString()
  @MaxLength(256)
  token: string;
}

export class ResetPasswordDto extends TokenDto {
  /** 8–128 characters. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class AuthResponseDto {
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  /**
   * Only present for body-transport clients (see `x-token-transport`);
   * browsers get it as an httpOnly cookie instead.
   */
  refreshToken?: string;
  @ApiProperty({ type: UserDto })
  user: UserDto;
}

export class SessionDto {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  current: boolean;
}
