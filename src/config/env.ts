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
    FRONTEND_URL: z.url().default('http://localhost:5173'),
    // Number of reverse-proxy hops to trust for client IPs (0 = none).
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Use `none` when the frontend is on a different site than the API.
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    DATABASE_URL: z.url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_IDS: csv,

    OBSERVE_APP_KEY: z.string().optional(),
    OBSERVE_APP_SECRET: z.string().optional(),
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
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
