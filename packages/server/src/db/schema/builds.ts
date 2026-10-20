import { pgTable, uuid, text, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const automationBuilds = pgTable(
  'automation_builds',
  {
    id: uuid().primaryKey().defaultRandom(),
    platform: text({ enum: ['android', 'ios'] }).notNull(),
    appId: text().notNull(),
    sha256: text().notNull(),
    path: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check('automation_builds_platform_check', sql`${table.platform} in ('android','ios')`),
  ],
);
