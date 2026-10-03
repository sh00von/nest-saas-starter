import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const verificationTokenType = pgEnum('verification_token_type', [
  'email_verification',
  'password_reset',
]);

/** Single-use tokens sent by email. Only a SHA-256 hash is stored. */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: verificationTokenType().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)],
);

export type VerificationTokenType =
  (typeof verificationTokenType.enumValues)[number];
