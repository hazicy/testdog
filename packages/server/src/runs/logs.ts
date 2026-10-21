import type { BrowserLogList } from '@testdog/contracts/runs/types';
import type { UserScope } from '@testdog/server/shared/ownership';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@testdog/server/db';
import { runBrowserLogs } from '@testdog/server/db/schema';
import { assertRunAccess } from '@testdog/server/runs/repository';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { searchPattern } from '@testdog/server/shared/pagination';

const querySchema = z.object({
  kind: z.enum(['console', 'network', 'all']),
  q: z.string().max(200).default(''),
  stepId: z.uuid().optional(),
  untilMs: z.coerce.number().min(0).optional(),
  errors: z.enum(['true', 'false']).default('false'),
});

export async function listBrowserLogs(
  id: string,
  request: Request,
  userId: UserScope,
): Promise<BrowserLogList> {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!parsed.success) throw new WorkspaceError('日志筛选参数无效。');
  const query = parsed.data;

  await assertRunAccess(id, userId);
  const rows = await db
    .select({ data: runBrowserLogs.data })
    .from(runBrowserLogs)
    .where(
      and(
        eq(runBrowserLogs.runId, id),
        query.kind === 'all' ? undefined : sql`${runBrowserLogs.data}->>'kind' = ${query.kind}`,
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
    .orderBy(asc(runBrowserLogs.sequence));

  return {
    logs: rows.map((row) => row.data),
  };
}
