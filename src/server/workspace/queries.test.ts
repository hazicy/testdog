import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@/db', async () => {
  const result = await (await import('@/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
import { listRunPage, listTestPage, workspaceStats } from './queries';
import { createRun, getRun } from '@/server/runs/repository';
import { saveTest } from '@/server/test-cases/repository';
import { readPage } from '@/server/shared/pagination';
import { listBrowserLogs } from '@/server/runs/logs';
import { db } from '@/db';
import { runBrowserLogs, testRuns } from '@/db/schema';
import { eq } from 'drizzle-orm';

const page = (query = '') => readPage(new Request(`http://localhost/api/runs?${query}`));

beforeEach(async () => {
  await isolated.client!.exec('TRUNCATE test_runs, test_cases CASCADE');
});
afterAll(() => isolated.client!.close());
const input = { name: 'Login', url: 'https://example.com', goal: 'Click login', tags: ['SMOKE'] };

it('preserves microsecond cursor precision and does not duplicate or skip tied timestamps', async () => {
  const runs = await Promise.all(
    Array.from({ length: 4 }, (_, i) => createRun({ case: `Run ${i}`, url: input.url })),
  );

  for (const [i, run] of runs.entries())
    await isolated.client!.query('UPDATE test_runs SET "startedAt" = $1 WHERE id = $2', [
      `2026-10-10T00:00:00.00000${i > 1 ? 2 : 1}Z`,
      run.id,
    ]);
  const first = await listRunPage(page('limit=1'));
  const second = await listRunPage(page(`limit=1&cursor=${first.nextCursor}`));
  const third = await listRunPage(page(`limit=1&cursor=${second.nextCursor}`));
  const fourth = await listRunPage(page(`limit=1&cursor=${third.nextCursor}`));

  expect(
    new Set([...first.runs, ...second.runs, ...third.runs, ...fourth.runs].map((run) => run.id))
      .size,
  ).toBe(4);
  expect(fourth.nextCursor).toBeNull();
});
it('filters by latest case status, independently returns latest runs and keeps global statistics', async () => {
  const test = await saveTest(input);
  const untouched = await saveTest({ ...input, name: 'Unrun' });
  const old = await createRun({ testId: test.id });

  await db
    .update(testRuns)
    .set({ status: 'failed', startedAt: '2026-10-09T00:00:00Z' })
    .where(eq(testRuns.id, old.id));
  const latest = await createRun({ testId: test.id });

  await db.update(testRuns).set({ status: 'passed' }).where(eq(testRuns.id, latest.id));
  const cases = await listTestPage(page('limit=1&q=smoke&status=passed'));

  expect(cases.tests.map((test) => test.id)).toEqual([test.id]);
  expect(cases.latestRuns.map((run) => run.id)).toEqual([latest.id]);
  expect((await listTestPage(page('status=failed'))).tests).toEqual([]);
  expect((await listTestPage(page('status=none'))).tests.map((test) => test.id)).toEqual([
    untouched.id,
  ]);
  expect((await listRunPage(page('status=failed'))).runs.map((run) => run.id)).toEqual([old.id]);
  expect(await workspaceStats()).toMatchObject({
    testCount: 2,
    runCount: 2,
    counts: { passed: 1, failed: 1 },
  });
});
it('searches literal wildcard characters and rejects malformed page inputs', async () => {
  const match = await createRun({ case: '100%_done', url: input.url });
  const other = await createRun({ case: '100xyzdone', url: input.url });

  await db.update(testRuns).set({ name: '100%_done' }).where(eq(testRuns.id, match.id));
  await db.update(testRuns).set({ name: '100xyzdone' }).where(eq(testRuns.id, other.id));
  expect((await listRunPage(page('q=%25_'))).runs.map((run) => run.id)).toEqual([match.id]);
  expect(() => page('cursor=bad')).toThrow('游标');
  expect(() => page('limit=1000000')).toThrow('分页');
  await expect(listTestPage(page('status=wrong'))).rejects.toThrow('状态');
});
it('paginates legacy and durable logs with server filters and leaves normal details light', async () => {
  const run = await createRun({ case: 'Logs', url: input.url });
  const base = {
    at: '2026-10-10T00:00:00Z',
    elapsedMs: 10,
    pageId: 'page-1',
    pageUrl: input.url,
    kind: 'console' as const,
    level: 'error' as const,
    message: 'broken',
  };
  const legacy = { ...base, id: randomUUID() };

  await db
    .update(testRuns)
    .set({ browserLogs: [legacy] })
    .where(eq(testRuns.id, run.id));
  const durable = { ...base, id: randomUUID(), elapsedMs: 20 };

  await db.insert(runBrowserLogs).values([
    { id: durable.id, runId: run.id, data: durable },
    {
      id: randomUUID(),
      runId: run.id,
      data: { ...base, id: randomUUID(), kind: 'network', status: 200 },
    },
  ]);
  const request = (query: string) =>
    new Request(`http://localhost/api/runs/${run.id}/logs?kind=console&limit=1&${query}`);
  const first = await listBrowserLogs(run.id, request('errors=true'));

  expect(first.logs).toEqual([legacy]);
  const second = await listBrowserLogs(run.id, request(`cursor=${first.nextCursor}&errors=true`));

  expect(second.logs).toEqual([durable]);
  expect(second.nextCursor).toBeNull();
  expect((await listBrowserLogs(run.id, request('untilMs=15'))).logs).toEqual([legacy]);
  expect((await listBrowserLogs(run.id, request('q=absent'))).logs).toEqual([]);
  expect((await getRun(run.id, { includeLogs: false })).browserLogs).toBeUndefined();
  expect((await getRun(run.id)).browserLogs).toHaveLength(3);
});
it('list and detail reads never reclaim an expired execution', async () => {
  const run = await createRun({ case: 'Read only', url: input.url });

  await db
    .update(testRuns)
    .set({ status: 'running', leaseUntil: '2020-01-01T00:00:00Z' })
    .where(eq(testRuns.id, run.id));
  expect((await getRun(run.id)).status).toBe('running');
  expect((await listRunPage(page())).runs[0].status).toBe('running');
});
