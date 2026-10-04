import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq } from 'drizzle-orm';
import type { Env } from '../../config/env.js';
import { type Database, InjectDb } from '../../database/database.module.js';
import { type FileRecord, files } from '../../database/schema/index.js';
import type {
  CreateUploadDto,
  DownloadDto,
  FileDto,
  UploadDto,
} from './dto/files.dto.js';
import { InjectS3 } from './s3.provider.js';

const UPLOAD_URL_TTL = 15 * 60;
const DOWNLOAD_URL_TTL = 5 * 60;

/**
 * Direct-to-S3 uploads: the API hands out short-lived presigned URLs and
 * keeps a `files` row per object; file bytes never pass through the API.
 * 1. `createUpload` → client PUTs the bytes to `uploadUrl`
 * 2. `complete` → API checks the object really landed, marks it uploaded
 */
@Injectable()
export class FilesService {
  constructor(
    @InjectS3() private readonly s3: S3Client,
    @InjectDb() private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createUpload(userId: string, dto: CreateUploadDto): Promise<UploadDto> {
    const allowed = this.config.get('UPLOAD_ALLOWED_TYPES', { infer: true });
    if (!allowed.includes(dto.contentType)) {
      throw new BadRequestException(`File type ${dto.contentType} not allowed`);
    }
    const max = this.config.get('UPLOAD_MAX_BYTES', { infer: true });
    if (dto.size > max) {
      throw new BadRequestException(`File is larger than ${max} bytes`);
    }

    const [file] = await this.db
      .insert(files)
      .values({
        userId,
        key: `users/${userId}/${randomUUID()}`,
        filename: dto.filename,
        contentType: dto.contentType,
        size: dto.size,
      })
      .returning();

    // Signing these headers makes S3 reject any other type or size.
    const headers = {
      'content-type': file.contentType,
      'content-length': String(file.size),
    };
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: file.key,
        ContentType: file.contentType,
        ContentLength: file.size,
      }),
      {
        expiresIn: UPLOAD_URL_TTL,
        signableHeaders: new Set(Object.keys(headers)),
      },
    );
    return {
      file: toDto(file),
      uploadUrl,
      headers: { 'Content-Type': file.contentType },
      expiresIn: UPLOAD_URL_TTL,
    };
  }

  /** Confirms the object exists with the declared size and type. */
  async complete(userId: string, fileId: string): Promise<FileDto> {
    const file = await this.getOwned(userId, fileId);
    if (file.status === 'uploaded') return toDto(file);

    const head = await this.s3
      .send(new HeadObjectCommand({ Bucket: this.bucket, Key: file.key }))
      .catch(() => null);
    if (!head) throw new BadRequestException('File has not been uploaded');
    if (
      head.ContentLength !== file.size ||
      head.ContentType !== file.contentType
    ) {
      await this.remove(userId, fileId);
      throw new BadRequestException('Uploaded file does not match; removed');
    }

    const [updated] = await this.db
      .update(files)
      .set({ status: 'uploaded' })
      .where(eq(files.id, file.id))
      .returning();
    return toDto(updated);
  }

  async list(userId: string): Promise<FileDto[]> {
    const rows = await this.db
      .select()
      .from(files)
      .where(and(eq(files.userId, userId), eq(files.status, 'uploaded')))
      .orderBy(desc(files.createdAt));
    return rows.map(toDto);
  }

  async downloadUrl(userId: string, fileId: string): Promise<DownloadDto> {
    const file = await this.getOwned(userId, fileId);
    if (file.status !== 'uploaded')
      throw new NotFoundException('File not found');
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: file.key,
        ResponseContentDisposition: contentDisposition(file.filename),
      }),
      { expiresIn: DOWNLOAD_URL_TTL },
    );
    return { url, expiresIn: DOWNLOAD_URL_TTL };
  }

  async remove(userId: string, fileId: string): Promise<void> {
    const file = await this.getOwned(userId, fileId);
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: file.key }),
    );
    await this.db.delete(files).where(eq(files.id, file.id));
  }

  /** Deletes every object a user owns from the bucket (rows cascade). */
  async removeAllObjects(userId: string): Promise<void> {
    const rows = await this.db
      .select({ key: files.key })
      .from(files)
      .where(eq(files.userId, userId));
    for (const { key } of rows) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    }
  }

  private async getOwned(userId: string, fileId: string): Promise<FileRecord> {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, fileId), eq(files.userId, userId)),
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  private get bucket(): string {
    return this.config.get('S3_BUCKET', { infer: true })!;
  }
}

function toDto(file: FileRecord): FileDto {
  return {
    id: file.id,
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
    status: file.status,
    createdAt: file.createdAt,
  };
}

/** `attachment` with an ASCII fallback and the exact UTF-8 name (RFC 6266). */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
