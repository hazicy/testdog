import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { testRuns, runSteps } from '@testdog/server/db/schema';
import { activeRunStatuses, isActiveRun, type TestRun } from '@testdog/contracts/runs/types';
import { createIssuesForFailedRun } from '@testdog/server/issues/repository';
import { runWrite } from '@testdog/server/scheduling/lease';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';

export async function requestCancellation(id: string, userId: UserScope) {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(testRuns)
      .where(and(eq(testRuns.id, id), ownedBy(testRuns.userId, userId)))
      .for('update');

    if (!run) throw new WorkspaceError('执行记录不存在。', 404);

    if (!isActiveRun(run.status)) throw new WorkspaceError('该测试已结束或不存在。', 409);
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
