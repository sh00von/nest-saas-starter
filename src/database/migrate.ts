/**
 * Applies pending SQL migrations from ./drizzle. Runs in production without
 * drizzle-kit: `node dist/database/migrate.js`.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on the real environment
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = postgres(url, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Migrations applied');
} finally {
  await client.end();
}
