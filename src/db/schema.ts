import type {
  PlatformAction,
  PlatformAssertion,
  Observation,
  CapabilitySet,
} from '@/automation/platform/contracts';
import type { TestTarget } from '@/automation/platform/target';
import {
  integer,
  bigserial,
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
import type { RecordedAction } from '@/automation/platform/web/types';
import type { Plan, Assertion } from '@/automation/compiler/schema';
import type {
  BrowserLog,
  RunEvent,
  ExecutionStep,
  PlaywrightAssertion,
} from '@/features/runs/types';

export const Case = pgTable('case', {
  id: integer(),
  goal: varchar(),
});

export const users = pgTable('users', {
  id: integer(),
  name: varchar(),
});

// Execution records are independent snapshots; deleting a case does not delete history.
export const testCases = pgTable(
  'test_cases',
  {
    target: jsonb().$type<TestTarget>(),
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    url: text().notNull(),
    goal: text().notNull(),
    tags: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('test_cases_updated_idx').on(table.updatedAt, table.id)],
);
export const testRuns = pgTable(
  'test_runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    testId: uuid().references(() => testCases.id, { onDelete: 'set null' }),
    recordingVersionId: uuid().references((): AnyPgColumn => recordingVersions.id, {
      onDelete: 'set null',
    }),
    recordingSteps: jsonb().$type<ExecutionStep[]>(),
    targetSnapshot: jsonb().$type<TestTarget>(),
    environmentSnapshot: jsonb().$type<Record<string, unknown>>(),
    capabilities: jsonb().$type<CapabilitySet>(),
    evidenceComplete: boolean().notNull().default(true),
    sourceRunId: uuid().references((): AnyPgColumn => testRuns.id, { onDelete: 'set null' }),
    name: text().notNull(),
    url: text().notNull(),
    goal: text().notNull(),
    mode: text({ enum: ['record', 'replay'] })
      .notNull()
      .default('record'),
    status: text({
      enum: ['queued', 'preparing', 'running', 'finalizing', 'passed', 'failed', 'cancelled'],
    }).notNull(),
    plan: jsonb().$type<Plan>(),
    browserLogs: jsonb().$type<BrowserLog[]>().notNull().default([]),
    events: jsonb().$type<RunEvent[]>().notNull().default([]),
    replayable: boolean().notNull().default(false),
    cancelRequested: boolean().notNull().default(false),
    workerId: text(),
    resourceId: text(),
    batchId: uuid(),
    attempt: integer().notNull().default(1),
    fencingToken: integer().notNull().default(0),
    leaseUntil: timestamp({ withTimezone: true, mode: 'string' }),
    queuedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    preparingAt: timestamp({ withTimezone: true, mode: 'string' }),
    executingAt: timestamp({ withTimezone: true, mode: 'string' }),
    finalizingAt: timestamp({ withTimezone: true, mode: 'string' }),
    errorCode: text(),
    realtimeRevision: integer().notNull().default(0),
    heartbeatAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    startedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true, mode: 'string' }),
    durationMs: integer(),
    error: text(),
  },
  (table) => [
    index('test_runs_started_idx').on(table.startedAt, table.id),
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
    platformAction: jsonb().$type<PlatformAction>(),
    surface: jsonb().$type<Observation['surface']>(),
    observationRevision: integer(),
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
    platformAssertion: jsonb().$type<PlatformAssertion>(),
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
    kind: text({
      enum: ['screenshot', 'video', 'trace', 'snapshot', 'log', 'device-trace'],
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
    check(
      'run_artifacts_kind_check',
      sql`${table.kind} in ('screenshot','video','trace','snapshot','log','device-trace')`,
    ),
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
    steps: jsonb().$type<ExecutionStep[]>().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('recording_versions_run_idx').on(table.runId, table.createdAt, table.id)],
);

export const automationWorkers = pgTable('automation_workers', {
  id: text().primaryKey(),
  hostId: text().notNull(),
  platforms: jsonb().$type<string[]>().notNull(),
  heartbeatAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
export const automationResources = pgTable(
  'automation_resources',
  {
    id: text().primaryKey(),
    hostId: text().notNull(),
    platform: text({ enum: ['web', 'android', 'ios'] }).notNull(),
    profileId: text().notNull(),
    deviceId: text(),
    status: text({ enum: ['available', 'busy', 'quarantined'] })
      .notNull()
      .default('available'),
    owner: text(),
    runId: uuid().references(() => testRuns.id, { onDelete: 'set null' }),
    fencingToken: integer().notNull().default(0),
    leaseUntil: timestamp({ withTimezone: true, mode: 'string' }),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    uniqueIndex('automation_resource_device_unique').on(
      table.hostId,
      table.platform,
      table.deviceId,
    ),
    check(
      'automation_resource_status_check',
      sql`${table.status} in ('available','busy','quarantined')`,
    ),
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
    uniqueIndex('automation_event_sequence_unique').on(table.runId, table.attempt, table.sequence),
  ],
);

export const automationBuilds = pgTable('automation_builds', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text({ enum: ['android', 'ios'] }).notNull(),
  appId: text().notNull(),
  sha256: text().notNull(),
  path: text().notNull(),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// Durable notification outbox; published entries remain briefly for SSE catch-up.
export const realtimeOutbox = pgTable(
  'realtime_outbox',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    runId: uuid().references(() => testRuns.id, { onDelete: 'cascade' }),
    revision: integer(),
    kind: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    summary: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('realtime_outbox_run_revision_idx').on(table.runId, table.revision),
    index('realtime_outbox_pending_idx')
      .on(table.id)
      .where(sql`${table.publishedAt} is null`),
  ],
);

export const submissionRequests = pgTable('submission_requests', {
  key: uuid().primaryKey(),
  fingerprint: text().notNull(),
  response: jsonb().$type<Record<string, unknown>>(),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
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
  },
  (table) => [index('model_calls_run_idx').on(table.runId, table.startedAt, table.id)],
);
