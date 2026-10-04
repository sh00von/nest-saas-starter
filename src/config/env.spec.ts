import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('parses comma-separated lists', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('treats empty values as unset', () => {
    const env = validateEnv({ ...base, REDIS_URL: '', PORT: '' });
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.PORT).toBe(3000);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('requires the webhook secret and prices once Stripe is enabled', () => {
    expect(() =>
      validateEnv({ ...base, STRIPE_SECRET_KEY: 'sk_test_x' }),
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(() =>
      validateEnv({
        ...base,
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_SECRET: 'whsec_x',
      }),
    ).toThrow(/STRIPE_PRICE_IDS/);
  });
});
