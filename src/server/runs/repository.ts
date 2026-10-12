import { createIssuesForFailedRun } from '@/server/issues/repository';
import { validateInputReferences } from '@/automation/compiler/executionPlan';
import type { Plan } from '@/automation/compiler/schema';
import { ownedBy, type UserScope } from '@/server/shared/ownership';
import { storeArtifactFile } from './artifactStorage';
import { isDeepStrictEqual } from 'node:util';
import { runWrite, leaseScope } from '@/server/scheduling/lease';
import { activeRunStatuses, isActiveRun } from '@/features/runs/types';
import {
  defaultWebTarget,
  executionTarget,
  legacyWebTarget,
  targetUrl,
  type TestTarget,
} from '@/automation/platform/target';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  testCases,
  testRuns,
  runSteps,
  runArtifacts,
  runBrowserLogs,
  recordingVersions,
  automationRunEvents,
} from '@/db/schema';
import type { TestRun, RunSummary, ExecutionStep, RunArtifact } from '@/features/runs/types';
import { WorkspaceError } from '@/server/shared/errors';
import { runRequestSchema } from '@/features/runs/schemas';

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
    targetSnapshot: row.targetSnapshot ?? legacyWebTarget(row.url),
    environmentSnapshot: optional(row.environmentSnapshot),
    replayEnvironmentSnapshot: optional(row.replayEnvironmentSnapshot),
    capabilities: optional(row.capabilities),
    evidenceComplete: row.evidenceComplete,
    name: row.name,
    url: row.targetSnapshot ? targetUrl(row.targetSnapshot) : row.url,
    goal: row.goal,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: optional(row.finishedAt),
    durationMs: optional(row.durationMs),
    error: optional(row.error),
    plan: optional(row.plan),
    events: [],
    browserLogs: [],
    replayable: row.replayable,
    cancelRequested: row.cancelRequested,
    steps: [],
    artifacts: [],
  };
}

