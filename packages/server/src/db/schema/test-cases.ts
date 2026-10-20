import type { TestTarget } from '@testdog/contracts/execution/target';
import {
  integer,
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Plan } from '@testdog/contracts/execution/plan';
import { authUsers } from './auth';
import { teams } from './teams';
import { testSuites } from './suites';

// Execution records are independent snapshots; deleting a case does not delete history.
export const testCases = pgTable(
  'test_cases',
  {
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    folderId: uuid().references((): AnyPgColumn => testSuites.id, { onDelete: 'set null' }),
    folderPosition: integer().notNull().default(0),
    target: jsonb().$type<TestTarget>().notNull(),
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    goal: text().notNull(),
    plan: jsonb().$type<Plan>(),
    tags: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check('test_cases_ownership_check', sql`${table.userId} is null or ${table.teamId} is null`),
    index('test_cases_team_updated_idx').on(table.teamId, table.updatedAt, table.id),
    index('test_cases_updated_idx').on(table.updatedAt, table.id),
    index('test_cases_folder_idx').on(table.folderId, table.folderPosition),
    index('test_cases_user_updated_idx').on(table.userId, table.updatedAt, table.id),
  ],
);
