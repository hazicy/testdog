import { and, eq, isNull, sql } from 'drizzle-orm';
import { testCases, testRuns } from '@testdog/server/db/schema';
import { emptyRunCounts } from '@testdog/contracts/workspace/types';
import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { searchPattern } from '@testdog/server/shared/pagination';
import { WorkspaceError } from '@testdog/server/shared/errors';

export function testFilter(
  { q, status }: { q: string; status: string },
  userId: UserScope,
  folderId?: string | null,
) {
  if (status !== 'all' && status !== 'none' && !Object.hasOwn(emptyRunCounts(), status))
    throw new WorkspaceError('状态筛选参数无效。');
  const latestStatus = sql`(select status from test_runs where "testId" = ${testCases.id} and ${ownedBy(testRuns, userId)} order by "startedAt" desc, id desc limit 1)`;
  const url = sql`case when ${testCases.target}->>'platform' = 'web' then ${testCases.target}->>'url' else '' end`;

  return and(
    ownedBy(testCases, userId),
    folderId === undefined
      ? undefined
      : folderId === null
        ? isNull(testCases.folderId)
        : eq(testCases.folderId, folderId),
    q
      ? sql`concat_ws(' ', ${testCases.name}, ${url}, ${testCases.tags}::text, ${testCases.target}->>'appId', ${testCases.target}->>'platform') ilike ${searchPattern(q)}`
      : undefined,
    status === 'none'
      ? sql`${latestStatus} is null`
      : status !== 'all'
        ? sql`${latestStatus} = ${status}`
        : undefined,
  );
}
