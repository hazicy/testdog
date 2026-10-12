import { ownedBy, type UserScope } from '@/server/shared/ownership';
import { and, desc, eq, getTableColumns, inArray, sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '@/db';
import { testCases, testRuns } from '@/db/schema';
import { legacyWebTarget } from '@/automation/platform/target';
import type { RunSummary } from '@/features/runs/types';
import { WorkspaceError } from '@/server/shared/errors';
import { pageCursor, searchPattern, type PageQuery } from '@/server/shared/pagination';

const emptyCounts = () => ({
  queued: 0,
  preparing: 0,
  running: 0,
  finalizing: 0,
  passed: 0,
  failed: 0,
  cancelled: 0,
});

export type WorkspaceStats = {
  testCount: number;
  runCount: number;
  counts: ReturnType<typeof emptyCounts>;
};
const summaryColumns = {
  id: testRuns.id,
  testId: testRuns.testId,
  name: testRuns.name,
  url: effectiveUrl(testRuns.targetSnapshot, testRuns.url),
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

// Read historical rows by their target as well; old URL columns may be stale.
function effectiveUrl(target: SQLWrapper, url: SQLWrapper) {
  return sql<string>`case when ${target}->>'platform' = 'web' then coalesce(${target}->>'url', ${url}) when ${target} is not null then '' else ${url} end`;
}

const summary = (row: typeof testRuns.$inferSelect | Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value ?? undefined]),
  ) as RunSummary;

function validateStatus(status: string, tests = false) {
  if (status !== 'all' && !(tests && status === 'none') && !Object.hasOwn(emptyCounts(), status))
    throw new WorkspaceError('状态筛选参数无效。');
}

export async function listRunPage(
  { limit, q, status, cursor }: PageQuery,
  userId: UserScope = null,
) {
  validateStatus(status);
  const rows = await db
    .select(summaryColumns)
    .from(testRuns)
    .where(
      and(
        ownedBy(testRuns.userId, userId),
        q
          ? sql`concat_ws(' ', ${testRuns.name}, ${effectiveUrl(testRuns.targetSnapshot, testRuns.url)}) ilike ${searchPattern(q)}`
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

export async function listTestPage(
  { limit, q, status, cursor }: PageQuery,
  userId: UserScope = null,
) {
  validateStatus(status, true);
  // The latest execution is independent of the execution-list page.
  const latestStatus = sql`(select r.status from test_runs r where r."testId" = ${testCases.id} and r."userId" is not distinct from ${userId}::text order by r."startedAt" desc, r.id desc limit 1)`;
  const rows = await db
    .select({ ...getTableColumns(testCases), url: effectiveUrl(testCases.target, testCases.url) })
    .from(testCases)
    .where(
      and(
        ownedBy(testCases.userId, userId),
        q
          ? sql`concat_ws(' ', ${testCases.name}, ${effectiveUrl(testCases.target, testCases.url)}, ${testCases.tags}::text, ${testCases.target}->>'appId', ${testCases.target}->>'platform') ilike ${searchPattern(q)}`
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
            ownedBy(testRuns.userId, userId),
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
    tests: page.map((test) => ({ ...test, target: test.target ?? legacyWebTarget(test.url) })),
    latestRuns: latest.map(summary),
    nextCursor: rows.length > limit && last ? pageCursor(last.updatedAt, last.id) : null,
  };
}

export async function workspaceStats(userId: UserScope = null): Promise<WorkspaceStats> {
  return db.transaction(
    async (tx) => {
      const [tests, runs] = await Promise.all([
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(testCases)
          .where(ownedBy(testCases.userId, userId)),
        tx
          .select({ status: testRuns.status, count: sql<number>`count(*)::int` })
          .from(testRuns)
          .where(ownedBy(testRuns.userId, userId))
          .groupBy(testRuns.status),
      ]);
      const counts = emptyCounts();

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
