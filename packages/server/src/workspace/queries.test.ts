import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
import { listRunPage, listTestPage, workspaceStats } from '@testdog/server/workspace/queries';
import { createRun } from '@testdog/server/runs/submission';
import { getRun } from '@testdog/server/runs/repository';
import { saveTest } from '@testdog/server/test-cases/repository';
import { readPage } from '@testdog/server/shared/pagination';
import { listBrowserLogs } from '@testdog/server/runs/logs';
import { db } from '@testdog/server/db';
import { runBrowserLogs, testRuns } from '@testdog/server/db/schema';
import { eq } from 'drizzle-orm';

const page = (query = '') => readPage(new Request(`http://localhost/api/runs?${query}`));

beforeEach(async () => {
  await isolated.client!.exec('TRUNCATE test_runs, test_cases CASCADE');
});
afterAll(() => isolated.client!.close());
const input = { name: 'Login', url: 'https://example.com', goal: 'Click login', tags: ['SMOKE'] };

it('uses target URLs consistently in historical detail, summaries and search', async () => {
  const native = await createRun(
    {
      case: 'Native snapshot',
      target: {
        platform: 'ios',
        appId: 'com.example.app',
        deviceProfileId: 'phone',
      },
    },
    undefined,
    null,
  );
  const web = await createRun(
    { case: 'Web snapshot', url: 'https://example.com/current' },
    undefined,
    null,
  );

  expect((await getRun(native.id, { userId: null })).url).toBe('');
  expect((await getRun(web.id, { userId: null })).url).toBe('https://example.com/current');
  const summaries = (await listRunPage(page(), null)).runs;

  expect(summaries.find((run) => run.id === native.id)?.url).toBe('');
  expect(summaries.find((run) => run.id === web.id)?.url).toBe('https://example.com/current');
  expect((await listRunPage(page('q=stale'), null)).runs).toHaveLength(0);
  expect((await listRunPage(page('q=current'), null)).runs.map((run) => run.id)).toEqual([web.id]);
});

it('preserves microsecond cursor precision and does not duplicate or skip tied timestamps', async () => {
  const runs = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      createRun({ case: `Run ${i}`, url: input.url }, undefined, null),
    ),
  );

  for (const [i, run] of runs.entries())
    await isolated.client!.query('UPDATE test_runs SET "startedAt" = $1 WHERE id = $2', [
      `2026-10-10T00:00:00.00000${i > 1 ? 2 : 1}Z`,
      run.id,
    ]);
  const first = await listRunPage(page('limit=1'), null);
  const second = await listRunPage(page(`limit=1&cursor=${first.nextCursor}`), null);
  const third = await listRunPage(page(`limit=1&cursor=${second.nextCursor}`), null);
  const fourth = await listRunPage(page(`limit=1&cursor=${third.nextCursor}`), null);

  expect(
    new Set([...first.runs, ...second.runs, ...third.runs, ...fourth.runs].map((run) => run.id))
      .size,
  ).toBe(4);
  expect(fourth.nextCursor).toBeNull();
});
it('filters by latest case status, independently returns latest runs and keeps global statistics', async () => {
  const test = await saveTest(input, undefined, null);
  const untouched = await saveTest({ ...input, name: 'Unrun' }, undefined, null);
  const old = await createRun({ testId: test.id }, undefined, null);

  await db
    .update(testRuns)
    .set({ status: 'failed', startedAt: '2026-10-09T00:00:00Z' })
    .where(eq(testRuns.id, old.id));
  const latest = await createRun({ testId: test.id }, undefined, null);

  await db.update(testRuns).set({ status: 'passed' }).where(eq(testRuns.id, latest.id));
  const cases = await listTestPage(page('limit=1&q=smoke&status=passed'), null);

  expect(cases.tests.map((test) => test.id)).toEqual([test.id]);
  expect(cases.latestRuns.map((run) => run.id)).toEqual([latest.id]);
  expect((await listTestPage(page('status=failed'), null)).tests).toEqual([]);
  expect((await listTestPage(page('status=none'), null)).tests.map((test) => test.id)).toEqual([
    untouched.id,
  ]);
  expect((await listRunPage(page('status=failed'), null)).runs.map((run) => run.id)).toEqual([
    old.id,
  ]);
  expect(await workspaceStats(null)).toMatchObject({
    testCount: 2,
    runCount: 2,
    counts: { passed: 1, failed: 1 },
  });
});
it('searches literal wildcard characters and rejects malformed page inputs', async () => {
  const match = await createRun({ case: '100%_done', url: input.url }, undefined, null);
  const other = await createRun({ case: '100xyzdone', url: input.url }, undefined, null);

  await db.update(testRuns).set({ name: '100%_done' }).where(eq(testRuns.id, match.id));
  await db.update(testRuns).set({ name: '100xyzdone' }).where(eq(testRuns.id, other.id));
  expect((await listRunPage(page('q=%25_'), null)).runs.map((run) => run.id)).toEqual([match.id]);
  expect(() => page('cursor=bad')).toThrow('游标');
  expect(() => page('limit=1000000')).toThrow('分页');
  await expect(listTestPage(page('status=wrong'), null)).rejects.toThrow('状态');
});
it('paginates logs with server filters and leaves normal details light', async () => {
  const run = await createRun({ case: 'Logs', url: input.url }, undefined, null);
  const base = {
    at: '2026-10-10T00:00:00Z',
    elapsedMs: 10,
    pageId: 'page-1',
    pageUrl: input.url,
    kind: 'console' as const,
    level: 'error' as const,
    message: 'broken',
  };
  const firstLog = { ...base, id: randomUUID() };
  const durable = { ...base, id: randomUUID(), elapsedMs: 20 };

  await db.insert(runBrowserLogs).values([
    { id: firstLog.id, runId: run.id, data: firstLog },
    { id: durable.id, runId: run.id, data: durable },
    {
      id: randomUUID(),
      runId: run.id,
      data: { ...base, id: randomUUID(), kind: 'network', status: 200 },
    },
  ]);
  const request = (query: string) =>
    new Request(`http://localhost/api/runs/${run.id}/logs?kind=console&limit=1&${query}`);
  const first = await listBrowserLogs(run.id, request('errors=true'), null);

  expect(first.logs).toEqual([firstLog]);
  const second = await listBrowserLogs(
    run.id,
    request(`cursor=${first.nextCursor}&errors=true`),
    null,
  );

  expect(second.logs).toEqual([durable]);
  expect(second.nextCursor).toBeNull();
  expect((await listBrowserLogs(run.id, request('untilMs=15'), null)).logs).toEqual([firstLog]);
  expect((await listBrowserLogs(run.id, request('q=absent'), null)).logs).toEqual([]);
  expect(await getRun(run.id, { userId: null })).not.toHaveProperty('browserLogs');
  expect(
    (
      await listBrowserLogs(
        run.id,
        new Request(`http://localhost/api/runs/${run.id}/logs?kind=all`),
        null,
      )
    ).logs.map((log) => log.kind),
  ).toEqual(['console', 'console', 'network']);
});
it('list and detail reads never reclaim an expired execution', async () => {
  const run = await createRun({ case: 'Read only', url: input.url }, undefined, null);

  await db
    .update(testRuns)
    .set({ status: 'running', leaseUntil: '2020-01-01T00:00:00Z' })
    .where(eq(testRuns.id, run.id));
  expect((await getRun(run.id, { userId: null })).status).toBe('running');
  expect((await listRunPage(page(), null)).runs[0].status).toBe('running');
});
