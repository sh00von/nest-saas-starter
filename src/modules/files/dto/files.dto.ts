import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateUploadDto {
  /** Original file name, used for downloads only. */
  @IsString()
  @MaxLength(255)
  filename: string;

  /** MIME type; must be in UPLOAD_ALLOWED_TYPES. */
  @IsString()
  @Matches(/^[\w.+-]+\/[\w.+-]+$/)
  contentType: string;

  /** Exact size in bytes; at most UPLOAD_MAX_BYTES. */
  @IsInt()
  @Min(1)
  size: number;
}

export class FileDto {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  @ApiProperty({ enum: ['pending', 'uploaded'] })
  status: 'pending' | 'uploaded';
  createdAt: Date;
}

export class UploadDto {
  @ApiProperty({ type: FileDto })
  file: FileDto;
  /** PUT the file bytes here, with exactly these headers. */
  uploadUrl: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  headers: Record<string, string>;
  /** Seconds until `uploadUrl` stops working. */
  expiresIn: number;
}

export class DownloadDto {
  url: string;
  /** Seconds until `url` stops working. */
  expiresIn: number;
}