export function stepRecord(row: typeof runSteps.$inferSelect): ExecutionStep {
  return {
    ...row,
    platformAction: optional(row.platformAction),
    surface: optional(row.surface),
    observationRevision: optional(row.observationRevision),
    finishedAt: optional(row.finishedAt),
    durationMs: optional(row.durationMs),
    planNodeId: optional(row.planNodeId),
    action: optional(row.action),
    assertion: optional(row.assertion),
    platformAssertion: optional(row.platformAssertion),
    playwrightAssertion: optional(row.playwrightAssertion),
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

export async function recoverExpiredRuns() {
  await (await import('@/server/scheduling/scheduler')).recoverLeases();
}

export async function listRuns(userId: UserScope = null): Promise<RunSummary[]> {
  const { listRunPage } = await import('@/server/workspace/queries');

  return (await listRunPage({ limit: 50, q: '', status: 'all', cursor: undefined }, userId)).runs;
}

export async function getRun(
  id: string,
  options: { includeLogs?: boolean; userId?: UserScope } = {},
): Promise<TestRun> {
  return db.transaction(
    async (tx) => {
      const [row] = await tx
        .select()
        .from(testRuns)
        .where(
          and(
            eq(testRuns.id, id),
            options.userId === undefined ? undefined : ownedBy(testRuns.userId, options.userId),
          ),
        );

      if (!row) throw new WorkspaceError('执行记录不存在。', 404);
      const run = runRecord(row);
      const [steps, artifacts, logs, events] = await Promise.all([
        tx.select().from(runSteps).where(eq(runSteps.runId, id)).orderBy(asc(runSteps.sequence)),
        tx
          .select()
          .from(runArtifacts)
          .where(eq(runArtifacts.runId, id))
          .orderBy(asc(runArtifacts.elapsedMs), asc(runArtifacts.capturedAt), asc(runArtifacts.id)),
        options.includeLogs === false
          ? Promise.resolve([])
          : tx
              .select({ data: runBrowserLogs.data })
              .from(runBrowserLogs)
              .where(eq(runBrowserLogs.runId, id))
              .orderBy(asc(runBrowserLogs.sequence)),
        tx
          .select({ at: automationRunEvents.at, message: automationRunEvents.message })
          .from(automationRunEvents)
          .where(eq(automationRunEvents.runId, id))
          .orderBy(asc(automationRunEvents.sequence)),
      ]);

      return {
        ...run,
        events: events.map((event) => ({ ...event, at: new Date(event.at).toISOString() })),
        steps: steps.map(stepRecord),
        artifacts: artifacts.map(artifactRecord),
        browserLogs: options.includeLogs === false ? undefined : logs.map((log) => log.data),
      };
    },
    { isolationLevel: 'repeatable read' },
  );
}

export async function createRun(
  request: import('@/features/runs/schemas').RunRequest & {
    batchId?: string;
    goalOverride?: string;
  },
  transaction?: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: UserScope = null,
) {
  const parsed = runRequestSchema.safeParse(
    Object.fromEntries(
      Object.entries(request).filter(([key]) => key !== 'batchId' && key !== 'goalOverride'),
    ),
  );

  if (!parsed.success) throw new WorkspaceError('执行参数无效，请指定用例、测试描述或重放来源。');
  const input: {
    batchId?: string;
    goalOverride?: string;
    target?: TestTarget;
    testId?: string;
    case?: string;
    url?: string;
    sourceRunId?: string;
    recordingVersionId?: string;
    mode?: 'record' | 'replay';
    draft?: { name: string; goal: string; target: TestTarget; plan: Plan };
  } = { ...parsed.data, batchId: request.batchId, goalOverride: request.goalOverride };
  const persist = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    let snapshot: {
      targetSnapshot?: TestTarget;
      testId?: string;
      name: string;
      goal: string;
      plan?: Plan | null;
      url: string;
      sourceRunId?: string;
      recordingVersionId?: string;
      recordingSteps?: ExecutionStep[];
      replayEnvironmentSnapshot?: Record<string, unknown> | null;
      mode: 'record' | 'replay';
    };

    if (input.draft) {
      snapshot = {
        name: `${input.draft.name} · 草稿试跑`,
        goal: input.draft.goal,
        plan: input.draft.plan,
        targetSnapshot: input.draft.target,
        url: targetUrl(input.draft.target),
        mode: 'record',
      };
    } else if (input.mode === 'replay') {
      const [source] = await tx
        .select()
        .from(testRuns)
        .where(and(eq(testRuns.id, input.sourceRunId!), ownedBy(testRuns.userId, userId)));

      if (!source) throw new WorkspaceError('原执行不存在。', 404);

      if (
        input.target &&
        !isDeepStrictEqual(
          input.target,
          source?.targetSnapshot ?? (source ? legacyWebTarget(source.url) : undefined),
        )
      )
        throw new WorkspaceError('重放目标与原录制不兼容。', 409);
      const [version] = input.recordingVersionId
        ? await tx
            .select()
            .from(recordingVersions)
            .where(
              and(
                eq(recordingVersions.id, input.recordingVersionId),
                eq(recordingVersions.runId, source.id),
              ),
            )
        : [];

      if (input.recordingVersionId && !version)
        throw new WorkspaceError('录制版本不存在或不属于此执行。', 404);
      if (isActiveRun(source.status)) throw new WorkspaceError('请等待录制结束后重放。', 409);
      if (!version && (source.status !== 'passed' || !source.replayable))
        throw new WorkspaceError('该记录包含失败或无法稳定定位的步骤，不能重放操作。');
      snapshot = {
        targetSnapshot: source.targetSnapshot ?? legacyWebTarget(source.url),
        testId: optional(source.testId),
        name: source.name,
        url: source.targetSnapshot ? targetUrl(source.targetSnapshot) : source.url,
        goal: source.goal,
        mode: 'replay',
        sourceRunId: source.id,
        recordingVersionId: version?.id,
        plan: source.plan,
        replayEnvironmentSnapshot: source.environmentSnapshot,
        recordingSteps:
          version?.steps ??
          (
            await tx
              .select()
              .from(runSteps)
              .where(eq(runSteps.runId, source.id))
              .orderBy(asc(runSteps.sequence))
          ).map(stepRecord),
      };
    } else if (input.testId) {
      const [test] = await tx
        .select()
        .from(testCases)
        .where(and(eq(testCases.id, input.testId), ownedBy(testCases.userId, userId)));

      if (!test) throw new WorkspaceError('用例不存在。', 404);
      const target = executionTarget(test.target ?? legacyWebTarget(test.url), input.target);

      snapshot = {
        targetSnapshot: target,
        testId: test.id,
        name: test.name,
        url: targetUrl(target),
        goal: input.goalOverride ?? test.goal,
        plan: input.goalOverride ? undefined : test.plan,
        mode: 'record',
      };
    } else {
      const target =
        input.target ?? (input.url ? defaultWebTarget(input.url) : legacyWebTarget(''));

      snapshot = {
        targetSnapshot: target,
        name: '临时测试',
        url: targetUrl(target),
        goal: input.case || '',
        mode: 'record',
      };
    }

    if (snapshot.mode === 'record') {
      try {
        validateInputReferences(snapshot.goal, snapshot.plan, snapshot.targetSnapshot?.inputs);
      } catch (error) {
        throw new WorkspaceError(error instanceof Error ? error.message : String(error));
      }
    }

    const [run] = await tx
      .insert(testRuns)
      .values({ ...snapshot, userId, batchId: input.batchId, status: 'queued' })
      .returning();

    return runRecord(run);
  };

  return transaction ? persist(transaction) : db.transaction(persist);
}

export async function appendEvent(id: string, message: string) {
  return runWrite(id, async (tx) => {
    const [run] = await tx
      .select({ attempt: testRuns.attempt })
      .from(testRuns)
      .where(eq(testRuns.id, id));
    // runWrite holds the run lock, so concurrent appends cannot reuse a sequence.
    const [last] = await tx
      .select({ sequence: sql<number>`coalesce(max(${automationRunEvents.sequence}), 0)` })
      .from(automationRunEvents)
      .where(eq(automationRunEvents.runId, id));

    await tx.insert(automationRunEvents).values({
      runId: id,
      attempt: run.attempt,
      sequence: last.sequence + 1,
      at: new Date().toISOString(),
      message,
    });
  });
}

export async function savePlan(id: string, plan: TestRun['plan']) {
  return runWrite(id, async (tx) => {
    await tx.update(testRuns).set({ plan }).where(eq(testRuns.id, id));
  });
}

export async function heartbeat(id: string) {
  const lease = leaseScope.getStore();

  if (!lease || lease.runId !== id) return;

  return (await import('@/server/scheduling/scheduler')).renewLease(lease);
}

export async function requestCancellation(id: string, userId?: UserScope) {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(testRuns)
      .where(
        and(
          eq(testRuns.id, id),
          userId === undefined ? undefined : ownedBy(testRuns.userId, userId),
        ),
      )
      .for('update');

    if (!run) throw new WorkspaceError('执行记录不存在。', 404);

    if (!run || !isActiveRun(run.status)) throw new WorkspaceError('该测试已结束或不存在。', 409);
    await tx
      .update(testRuns)
      .set({
        cancelRequested: true,
        ...(run.status === 'queued'
          ? {
              status: 'cancelled' as const,
              errorCode: 'CANCELLED',
              finishedAt: new Date().toISOString(),
            }
          : {}),
      })
      .where(eq(testRuns.id, id));
  });
}

