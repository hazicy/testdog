import {
  integer,
  pgTable,
  varchar,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Plan, Assertion } from '@/automation/compiler/schema';
import type {
  RecordedAction,
  RunEvent,
  ExecutionStep,
  PlaywrightAssertion,
} from '@/workspace/types';

export const Case = pgTable('case', {
  id: integer(),
  goal: varchar(),
});

export const users = pgTable('users', {
  id: integer(),
  name: varchar(),
});

// Execution records are independent snapshots; deleting a case does not delete history.
export const testCases = pgTable('test_cases', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  url: text().notNull(),
  goal: text().notNull(),
  tags: jsonb().$type<string[]>().notNull().default([]),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
export const testRuns = pgTable(
  'test_runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    testId: uuid().references(() => testCases.id, { onDelete: 'set null' }),
    recordingVersionId: uuid().references((): AnyPgColumn => recordingVersions.id, {
      onDelete: 'set null',
    }),
    recordingSteps: jsonb().$type<ExecutionStep[]>(),
    sourceRunId: uuid().references((): AnyPgColumn => testRuns.id, { onDelete: 'set null' }),
    name: text().notNull(),
    url: text().notNull(),
    goal: text().notNull(),
    mode: text({ enum: ['record', 'replay'] })
      .notNull()
      .default('record'),
    status: text({ enum: ['running', 'passed', 'failed', 'cancelled'] }).notNull(),
    plan: jsonb().$type<Plan>(),
    events: jsonb().$type<RunEvent[]>().notNull().default([]),
    replayable: boolean().notNull().default(false),
    cancelRequested: boolean().notNull().default(false),
    workerId: text().notNull(),
    heartbeatAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    startedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true, mode: 'string' }),
    durationMs: integer(),
    error: text(),
  },
  (table) => [
    index('test_runs_started_idx').on(table.startedAt),
    index('test_runs_case_idx').on(table.testId),
    index('test_runs_status_idx').on(table.status),
    check(
      'test_runs_status_check',
      sql`${table.status} in ('running','passed','failed','cancelled')`,
    ),
    check('test_runs_mode_check', sql`${table.mode} in ('record','replay')`),
    check('test_runs_duration_check', sql`${table.durationMs} is null or ${table.durationMs} >= 0`),
  ],
);
export const runSteps = pgTable(
  'run_steps',
  {
    id: uuid().primaryKey(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    sequence: integer().notNull(),
    kind: text({ enum: ['navigate', 'action', 'assertion', 'wait', 'branch'] }).notNull(),
    title: text().notNull(),
    status: text({ enum: ['running', 'passed', 'failed'] }).notNull(),
    startedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
    finishedAt: timestamp({ withTimezone: true, mode: 'string' }),
    durationMs: integer(),
    pageId: text().notNull(),
    pageUrl: text().notNull(),
    planNodeId: text(),
    action: jsonb().$type<RecordedAction>(),
    assertion: jsonb().$type<Assertion>(),
    playwrightAssertion: jsonb().$type<PlaywrightAssertion>(),
    condition: text(),
    decision: boolean(),
    evidence: text(),
    error: text(),
    replayable: boolean().notNull().default(true),
  },
  (table) => [
    uniqueIndex('run_steps_sequence_idx').on(table.runId, table.sequence),
    check('run_steps_sequence_check', sql`${table.sequence} > 0`),
    check('run_steps_status_check', sql`${table.status} in ('running','passed','failed')`),
    check(
      'run_steps_kind_check',
      sql`${table.kind} in ('navigate','action','assertion','wait','branch')`,
    ),
  ],
);
export const runArtifacts = pgTable(
  'run_artifacts',
  {
    id: uuid().primaryKey(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    stepId: uuid().references(() => runSteps.id, { onDelete: 'set null' }),
    kind: text({ enum: ['screenshot', 'video', 'trace'] }).notNull(),
    stage: text({ enum: ['before', 'after', 'live', 'final'] }).notNull(),
    pageId: text().notNull(),
    pageUrl: text().notNull(),
    capturedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
    elapsedMs: integer().notNull(),
    path: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
  },
  (table) => [
    index('run_artifacts_timeline_idx').on(table.runId, table.elapsedMs),
    check('run_artifacts_kind_check', sql`${table.kind} in ('screenshot','video','trace')`),
    check('run_artifacts_stage_check', sql`${table.stage} in ('before','after','live','final')`),
    check('run_artifacts_size_check', sql`${table.size} >= 0 and ${table.elapsedMs} >= 0`),
  ],
);

export const recordingVersions = pgTable(
  'recording_versions',
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    steps: jsonb().$type<ExecutionStep[]>().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('recording_versions_run_idx').on(table.runId, table.createdAt)],
);
