import {
  integer,
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authUsers } from './auth';
import { teams } from './teams';

export const testSuites = pgTable(
  'test_suites',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    parentId: uuid().references((): AnyPgColumn => testSuites.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
    name: text().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check('test_suites_ownership_check', sql`${table.userId} is null or ${table.teamId} is null`),
    index('test_suites_parent_idx').on(table.parentId, table.position),
    index('test_suites_user_updated_idx').on(table.userId, table.updatedAt, table.id),
    index('test_suites_team_updated_idx').on(table.teamId, table.updatedAt, table.id),
  ],
);

export const suiteRuns = pgTable(
  'suite_runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    suiteId: uuid().references(() => testSuites.id, { onDelete: 'set null' }),
    name: text().notNull(),
    total: integer().notNull(),
    cancelRequested: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check('suite_runs_ownership_check', sql`${table.userId} is null or ${table.teamId} is null`),
    check('suite_runs_total_check', sql`${table.total} > 0`),
    index('suite_runs_user_created_idx').on(table.userId, table.createdAt, table.id),
    index('suite_runs_team_created_idx').on(table.teamId, table.createdAt, table.id),
    index('suite_runs_suite_created_idx').on(table.suiteId, table.createdAt, table.id),
  ],
);
