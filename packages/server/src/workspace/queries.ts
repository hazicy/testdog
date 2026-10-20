import {
  runSummaryColumns as summaryColumns,
  runSummary as summary,
} from '@testdog/server/runs/mappers';
import { emptyRunCounts, type WorkspaceStats } from '@testdog/contracts/workspace/types';
import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { and, desc, eq, inArray, sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { testCases, testRuns } from '@testdog/server/db/schema';
import { targetUrl } from '@testdog/contracts/execution/target';
import type { RunSummary } from '@testdog/contracts/runs/types';
import { testFilter } from '@testdog/server/test-cases/filter';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { pageCursor, searchPattern, type PageQuery } from '@testdog/server/shared/pagination';

function targetUrlColumn(target: SQLWrapper) {
  return sql<string>`case when ${target}->>'platform' = 'web' then ${target}->>'url' else '' end`;
}

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

export async function listTestPage(
  { limit, q, status, cursor }: PageQuery,
  userId: UserScope,
  folderId?: string | null,
) {
  const rows = await db
    .select()
    .from(testCases)
    .where(
      and(
        testFilter({ q, status }, userId, folderId),
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