export async function finishRun(
  id: string,
  status: TestRun['status'],
  startedAt: string,
  error?: string,
  completion?: { evidenceComplete: boolean; errorCode: string | null },
) {
  return runWrite(id, async (tx) => {
    const steps = await tx
      .select({ replayable: runSteps.replayable, status: runSteps.status })
      .from(runSteps)
      .where(eq(runSteps.runId, id));
    const [run] = await tx
      .select({
        target: testRuns.targetSnapshot,
        environment: testRuns.environmentSnapshot,
        complete: testRuns.evidenceComplete,
      })
      .from(testRuns)
      .where(eq(testRuns.id, id));
    const compatible =
      run?.target?.platform === 'web' ||
      !run?.target ||
      ['osVersion', 'driverVersion', 'buildSha256', 'viewport'].every(
        (key) => !!run.environment?.[key],
      );
    const finishedAt = new Date().toISOString();

    await tx
      .update(testRuns)
      .set({
        status: sql`case when ${testRuns.cancelRequested} then 'cancelled' else ${status} end`,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        error,
        ...(completion ? { evidenceComplete: completion.evidenceComplete } : {}),
        errorCode: sql`case when ${testRuns.cancelRequested} or ${status === 'cancelled'} then 'CANCELLED' else ${completion ? completion.errorCode : testRuns.errorCode} end`,
        replayable: sql`not ${testRuns.cancelRequested} and ${status === 'passed' && (completion?.evidenceComplete ?? run?.complete) && compatible && steps.length > 0 && steps.every((step) => step.replayable && step.status === 'passed')}`,
      })
      .where(and(eq(testRuns.id, id), inArray(testRuns.status, activeRunStatuses)));
    await tx
      .update(runSteps)
      .set({
        status: 'failed',
        finishedAt,
        error: error || '执行中断',
        durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${runSteps.startedAt})) * 1000))::integer`,
      })
      .where(and(eq(runSteps.runId, id), eq(runSteps.status, 'running')));
    await createIssuesForFailedRun(id, tx);
  });
}

export async function insertStep(step: ExecutionStep) {
  return runWrite(step.runId, async (tx) => {
    await tx.insert(runSteps).values(step);
  });
}

export async function finishStep(id: string, patch: Partial<ExecutionStep>) {
  const [existing] = await db
    .select({ runId: runSteps.runId })
    .from(runSteps)
    .where(eq(runSteps.id, id));

  if (!existing) throw new WorkspaceError('步骤不存在', 404);

  return runWrite(existing.runId, async (tx) => {
    await tx.update(runSteps).set(patch).where(eq(runSteps.id, id));
  });
}

export async function insertArtifact(artifact: RunArtifact, path: string) {
  const stored = await storeArtifactFile(artifact.runId, artifact.id, path, artifact.contentType);

  try {
    return await runWrite(artifact.runId, async (tx) => {
      await tx.insert(runArtifacts).values({ ...artifact, path: stored.path });
    });
  } catch (error) {
    await stored
      .rollback()
      .catch((cleanupError) => console.error('Artifact cleanup failed', cleanupError));
    throw error;
  }
}

export async function getArtifact(runId: string, id: string, userId?: UserScope) {
  if (userId !== undefined) await assertRunAccess(runId, userId);
  const [artifact] = await db
    .select()
    .from(runArtifacts)
    .where(and(eq(runArtifacts.runId, runId), eq(runArtifacts.id, id)));

  if (!artifact) throw new WorkspaceError('画面附件不存在。', 404);

  return artifact;
}

export async function appendBrowserLogs(
  id: string,
  logs: import('@/features/runs/types').BrowserLog[],
) {
  if (!logs.length) return;

  return runWrite(id, async (tx) => {
    await tx
      .insert(runBrowserLogs)
      .values(logs.map((data) => ({ id: data.id, runId: id, data })))
      .onConflictDoNothing();
  });
}

// Worker reads are internal; every HTTP caller must pass the authenticated scope.
export async function assertRunAccess(id: string, userId: UserScope) {
  const [run] = await db
    .select({ id: testRuns.id })
    .from(testRuns)
    .where(and(eq(testRuns.id, id), ownedBy(testRuns.userId, userId)));

  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
}
