import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  CreateUploadDto,
  DownloadDto,
  FileDto,
  UploadDto,
} from './dto/files.dto.js';
import { FilesService } from './files.service.js';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /**
   * Step 1 of an upload: get a presigned URL, then `PUT` the file bytes to
   * `uploadUrl` with the returned headers (straight to S3).
   */
  @Post()
  createUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUploadDto,
  ): Promise<UploadDto> {
    return this.files.createUpload(user.id, dto);
  }

  /** Step 2 of an upload: confirm the file arrived in S3. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileDto> {
    return this.files.complete(user.id, id);
  }

  /** The current user's uploaded files. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<FileDto[]> {
    return this.files.list(user.id);
  }

  /** A short-lived download link. */
  @Get(':id/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DownloadDto> {
    return this.files.downloadUrl(user.id, id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.files.remove(user.id, id);
  }
}
