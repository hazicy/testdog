import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
const fixture = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
  failSecond: false,
  calls: 0,
}));
vi.mock('@/db', async () => {
  const isolated = await (await import('@/workspace/server/testDatabase')).createTestDatabase();
  fixture.client = isolated.client;
  return { db: isolated.db };
});
vi.mock('@/workspace/server/store', async (original) => {
  const store = await original<typeof import('@/workspace/server/store')>();
  return {
    ...store,
    createRun: (...args: Parameters<typeof store.createRun>) => {
      if (fixture.failSecond && ++fixture.calls === 2)
        throw new store.WorkspaceError('Injected second variant failure');
      return store.createRun(...args);
    },
  };
});
import { db } from '@/db';
import { testCases, testRuns } from '@/db/schema';
import { POST } from './route';
afterAll(() => fixture.client?.close());
beforeEach(() => {
  fixture.failSecond = false;
  fixture.calls = 0;
});
const target = {
  platform: 'web',
  url: 'https://example.com',
  browser: 'chromium',
  deviceProfile: 'Pixel 7',
};
async function submit(fail: boolean) {
  const [test] = await db
    .insert(testCases)
    .values({ name: 'matrix', goal: 'shared goal', url: target.url })
    .returning();
  fixture.failSecond = fail;
  const response = await POST(
    new Request('http://localhost/api/run-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testId: test.id,
        variants: [
          { target },
          {
            target: { platform: 'ios', appId: 'com.example.app', deviceProfileId: 'iphone' },
            goal: 'native expected',
          },
        ],
      }),
    }),
  );
  return { test, response };
}
it('freezes independent platform goals under one batch identity', async () => {
  const { test, response } = await submit(false);
  expect(response.status).toBe(202);
  const body = await response.json();
  const runs = await db.select().from(testRuns).where(eq(testRuns.testId, test.id));
  expect(runs).toHaveLength(2);
  expect(runs.every((run) => run.batchId === body.batchId && run.status === 'queued')).toBe(true);
  expect(runs.map((run) => run.goal)).toEqual(['shared goal', 'native expected']);
  expect(runs.map((run) => run.targetSnapshot?.platform)).toEqual(['web', 'ios']);
});
it('rolls back the entire batch if a later variant cannot be created', async () => {
  const { test, response } = await submit(true);
  expect(response.status).toBe(400);
  expect(await db.select().from(testRuns).where(eq(testRuns.testId, test.id))).toHaveLength(0);
});
it('rejects an invalid platform matrix before creating work', async () => {
  const response = await POST(
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        testId: randomUUID(),
        variants: [{ target: { ...target, deviceProfile: 'iPhone 13' } }],
      }),
    }),
  );
  expect(response.status).toBe(400);
});
