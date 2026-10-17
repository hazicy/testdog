import { emptyRunCounts, type WorkspaceStats } from '@testdog/contracts/workspace/types';
import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { and, desc, eq, inArray, sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { testCases, testRuns } from '@testdog/server/db/schema';
import { targetUrl } from '@testdog/contracts/automation/platform/target';
import type { RunSummary } from '@testdog/contracts/runs/types';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { pageCursor, searchPattern, type PageQuery } from '@testdog/server/shared/pagination';

const summaryColumns = {
  id: testRuns.id,
  testId: testRuns.testId,
  name: testRuns.name,
  url: targetUrlColumn(testRuns.targetSnapshot),
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

function targetUrlColumn(target: SQLWrapper) {
  return sql<string>`case when ${target}->>'platform' = 'web' then ${target}->>'url' else '' end`;
}

const summary = (row: typeof testRuns.$inferSelect | Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value ?? undefined]),
  ) as RunSummary;

function validateStatus(status: string, tests = false) {
  if (status !== 'all' && !(tests && status === 'none') && !Object.hasOwn(emptyRunCounts(), status))
    throw new WorkspaceError('状态筛选参数无效。');
}

export async function listRunPage({ limit, q, status, cursor }: PageQuery, userId: UserScope) {
  validateStatus(status);
  const rows = await db
    .select(summaryColumns)
    .from(testRuns)
    .where(
      and(
        ownedBy(testRuns, userId),
        q
          ? sql`concat_ws(' ', ${testRuns.name}, ${targetUrlColumn(testRuns.targetSnapshot)}) ilike ${searchPattern(q)}`
          : undefined,
        status !== 'all' ? eq(testRuns.status, status as RunSummary['status']) : undefined,
        cursor
          ? sql`(${testRuns.startedAt}, ${testRuns.id}) < (${cursor.date}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(testRuns.startedAt), desc(testRuns.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    runs: page.map(summary),
    nextCursor: rows.length > limit && last ? pageCursor(last.startedAt, last.id) : null,
  };
}

export async function listTestPage({ limit, q, status, cursor }: PageQuery, userId: UserScope) {
  validateStatus(status, true);
  // The latest execution is independent of the execution-list page.
  const latestStatus = sql`(select r.status from test_runs r where r."testId" = ${testCases.id} and r."userId" is not distinct from ${userId}::text order by r."startedAt" desc, r.id desc limit 1)`;
  const rows = await db
    .select()
    .from(testCases)
    .where(
      and(
        ownedBy(testCases, userId),
        q
          ? sql`concat_ws(' ', ${testCases.name}, ${targetUrlColumn(testCases.target)}, ${testCases.tags}::text, ${testCases.target}->>'appId', ${testCases.target}->>'platform') ilike ${searchPattern(q)}`
          : undefined,
        status === 'none'
          ? sql`${latestStatus} is null`
          : status !== 'all'
            ? sql`${latestStatus} = ${status}`
            : undefined,
        cursor
          ? sql`(${testCases.updatedAt}, ${testCases.id}) < (${cursor.date}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(testCases.updatedAt), desc(testCases.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const latest = page.length
    ? await db
        .selectDistinctOn([testRuns.testId], summaryColumns)
        .from(testRuns)
        .where(
          and(
            ownedBy(testRuns, userId),
            inArray(
              testRuns.testId,
              page.map((test) => test.id),
            ),
          ),
        )
        .orderBy(testRuns.testId, desc(testRuns.startedAt), desc(testRuns.id))
    : [];
  const last = page.at(-1);

  return {
    tests: page.map((test) => ({ ...test, url: targetUrl(test.target) })),
    latestRuns: latest.map(summary),
    nextCursor: rows.length > limit && last ? pageCursor(last.updatedAt, last.id) : null,
  };
}

export async function workspaceStats(userId: UserScope): Promise<WorkspaceStats> {
  return db.transaction(
    async (tx) => {
      const [tests, runs] = await Promise.all([
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(testCases)
          .where(ownedBy(testCases, userId)),
        tx
          .select({ status: testRuns.status, count: sql<number>`count(*)::int` })
          .from(testRuns)
          .where(ownedBy(testRuns, userId))
          .groupBy(testRuns.status),
      ]);
      const counts = emptyRunCounts();

      for (const row of runs) counts[row.status] = row.count;

      return {
        testCount: tests[0].count,
        runCount: runs.reduce((sum, row) => sum + row.count, 0),
        counts,
      };
    },
    { isolationLevel: 'repeatable read' },
  );
}
