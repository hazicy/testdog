import type {
  PlatformAction,
  PlatformAssertion,
  Observation,
  CapabilitySet,
} from '@testdog/contracts/automation/platform/contracts';
import type { TestTarget } from '@testdog/contracts/automation/platform/target';
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
import type { Plan, Assertion } from '@testdog/contracts/automation/compiler/schema';
import type { BrowserLog, RecordingOperation } from '@testdog/contracts/runs/types';

export const authUsers = pgTable('auth_users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp().notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [index('auth_sessions_user_idx').on(table.userId)],
);

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index('auth_accounts_user_idx').on(table.userId),
    uniqueIndex('auth_accounts_provider_idx').on(table.providerId, table.accountId),
  ],
);

export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [index('auth_verifications_identifier_idx').on(table.identifier)],
);

// Execution records are independent snapshots; deleting a case does not delete history.
export const testCases = pgTable(
  'test_cases',
  {
    userId: text().references(() => authUsers.id),
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
    index('test_cases_updated_idx').on(table.updatedAt, table.id),
    index('test_cases_user_updated_idx').on(table.userId, table.updatedAt, table.id),
  ],
);
export const testRuns = pgTable(
  'test_runs',
  {
    userId: text().references(() => authUsers.id),
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
    index('test_runs_started_idx').on(table.startedAt, table.id),
    index('test_runs_user_started_idx').on(table.userId, table.startedAt, table.id),
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
    steps: jsonb().$type<RecordingOperation[]>().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('recording_versions_run_idx').on(table.runId, table.createdAt, table.id)],
);

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
    uniqueIndex('automation_event_sequence_unique').on(table.runId, table.sequence),
    check('automation_event_sequence_check', sql`${table.sequence} > 0`),
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
    userId: text().references(() => authUsers.id),
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
    index('realtime_outbox_user_summary_idx')
      .on(table.userId, table.id)
      .where(sql`${table.summary} = true`),
    index('realtime_outbox_pending_idx')
      .on(table.id)
      .where(sql`${table.publishedAt} is null`),
  ],
);

export const submissionRequests = pgTable(
  'submission_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    key: uuid().notNull(),
    userId: text().references(() => authUsers.id),
    fingerprint: text().notNull(),
    response: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('submission_requests_user_key_idx').on(table.userId, table.key),
    uniqueIndex('submission_requests_legacy_key_idx')
      .on(table.key)
      .where(sql`${table.userId} is null`),
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
  },
  (table) => [index('model_calls_run_idx').on(table.runId, table.startedAt, table.id)],
);

export const issues = pgTable(
  'issues',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
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
  (table) => [index('issue_events_issue_idx').on(table.issueId, table.createdAt)],
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
  (table) => [index('issue_verifications_issue_idx').on(table.issueId, table.createdAt)],
);

export const notificationIntegrations = pgTable(
  'notification_integrations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    channel: text({ enum: ['feishu', 'email'] }).notNull(),
    enabled: boolean().notNull().default(false),
    events: jsonb()
      .$type<import('@testdog/contracts/integrations/types').NotificationEvent[]>()
      .notNull()
      .default([]),
    encryptedConfig: text().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notification_integrations_owner_idx').on(table.userId, table.channel),
    uniqueIndex('notification_integrations_legacy_idx')
      .on(table.channel)
      .where(sql`${table.userId} is null`),
    check('notification_integrations_channel_check', sql`${table.channel} in ('feishu','email')`),
  ],
);
export const notificationEventRecords = pgTable('notification_events', {
  id: uuid().primaryKey().defaultRandom(),
  userId: text().references(() => authUsers.id),
  sourceKey: text().notNull().unique(),
  eventType: text().notNull(),
  payload: jsonb()
    .$type<import('@testdog/contracts/integrations/types').NotificationPayload>()
    .notNull(),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    integrationId: uuid()
      .notNull()
      .references(() => notificationIntegrations.id, { onDelete: 'cascade' }),
    integrationVersion: integer().notNull(),
    eventId: uuid()
      .notNull()
      .references(() => notificationEventRecords.id, { onDelete: 'cascade' }),
    status: text({ enum: ['pending', 'sending', 'sent', 'failed', 'skipped'] })
      .notNull()
      .default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    leaseToken: uuid(),
    leaseUntil: timestamp({ withTimezone: true, mode: 'string' }),
    nextAttemptAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('notification_deliveries_event_idx').on(table.integrationId, table.eventId),
    index('notification_deliveries_due_idx').on(table.status, table.nextAttemptAt),
    check(
      'notification_deliveries_status_check',
      sql`${table.status} in ('pending','sending','sent','failed','skipped')`,
    ),
  ],
);

export const browserProviderIntegrations = pgTable(
  'browser_provider_integrations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    provider: text().notNull(),
    enabled: boolean().notNull().default(false),
    encryptedConfig: text().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('browser_provider_integrations_owner_idx').on(table.userId, table.provider),
    uniqueIndex('browser_provider_integrations_active_owner_idx')
      .on(table.userId)
      .where(sql`${table.enabled} = true`),
    uniqueIndex('browser_provider_integrations_active_legacy_idx')
      .on(sql`(1)`)
      .where(sql`${table.userId} is null and ${table.enabled} = true`),
    uniqueIndex('browser_provider_integrations_legacy_idx')
      .on(table.provider)
      .where(sql`${table.userId} is null`),
  ],
);
