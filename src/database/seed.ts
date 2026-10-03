/**
 * Creates the admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, or resets an
 * existing user with that email to admin with that password.
 * Usage: pnpm db:seed
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hashPassword } from '../common/crypto/password.js';
import { sessions, users } from './schema/index.js';

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
  const admin = {
    passwordHash: await hashPassword(SEED_ADMIN_PASSWORD),
    role: 'admin' as const,
    emailVerifiedAt: new Date(),
  };
  // If someone already registered this email, take the account over: a
  // stranger must not be promoted to admin while keeping their own password.
  const [user] = await db
    .insert(users)
    .values({ email: SEED_ADMIN_EMAIL.toLowerCase(), name: 'Admin', ...admin })
    .onConflictDoUpdate({ target: users.email, set: admin })
    .returning({ id: users.id });
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  console.log(`Admin ready: ${SEED_ADMIN_EMAIL}`);
} finally {
  await client.end();
}
