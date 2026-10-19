import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { testSuites, suiteRuns, testCases, testRuns } from '@testdog/server/db/schema';
import { descendantSuiteIds } from '@testdog/contracts/suites/tree';
import { suiteRunStatus, type SuiteRunSummary } from '@testdog/contracts/suites/types';
import { emptyRunCounts } from '@testdog/contracts/workspace/types';
import { activeRunStatuses } from '@testdog/contracts/runs/types';
import { ownedBy, ownershipValues, type UserScope } from '@testdog/server/shared/ownership';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { validId } from '@testdog/server/shared/http';
import { pageCursor, searchPattern, type PageQuery } from '@testdog/server/shared/pagination';
import { submitOnce } from '@testdog/server/shared/idempotency';
import { createCaseRuns } from '@testdog/server/runs/submission';
import { runSummaryColumns, runSummary } from '@testdog/server/runs/records';
import { lockTree, folderFor } from './folders';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function startSuite(request: Request, id: string, scope: UserScope) {
  validId(id);

  return submitOnce(
    request,
    { suiteId: id },
    async (tx) => {
      await lockTree(tx, scope);
      const suite = await folderFor(id, scope, tx, 'share');
      const folders = await tx
        .select({ id: testSuites.id, parentId: testSuites.parentId })
        .from(testSuites)
        .where(ownedBy(testSuites, scope));
      const descendants = [...descendantSuiteIds(folders, id)];
      // Lock exactly the scoped cases included in this immutable batch snapshot.
      const tests = await tx
        .select({
          id: testCases.id,
          target: testCases.target,
          name: testCases.name,
          goal: testCases.goal,
          plan: testCases.plan,
        })
        .from(testCases)
        .where(and(inArray(testCases.folderId, descendants), ownedBy(testCases, scope)))
        .orderBy(testCases.id)
        .for('share');

      if (!tests.length) throw new WorkspaceError('文件夹没有可运行的用例。', 409);
      const [batch] = await tx
        .insert(suiteRuns)
        .values({ ...ownershipValues(scope), suiteId: id, name: suite.name, total: tests.length })
        .returning();

      await createCaseRuns(tests, batch.id, tx, scope);

      return { batchId: batch.id };
    },
    scope,
  );
}

async function summarizeBatches(
  batches: (typeof suiteRuns.$inferSelect)[],
  scope: UserScope,
): Promise<SuiteRunSummary[]> {
  const rows = batches.length
    ? await db
        .select({
          batchId: testRuns.batchId,
          status: testRuns.status,
          count: sql<number>`count(*)::int`,
        })
        .from(testRuns)
        .where(
          and(
            inArray(
              testRuns.batchId,
              batches.map((batch) => batch.id),
            ),
            ownedBy(testRuns, scope),
          ),
        )
        .groupBy(testRuns.batchId, testRuns.status)
    : [];

  return batches.map((batch) => {
    const counts = emptyRunCounts();

    for (const row of rows) if (row.batchId === batch.id) counts[row.status] = row.count;

    return {
      id: batch.id,
      suiteId: batch.suiteId,
      name: batch.name,
      createdAt: batch.createdAt,
      total: batch.total,
      cancelRequested: batch.cancelRequested,
      counts,
      status: suiteRunStatus(counts),
    };
  });
}

export async function listSuiteRuns(
  { limit, q, cursor }: PageQuery,
  scope: UserScope,
  suiteId?: string,
) {
  if (suiteId) validId(suiteId);
  const rows = await db
    .select()
    .from(suiteRuns)
    .where(
      and(
        ownedBy(suiteRuns, scope),
        suiteId ? eq(suiteRuns.suiteId, suiteId) : undefined,
        q ? sql`${suiteRuns.name} ilike ${searchPattern(q)}` : undefined,
        cursor
          ? sql`(${suiteRuns.createdAt}, ${suiteRuns.id}) < (${cursor.date}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(suiteRuns.createdAt), desc(suiteRuns.id))
    .limit(limit + 1);
  const batches = rows.slice(0, limit);
  const last = batches.at(-1);

  return {
    batches: await summarizeBatches(batches, scope),
    nextCursor: rows.length > limit && last ? pageCursor(last.createdAt, last.id) : null,
  };
}

async function batchFor(id: string, scope: UserScope, tx: Tx | typeof db = db) {
  validId(id);
  const [batch] = await tx
    .select()
    .from(suiteRuns)
    .where(and(eq(suiteRuns.id, id), ownedBy(suiteRuns, scope)));

  if (!batch) throw new WorkspaceError('套件执行不存在。', 404);

  return batch;
}

export async function getSuiteRun(id: string, scope: UserScope) {
  const batch = await batchFor(id, scope);
  const rows = await db
    .select(runSummaryColumns)
    .from(testRuns)
    .where(and(eq(testRuns.batchId, id), ownedBy(testRuns, scope)))
    .orderBy(testRuns.queuedAt, testRuns.id);
  const counts = emptyRunCounts();

  for (const row of rows) counts[row.status]++;

  return {
    id: batch.id,
    suiteId: batch.suiteId,
    name: batch.name,
    createdAt: batch.createdAt,
    total: batch.total,
    cancelRequested: batch.cancelRequested,
    counts,
    status: suiteRunStatus(counts),
    runs: rows.map(runSummary),
  };
}

export async function cancelSuiteRun(id: string, scope: UserScope) {
  return db.transaction(async (tx) => {
    await batchFor(id, scope, tx);
    await tx.update(suiteRuns).set({ cancelRequested: true }).where(eq(suiteRuns.id, id));
    await tx
      .update(testRuns)
      .set({
        cancelRequested: true,
        status: sql`case when ${testRuns.status} = 'queued' then 'cancelled' else ${testRuns.status} end`,
        finishedAt: sql`case when ${testRuns.status} = 'queued' then now() else ${testRuns.finishedAt} end`,
        errorCode: sql`case when ${testRuns.status} = 'queued' then 'CANCELLED' else ${testRuns.errorCode} end`,
      })
      .where(
        and(
          eq(testRuns.batchId, id),
          ownedBy(testRuns, scope),
          inArray(testRuns.status, activeRunStatuses),
        ),
      );
  });
}
