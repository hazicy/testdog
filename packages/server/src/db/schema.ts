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

// A team owns exactly one shared workspace. Personal ownership remains unchanged.
export const teams = pgTable('teams', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: text({ enum: ['admin', 'member'] }).notNull(),
  },
  (table) => [
    uniqueIndex('team_members_team_user_idx').on(table.teamId, table.userId),
    index('team_members_user_idx').on(table.userId),
    check('team_members_role_check', sql`${table.role} in ('admin', 'member')`),
  ],
);

export const teamInvitations = pgTable(
  'team_invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [uniqueIndex('team_invitations_team_email_idx').on(table.teamId, table.email)],
);

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
    check('automation_resources_platform_check', sql`${table.platform} in ('web','android','ios')`),
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

// Separate from SSE revisions: covers updates and deletions in the full detail response.
export const runDetailVersions = pgTable('run_detail_versions', {
  runId: uuid()
    .primaryKey()
    .references(() => testRuns.id, { onDelete: 'cascade' }),
  version: uuid().notNull().defaultRandom(),
});

// Durable notification outbox; published entries remain briefly for SSE catch-up.
export const realtimeOutbox = pgTable(
  'realtime_outbox',
  {
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    id: bigserial({ mode: 'number' }).primaryKey(),
    runId: uuid().references(() => testRuns.id, { onDelete: 'cascade' }),
    revision: integer(),
    kind: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    summary: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true, mode: 'string' }),
    claimToken: uuid(),
    claimUntil: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('realtime_outbox_team_summary_idx')
      .on(table.teamId, table.id)
      .where(sql`${table.summary} = true`),
    check(
      'realtime_outbox_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
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

export const notificationIntegrations = pgTable(
  'notification_integrations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
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
    check(
      'notification_integrations_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
    uniqueIndex('notification_integrations_team_idx').on(table.teamId, table.channel),
    uniqueIndex('notification_integrations_owner_idx').on(table.userId, table.channel),
    uniqueIndex('notification_integrations_legacy_idx')
      .on(table.channel)
      .where(sql`${table.userId} is null and ${table.teamId} is null`),
    check('notification_integrations_channel_check', sql`${table.channel} in ('feishu','email')`),
  ],
);
export const notificationEventRecords = pgTable('notification_events', {
  id: uuid().primaryKey().defaultRandom(),
  userId: text().references(() => authUsers.id),
  teamId: uuid().references(() => teams.id),
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
    index('notification_deliveries_event_id_idx').on(table.eventId),
    check('notification_deliveries_attempts_check', sql`${table.attempts} >= 0`),
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
    teamId: uuid().references(() => teams.id),
    provider: text().notNull(),
    enabled: boolean().notNull().default(false),
    encryptedConfig: text().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'browser_provider_integrations_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
    uniqueIndex('browser_provider_integrations_team_idx').on(table.teamId, table.provider),
    uniqueIndex('browser_providers_active_team_idx')
      .on(table.teamId)
      .where(sql`${table.enabled} = true`),
    uniqueIndex('browser_provider_integrations_owner_idx').on(table.userId, table.provider),
    uniqueIndex('browser_provider_integrations_active_owner_idx')
      .on(table.userId)
      .where(sql`${table.enabled} = true`),
    uniqueIndex('browser_provider_integrations_active_legacy_idx')
      .on(sql`(1)`)
      .where(sql`${table.userId} is null and ${table.teamId} is null and ${table.enabled} = true`),
    uniqueIndex('browser_provider_integrations_legacy_idx')
      .on(table.provider)
      .where(sql`${table.userId} is null and ${table.teamId} is null`),
  ],
);

export const pluginSettings = pgTable(
  'plugin_settings',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    pluginId: text().notNull(),
    config: jsonb().$type<Record<string, unknown>>().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'plugin_settings_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
    uniqueIndex('plugin_settings_team_idx').on(table.teamId, table.pluginId),
    uniqueIndex('plugin_settings_owner_idx').on(table.userId, table.pluginId),
    uniqueIndex('plugin_settings_legacy_idx')
      .on(table.pluginId)
      .where(sql`${table.userId} is null and ${table.teamId} is null`),
  ],
);
