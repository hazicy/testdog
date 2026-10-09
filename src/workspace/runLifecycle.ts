import { randomUUID } from 'node:crypto';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { testRuns, runSteps } from '@/db/schema';
import { WorkspaceError } from './errors';
import type { RunStatus } from './types';

const state = globalThis as typeof globalThis & { caseforgeWorkerId?: string };
export const owner = (state.caseforgeWorkerId ??= randomUUID());

export async function recoverExpiredRuns() {
  const finishedAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    const expired = await tx
      .update(testRuns)
      .set({
        status: 'failed',
        error: '执行服务连接中断，请重新运行。',
        finishedAt,
        durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${testRuns.startedAt})) * 1000))::integer`,
        replayable: false,
      })
      .where(
        and(
          eq(testRuns.status, 'running'),
          lt(testRuns.heartbeatAt, new Date(Date.now() - 60000).toISOString()),
        ),
      )
      .returning({ id: testRuns.id });
    if (!expired.length) return;
    await tx
      .update(runSteps)
      .set({
        status: 'failed',
        error: '执行服务连接中断',
        finishedAt,
        durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${runSteps.startedAt})) * 1000))::integer`,
      })
      .where(
        and(
          eq(runSteps.status, 'running'),
          inArray(
            runSteps.runId,
            expired.map((run) => run.id),
          ),
        ),
      );
  });
}

export async function heartbeat(id: string) {
  const [run] = await db
    .update(testRuns)
    .set({ heartbeatAt: new Date().toISOString() })
    .where(and(eq(testRuns.id, id), eq(testRuns.workerId, owner), eq(testRuns.status, 'running')))
    .returning({ cancelRequested: testRuns.cancelRequested });
  return run;
}
export async function requestCancellation(id: string) {
  const [run] = await db
    .update(testRuns)
    .set({ cancelRequested: true })
    .where(and(eq(testRuns.id, id), eq(testRuns.status, 'running')))
    .returning();
  if (!run) throw new WorkspaceError('该测试已结束或不存在。', 409);
}
export async function finishRun(id: string, status: Exclude<RunStatus, 'running'>, error?: string) {
  await db.transaction(async (tx) => {
    const steps = await tx
      .select({ replayable: runSteps.replayable, status: runSteps.status })
      .from(runSteps)
      .where(eq(runSteps.runId, id));
    const finishedAt = new Date().toISOString();
    const finished = await tx
      .update(testRuns)
      .set({
        status: sql`case when ${testRuns.cancelRequested} then 'cancelled' else ${status} end`,
        finishedAt,
        durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${testRuns.startedAt})) * 1000))::integer`,
        error,
        replayable: sql`not ${testRuns.cancelRequested} and ${status === 'passed' && steps.length > 0 && steps.every((step) => step.replayable && step.status === 'passed')}`,
      })
      .where(and(eq(testRuns.id, id), eq(testRuns.status, 'running')))
      .returning({ id: testRuns.id });
    if (!finished.length) return;
    await tx
      .update(runSteps)
      .set({
        status: 'failed',
        finishedAt,
        error: error || '执行中断',
        durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${runSteps.startedAt})) * 1000))::integer`,
      })
      .where(and(eq(runSteps.runId, id), eq(runSteps.status, 'running')));
  });
}
