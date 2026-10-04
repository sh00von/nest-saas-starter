import { Module } from '@nestjs/common';
import { FilesController } from './files.controller.js';
import { FilesListener } from './files.listener.js';
import { FilesService } from './files.service.js';
import { s3Provider } from './s3.provider.js';

/** File uploads to S3. Only loaded when S3_BUCKET is set. */
@Module({
  controllers: [FilesController],
  providers: [s3Provider, FilesService, FilesListener],
  exports: [FilesService],
})
export class FilesModule {}
