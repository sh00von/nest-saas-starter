import { z } from 'zod';

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGINS: csv,
    // Public URL of this API (OAuth callbacks).
    API_URL: z.url().default('http://localhost:3000'),
    // Public URL of the frontend (email links, OAuth and Stripe redirects).
    FRONTEND_URL: z.url().default('http://localhost:5173'),
    // Number of reverse-proxy hops to trust for client IPs (0 = none).
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Use `none` when the frontend is on a different site than the API.
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.url(),
    // Max connections in the pool. Use 1 with `pnpm db:local` (PGlite).
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    // Without SMTP_HOST, emails are printed to the console (outside production).
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('Nest SaaS Starter <no-reply@example.com>'),

    // Enables file uploads. Credentials fall back to the AWS default chain
    // (env, ~/.aws, instance role) when the keys are unset.
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    // Only for S3-compatible servers (e.g. MinIO in tests).
    S3_ENDPOINT: z.url().optional(),
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024),
    UPLOAD_ALLOWED_TYPES: csv.transform((types) =>
      types.length
        ? types
        : [
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/gif',
            'application/pdf',
          ],
    ),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_IDS: csv,

    OBSERVE_APP_KEY: z.string().optional(),
    OBSERVE_APP_SECRET: z.string().optional(),
  })
  .refine((env) => !env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET, {
    message: 'GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set',
    path: ['GOOGLE_CLIENT_SECRET'],
  })
  .refine((env) => !env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET, {
    message: 'STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set',
    path: ['STRIPE_WEBHOOK_SECRET'],
  })
  .refine((env) => !env.STRIPE_SECRET_KEY || env.STRIPE_PRICE_IDS.length, {
    message:
      'STRIPE_PRICE_IDS (comma-separated price ids users may buy) is required when STRIPE_SECRET_KEY is set',
    path: ['STRIPE_PRICE_IDS'],
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  // `KEY=` in .env (or an empty CI variable) means "not set".
  const present = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== ''),
  );
  const result = envSchema.safeParse(present);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
