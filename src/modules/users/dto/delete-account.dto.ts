import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  /** Required when the account has a password. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}
