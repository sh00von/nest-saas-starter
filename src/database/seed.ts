/**
 * Creates (or promotes) an admin user from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 * Usage: pnpm db:seed
 */
import { hash } from 'argon2';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from './schema/index.js';

try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on the real environment
}

const { DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
  throw new Error(
    'DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set',
  );
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { casing: 'snake_case' });

try {
  await db
    .insert(users)
    .values({
      email: SEED_ADMIN_EMAIL.toLowerCase(),
      passwordHash: await hash(SEED_ADMIN_PASSWORD),
      name: 'Admin',
      role: 'admin',
    })
    .onConflictDoUpdate({ target: users.email, set: { role: 'admin' } });
  console.log(`Admin ready: ${SEED_ADMIN_EMAIL}`);
} finally {
  await client.end();
}
