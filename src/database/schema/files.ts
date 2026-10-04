import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const fileStatus = pgEnum('file_status', ['pending', 'uploaded']);

/**
 * Files stored in S3. A row is created `pending` when an upload URL is
 * issued and becomes `uploaded` once the object is confirmed in the bucket.
 */
export const files = pgTable(
  'files',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Object key in the bucket; never derived from user input.
    key: text().notNull().unique(),
    filename: text().notNull(),
    contentType: text().notNull(),
    size: bigint({ mode: 'number' }).notNull(),
    status: fileStatus().notNull().default('pending'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId)],
);

export type FileRecord = typeof files.$inferSelect;
