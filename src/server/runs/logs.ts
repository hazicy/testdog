import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { runBrowserLogs, testRuns } from '@/db/schema';
import { WorkspaceError } from '@/server/shared/errors';
import { searchPattern } from '@/server/shared/pagination';
import type { BrowserLog } from '@/features/runs/types';

const querySchema = z.object({
  kind: z.enum(['console', 'network']),
  q: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  stepId: z.uuid().optional(),
  untilMs: z.coerce.number().min(0).optional(),
  errors: z.enum(['true', 'false']).default('false'),
});
export async function listBrowserLogs(id: string, request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new WorkspaceError('日志筛选参数无效。');
  const query = parsed.data;
  const [run] = await db
    .select({ legacy: testRuns.browserLogs })
    .from(testRuns)
    .where(eq(testRuns.id, id));
  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
  const matches = (log: BrowserLog) =>
    log.kind === query.kind &&
    (!query.stepId || log.stepId === query.stepId) &&
    (query.untilMs === undefined || log.elapsedMs <= query.untilMs) &&
    (query.errors !== 'true' ||
      log.level === 'error' ||
      !!log.failure ||
      (log.status ?? 0) >= 400) &&
    `${log.message ?? ''} ${log.url ?? ''} ${log.pageId} ${log.level ?? ''} ${log.status ?? ''}`
      .toLowerCase()
      .includes(query.q.toLowerCase());
  // Legacy JSON logs precede the durable table sequence in the cursor.
  // Cursor remains stable while new records arrive, including across this boundary.
  const legacyPage = run.legacy
    .map((data, index) => ({ data, position: index + 1 }))
    .filter((row) => row.position > query.cursor && matches(row.data));
  const rows = await db
    .select({ data: runBrowserLogs.data, sequence: runBrowserLogs.sequence })
    .from(runBrowserLogs)
    .where(
      and(
        eq(runBrowserLogs.runId, id),
        gt(runBrowserLogs.sequence, Math.max(0, query.cursor - run.legacy.length)),
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
  const combined = [
    ...legacyPage,
    ...rows.map((row) => ({ ...row, position: row.sequence + run.legacy.length })),
  ];
  const page = combined.slice(0, query.limit);
  return {
    logs: page.map((row) => row.data),
    nextCursor: combined.length > query.limit ? String(page.at(-1)!.position) : null,
  };
}
