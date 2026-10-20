import type {
  PlatformAction,
  PlatformAssertion,
  Observation,
  CapabilitySet,
} from '@testdog/contracts/execution/platform';
import type { TestTarget } from '@testdog/contracts/execution/target';
import {
  integer,
  bigserial,
  pgTable,
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
import type { Plan, Assertion } from '@testdog/contracts/execution/plan';
import type { BrowserLog, RecordingOperation } from '@testdog/contracts/runs/types';
import type { ModelCallTrace } from '@testdog/contracts/runs/modelCalls';
import { authUsers } from './auth';
import { teams } from './teams';
import { testCases } from './test-cases';

export const testRuns = pgTable(
  'test_runs',
  {
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    id: uuid().primaryKey().defaultRandom(),
    testId: uuid().references(() => testCases.id, { onDelete: 'set null' }),
    recordingVersionId: uuid().references((): AnyPgColumn => recordingVersions.id, {
      onDelete: 'set null',
    }),
    recordingSteps: jsonb().$type<RecordingOperation[]>(),
    targetSnapshot: jsonb().$type<TestTarget>().notNull(),
    environmentSnapshot: jsonb().$type<Record<string, unknown>>(),
    replayEnvironmentSnapshot: jsonb().$type<Record<string, unknown>>(),
    capabilities: jsonb().$type<CapabilitySet>(),
    evidenceComplete: boolean().notNull().default(true),
    sourceRunId: uuid().references((): AnyPgColumn => testRuns.id, { onDelete: 'set null' }),
    name: text().notNull(),
    goal: text().notNull(),
    mode: text({ enum: ['record', 'replay'] })
      .notNull()
      .default('record'),
    status: text({
      enum: ['queued', 'preparing', 'running', 'finalizing', 'passed', 'failed', 'cancelled'],
    }).notNull(),
    plan: jsonb().$type<Plan>(),
    replayable: boolean().notNull().default(false),
    cancelRequested: boolean().notNull().default(false),
    workerId: text(),
    resourceId: text(),
    batchId: uuid(),
    attempt: integer().notNull().default(1),
    fencingToken: integer().notNull().default(0),
    leaseUntil: timestamp({ withTimezone: true, mode: 'string' }),
    queuedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    errorCode: text(),
    realtimeRevision: integer().notNull().default(0),
    startedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true, mode: 'string' }),
    durationMs: integer(),
    error: text(),
  },
  (table) => [
    check('test_runs_ownership_check', sql`${table.userId} is null or ${table.teamId} is null`),
    index('test_runs_team_started_idx').on(table.teamId, table.startedAt, table.id),
    index('test_runs_started_idx').on(table.startedAt, table.id),
    index('test_runs_user_started_idx').on(table.userId, table.startedAt, table.id),
    index('test_runs_batch_idx').on(table.batchId),
    index('test_runs_source_idx').on(table.sourceRunId),
    index('test_runs_recording_version_idx').on(table.recordingVersionId),
    index('test_runs_case_idx').on(table.testId, table.startedAt, table.id),
    index('test_runs_status_started_idx').on(table.status, table.startedAt, table.id),
    index('test_runs_active_lease_idx')
      .on(table.leaseUntil)
      .where(sql`${table.status} in ('preparing','running','finalizing')`),
    index('test_runs_queued_at_idx')
      .on(table.queuedAt)
      .where(sql`${table.status} = 'queued'`),
    check(
      'test_runs_status_check',
      sql`${table.status} in ('queued','preparing','running','finalizing','passed','failed','cancelled')`,
    ),
    check('test_runs_mode_check', sql`${table.mode} in ('record','replay')`),
    check('test_runs_duration_check', sql`${table.durationMs} is null or ${table.durationMs} >= 0`),
  ],
);

