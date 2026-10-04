import { S3Client } from '@aws-sdk/client-s3';
import { Inject, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';

export const S3 = Symbol('S3');

/** Inject the S3 client: `constructor(@InjectS3() s3: S3Client)` */
export const InjectS3 = () => Inject(S3);

export const s3Provider: Provider = {
  provide: S3,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    return new S3Client({
      region: config.get('S3_REGION', { infer: true }),
      // Without explicit keys, the AWS default chain is used (IAM role etc.).
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
      endpoint,
      forcePathStyle: Boolean(endpoint),
      // Presigned URLs for browsers must not demand a checksum header.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  },
};
