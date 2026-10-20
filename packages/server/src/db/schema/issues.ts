import {
  integer,
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authUsers } from './auth';
import { teams } from './teams';
import { testRuns, runSteps } from './runs';

export const issues = pgTable(
  'issues',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    title: text().notNull(),
    description: text().notNull().default(''),
    status: text({ enum: ['open', 'in_progress', 'pending_verification', 'closed'] })
      .notNull()
      .default('open'),
    category: text({ enum: ['product', 'test', 'environment', 'execution'] })
      .notNull()
      .default('product'),
    severity: text({ enum: ['critical', 'high', 'medium', 'low'] })
      .notNull()
      .default('medium'),
    closeReason: text({ enum: ['fixed', 'dismissed', 'duplicate', 'unreproducible'] }),
    version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check('issues_ownership_check', sql`${table.userId} is null or ${table.teamId} is null`),
    index('issues_team_idx').on(table.teamId, table.updatedAt, table.id),
    index('issues_user_updated_idx').on(table.userId, table.updatedAt, table.id),
    check(
      'issues_status_check',
      sql`${table.status} in ('open','in_progress','pending_verification','closed')`,
    ),
    check(
      'issues_category_check',
      sql`${table.category} in ('product','test','environment','execution')`,
    ),
    check('issues_severity_check', sql`${table.severity} in ('critical','high','medium','low')`),
    check(
      'issues_close_reason_check',
      sql`(${table.status} = 'closed' and ${table.closeReason} is not null and ${table.closeReason} in ('fixed','dismissed','duplicate','unreproducible')) or (${table.status} <> 'closed' and ${table.closeReason} is null)`,
    ),
  ],
);

export const issueOccurrences = pgTable(
  'issue_occurrences',
  {
    id: uuid().primaryKey().defaultRandom(),
    issueId: uuid()
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'restrict' }),
    stepId: uuid().references(() => runSteps.id, { onDelete: 'restrict' }),
    snapshot: jsonb()
      .$type<import('@testdog/contracts/issues/types').OccurrenceSnapshot>()
      .notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('issue_occurrences_source_idx').on(table.issueId, table.runId, table.stepId),
    uniqueIndex('issue_occurrences_run_idx')
      .on(table.issueId, table.runId)
      .where(sql`${table.stepId} is null`),
    index('issue_occurrences_issue_idx').on(table.issueId, table.createdAt),
    index('issue_occurrences_run_step_idx').on(table.runId, table.stepId),
    index('issue_occurrences_step_idx').on(table.stepId),
  ],
);

export const issueEvents = pgTable(
  'issue_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    issueId: uuid()
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    kind: text({ enum: ['created', 'updated', 'comment', 'occurrence', 'verification'] }).notNull(),
    message: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('issue_events_issue_idx').on(table.issueId, table.createdAt),
    check(
      'issue_events_kind_check',
      sql`${table.kind} in ('created','updated','comment','occurrence','verification')`,
    ),
  ],
);

export const issueVerifications = pgTable(
  'issue_verifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    issueId: uuid()
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    occurrenceId: uuid()
      .notNull()
      .references(() => issueOccurrences.id, { onDelete: 'restrict' }),
    runId: uuid()
      .notNull()
      .unique()
      .references(() => testRuns.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('issue_verifications_issue_idx').on(table.issueId, table.createdAt),
    index('issue_verifications_occurrence_idx').on(table.occurrenceId),
  ],
);