export const runBrowserLogs = pgTable(
  'run_browser_logs',
  {
    id: uuid().primaryKey(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    sequence: bigserial({ mode: 'number' }).notNull(),
    data: jsonb().$type<BrowserLog>().notNull(),
  },
  (table) => [index('run_browser_logs_run_sequence_idx').on(table.runId, table.sequence)],
);

export const runSteps = pgTable(
  'run_steps',
  {
    id: uuid().primaryKey(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    surface: jsonb().$type<Observation['surface']>(),
    observationRevision: integer(),
    modelCallId: uuid().references(() => modelCalls.id, { onDelete: 'set null' }),
    toolCallId: text(),
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
    action: jsonb().$type<PlatformAction>(),
    assertion: jsonb().$type<Assertion>(),
    platformAssertion: jsonb().$type<PlatformAssertion>(),
    condition: text(),
    decision: boolean(),
    evidence: text(),
    error: text(),
    replayable: boolean().notNull().default(true),
  },
  (table) => [
    uniqueIndex('run_steps_sequence_idx').on(table.runId, table.sequence),
    index('run_steps_model_call_idx').on(table.modelCallId),
    check('run_steps_duration_check', sql`${table.durationMs} is null or ${table.durationMs} >= 0`),
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
    kind: text({
      enum: ['screenshot', 'video', 'trace'],
    }).notNull(),
    stage: text({ enum: ['before', 'after', 'live', 'final'] }).notNull(),
    pageId: text().notNull(),
    pageUrl: text().notNull(),
    capturedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
    elapsedMs: integer().notNull(),
    surface: jsonb().$type<Observation['surface']>(),
    producer: text(),
    format: text(),
    path: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
  },
  (table) => [
    index('run_artifacts_timeline_idx').on(
      table.runId,
      table.elapsedMs,
      table.capturedAt,
      table.id,
    ),
    index('run_artifacts_step_idx').on(table.stepId),
    check('run_artifacts_kind_check', sql`${table.kind} in ('screenshot','video','trace')`),
    check('run_artifacts_stage_check', sql`${table.stage} in ('before','after','live','final')`),
    check('run_artifacts_size_check', sql`${table.size} >= 0 and ${table.elapsedMs} >= 0`),
  ],
);

export const recordingVersions = pgTable(
  'recording_versions',
  {
    schemaVersion: integer().notNull().default(1),
    platform: text({ enum: ['web', 'android', 'ios'] })
      .notNull()
      .default('web'),
    targetSnapshot: jsonb().$type<TestTarget>(),
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    steps: jsonb().$type<RecordingOperation[]>().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('recording_versions_run_idx').on(table.runId, table.createdAt, table.id),
    check('recording_versions_platform_check', sql`${table.platform} in ('web','android','ios')`),
    check('recording_versions_schema_version_check', sql`${table.schemaVersion} > 0`),
  ],
);

export const automationRunEvents = pgTable(
  'automation_run_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    attempt: integer().notNull(),
    sequence: integer().notNull(),
    at: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    message: text().notNull(),
  },
  (table) => [
    uniqueIndex('automation_event_sequence_unique').on(table.runId, table.sequence),
    check('automation_event_sequence_check', sql`${table.sequence} > 0`),
  ],
);

// Separate from SSE revisions: covers updates and deletions in the full detail response.
export const runDetailVersions = pgTable('run_detail_versions', {
  runId: uuid()
    .primaryKey()
    .references(() => testRuns.id, { onDelete: 'cascade' }),
  version: uuid().notNull().defaultRandom(),
});

export const submissionRequests = pgTable(
  'submission_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    key: uuid().notNull(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    fingerprint: text().notNull(),
    response: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'submission_requests_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
    uniqueIndex('submission_requests_team_key_idx').on(table.teamId, table.key),
    uniqueIndex('submission_requests_user_key_idx').on(table.userId, table.key),
    uniqueIndex('submission_requests_legacy_key_idx')
      .on(table.key)
      .where(sql`${table.userId} is null and ${table.teamId} is null`),
  ],
);

export const modelCalls = pgTable(
  'model_calls',
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid()
      .notNull()
      .references(() => testRuns.id, { onDelete: 'cascade' }),
    startedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
    durationMs: integer().notNull(),
    model: text().notNull(),
    status: text({ enum: ['passed', 'failed', 'cancelled', 'timeout'] }).notNull(),
    retryCount: integer().notNull(),
    failedAttempts: integer().notNull(),
    inputTokens: integer(),
    outputTokens: integer(),
    errorCode: text(),
    trace: jsonb().$type<ModelCallTrace>(),
  },
  (table) => [
    index('model_calls_run_idx').on(table.runId, table.startedAt, table.id),
    check(
      'model_calls_status_check',
      sql`${table.status} in ('passed','failed','cancelled','timeout')`,
    ),
    check(
      'model_calls_metrics_check',
      sql`${table.durationMs} >= 0 and ${table.retryCount} >= 0 and ${table.failedAttempts} >= 0 and (${table.inputTokens} is null or ${table.inputTokens} >= 0) and (${table.outputTokens} is null or ${table.outputTokens} >= 0)`,
    ),
  ],
);
