import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { testRuns, runSteps, runArtifacts, runBrowserLogs, automationRunEvents } from '@/db/schema';
import type { TestRun, ExecutionStep, RunArtifact } from '@/features/runs/types';
import { ownedBy, type UserScope } from '@/server/shared/ownership';
import { WorkspaceError } from '@/server/shared/errors';
import { runWrite } from '@/server/scheduling/lease';
import { storeArtifactFile } from './artifactStorage';
import { runRecord, stepRecord, artifactRecord } from './records';

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
