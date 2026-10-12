import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@testdog/server/db';
import { runBrowserLogs, testRuns } from '@testdog/server/db/schema';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { searchPattern } from '@testdog/server/shared/pagination';

const querySchema = z.object({
  kind: z.enum(['console', 'network']),
  q: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  stepId: z.uuid().optional(),
  untilMs: z.coerce.number().min(0).optional(),
  errors: z.enum(['true', 'false']).default('false'),
});

export async function listBrowserLogs(id: string, request: Request, userId: UserScope) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!parsed.success) throw new WorkspaceError('日志筛选参数无效。');
  const query = parsed.data;
  const [run] = await db
    .select({ id: testRuns.id })
    .from(testRuns)
    .where(and(eq(testRuns.id, id), ownedBy(testRuns.userId, userId)));

  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
  const rows = await db
    .select({ data: runBrowserLogs.data, sequence: runBrowserLogs.sequence })
    .from(runBrowserLogs)
    .where(
      and(
        eq(runBrowserLogs.runId, id),
        gt(runBrowserLogs.sequence, query.cursor),
        sql`${runBrowserLogs.data}->>'kind' = ${query.kind}`,
        query.q
          ? sql`concat_ws(' ', ${runBrowserLogs.data}->>'message', ${runBrowserLogs.data}->>'url', ${runBrowserLogs.data}->>'pageId', ${runBrowserLogs.data}->>'level', ${runBrowserLogs.data}->>'status') ilike ${searchPattern(query.q)}`
          : undefined,
        query.stepId ? sql`${runBrowserLogs.data}->>'stepId' = ${query.stepId}` : undefined,
        query.untilMs !== undefined
          ? sql`(${runBrowserLogs.data}->>'elapsedMs')::numeric <= ${query.untilMs}`
          : undefined,
        query.errors === 'true'
          ? sql`(${runBrowserLogs.data}->>'level' = 'error' or coalesce(${runBrowserLogs.data}->>'failure', '') <> '' or coalesce((${runBrowserLogs.data}->>'status')::int, 0) >= 400)`
          : undefined,
      ),
    )
    .orderBy(asc(runBrowserLogs.sequence))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);

  return {
    logs: page.map((row) => row.data),
    nextCursor: rows.length > query.limit ? String(page.at(-1)!.sequence) : null,
  };
}
