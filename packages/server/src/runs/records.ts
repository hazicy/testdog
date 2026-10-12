import type { testRuns, runSteps, runArtifacts } from '@testdog/server/db/schema';
import type { TestRun, ExecutionStep, RunArtifact } from '@testdog/contracts/runs/types';
import { targetUrl } from '@testdog/contracts/automation/platform/target';

const optional = <T>(value: T | null) => value ?? undefined;

export function runRecord(row: typeof testRuns.$inferSelect): TestRun {
  return {
    authenticationVerification: row.authenticationVerification,
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
