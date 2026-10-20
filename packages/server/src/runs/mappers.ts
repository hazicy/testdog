import { sql } from 'drizzle-orm';
import { testRuns, type runSteps, type runArtifacts } from '@testdog/server/db/schema';
import type {
  TestRun,
  ExecutionStep,
  RunArtifact,
  RunSummary,
} from '@testdog/contracts/runs/types';
import { targetUrl } from '@testdog/contracts/automation/platform/target';

const optional = <T>(value: T | null) => value ?? undefined;

export function runRecord(row: typeof testRuns.$inferSelect): TestRun {
  return {
    realtimeRevision: row.realtimeRevision,
    workerId: optional(row.workerId),
    resourceId: optional(row.resourceId),
    batchId: optional(row.batchId),
    fencingToken: row.fencingToken,
    attempt: row.attempt,
    errorCode: optional(row.errorCode),
    id: row.id,
    testId: optional(row.testId),
    sourceRunId: optional(row.sourceRunId),
    recordingVersionId: optional(row.recordingVersionId),
    recordingSteps: optional(row.recordingSteps),
    targetSnapshot: row.targetSnapshot,
    environmentSnapshot: optional(row.environmentSnapshot),
    replayEnvironmentSnapshot: optional(row.replayEnvironmentSnapshot),
    capabilities: optional(row.capabilities),
    evidenceComplete: row.evidenceComplete,
    name: row.name,
    url: targetUrl(row.targetSnapshot),
    goal: row.goal,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: optional(row.finishedAt),
    durationMs: optional(row.durationMs),
    error: optional(row.error),
    plan: optional(row.plan),
    events: [],
    replayable: row.replayable,
    cancelRequested: row.cancelRequested,
    steps: [],
    artifacts: [],
  };
}

export function stepRecord(row: typeof runSteps.$inferSelect): ExecutionStep {
  return {
    ...row,
    modelCallId: optional(row.modelCallId),
    toolCallId: optional(row.toolCallId),
    surface: optional(row.surface),
    observationRevision: optional(row.observationRevision),
    finishedAt: optional(row.finishedAt),
    durationMs: optional(row.durationMs),
    planNodeId: optional(row.planNodeId),
    action: optional(row.action),
    assertion: optional(row.assertion),
    platformAssertion: optional(row.platformAssertion),
    condition: optional(row.condition),
    decision: optional(row.decision),
    evidence: optional(row.evidence),
    error: optional(row.error),
  };
}

export function artifactRecord(row: typeof runArtifacts.$inferSelect): RunArtifact {
  const { path: _path, ...artifact } = row;

  void _path;

  return {
    ...artifact,
    surface: optional(row.surface),
    producer: optional(row.producer),
    format: optional(row.format),
    stepId: optional(row.stepId),
  };
}

export const runSummaryColumns = {
  id: testRuns.id,
  testId: testRuns.testId,
  name: testRuns.name,
  url: sql<string>`case when ${testRuns.targetSnapshot}->>'platform' = 'web' then ${testRuns.targetSnapshot}->>'url' else '' end`,
  mode: testRuns.mode,
  status: testRuns.status,
  startedAt: testRuns.startedAt,
  finishedAt: testRuns.finishedAt,
  durationMs: testRuns.durationMs,
  error: testRuns.error,
  sourceRunId: testRuns.sourceRunId,
  replayable: testRuns.replayable,
  cancelRequested: testRuns.cancelRequested,
};

export const runSummary = (row: typeof testRuns.$inferSelect | Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value ?? undefined]),
  ) as RunSummary;
