import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const fixture = vi.hoisted(() => ({
  database: undefined as
    | Awaited<ReturnType<typeof import('@testdog/server/testing/testDatabase').createTestDatabase>>
    | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  fixture.database = await (
    await import('@testdog/server/testing/testDatabase')
  ).createTestDatabase();

  return { db: fixture.database.db };
});
import { db } from '@testdog/server/db';
import {
  authUsers,
  testRuns,
  testSuites,
  suiteRuns,
  realtimeOutbox,
} from '@testdog/server/db/schema';
import { saveTest, deleteTest, renameTest, getTest } from '@testdog/server/test-cases/repository';
import { moveTest } from './folders';
import { ownedBy, teamScope } from '@testdog/server/shared/ownership';
import { executeTeamCommand } from '@testdog/server/teams/repository';
import { listTestPage } from '@testdog/server/workspace/queries';
import { getSuiteTree, getSuite, saveSuite, listSuites, deleteSuite } from './repository';
import { startSuite, getSuiteRun, listSuiteRuns, cancelSuiteRun } from './runs';

const page = { limit: 50, q: '', status: 'all', cursor: undefined };
const alice = { id: 'alice', name: 'Alice', email: 'alice@example.com' };
const bob = { id: 'bob', name: 'Bob', email: 'bob@example.com' };
const input = (name: string) => ({
  name,
  goal: `Check ${name}`,
  url: 'https://example.com',
  tags: [],
});

function request(id: string, key = randomUUID()) {
  return new Request(`http://localhost:3000/api/suites/${id}/runs`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
  });
}

beforeAll(async () => {
  await db.insert(authUsers).values([alice, bob]);
});
afterAll(async () => {
  await fixture.database?.client.close();
});

test('moves cases into one folder, validates ownership and prevents lost edits', async () => {
  const a = await saveTest(input('Login'), undefined, alice.id);
  const b = await saveTest(input('Checkout'), undefined, alice.id);
  const privateCase = await saveTest(input('Private'), undefined, bob.id);
  const smoke = await saveSuite(undefined, { name: 'Smoke', testIds: [a.id] }, alice.id);
  const regression = await saveSuite(
    undefined,
    { name: 'Regression', testIds: [a.id, b.id] },
    alice.id,
  );

  expect((await getSuite(regression.id, alice.id)).tests.map((item) => item.id)).toEqual([
    a.id,
    b.id,
  ]);
  expect((await listSuites({ ...page, q: 'Smoke' }, alice.id)).suites).toMatchObject([
    { id: smoke.id, testCount: 0 },
  ]);
  await expect(getSuite(smoke.id, bob.id)).rejects.toMatchObject({ status: 404 });
  await expect(
    saveSuite(undefined, { name: 'Bad', testIds: [a.id, privateCase.id] }, alice.id),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    saveSuite(smoke.id, { name: 'Bad', testIds: [privateCase.id], version: 1 }, alice.id),
  ).rejects.toMatchObject({ status: 409 });
  expect((await getSuite(smoke.id, alice.id)).name).toBe('Smoke');
  await saveSuite(smoke.id, { name: 'Smoke updated', testIds: [b.id], version: 1 }, alice.id);
  await expect(
    saveSuite(smoke.id, { name: 'Stale', testIds: [a.id], version: 1 }, alice.id),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    saveSuite(undefined, { name: 'Duplicates', testIds: [a.id, a.id] }, alice.id),
  ).rejects.toMatchObject({ status: 400 });
  expect(await db.select().from(testSuites).where(eq(testSuites.name, 'Bad'))).toHaveLength(0);
});

test('submits an atomic idempotent batch and preserves snapshots after edits and deletions', async () => {
  const a = await saveTest(input('Original A'), undefined, alice.id);
  const b = await saveTest(input('Original B'), undefined, alice.id);
  const suite = await saveSuite(
    undefined,
    { name: 'Snapshot suite', testIds: [a.id, b.id] },
    alice.id,
  );
  const key = randomUUID();
  const first = await startSuite(request(suite.id, key), suite.id, alice.id);

  expect(await startSuite(request(suite.id, key), suite.id, alice.id)).toEqual(first);
  const batch = await getSuiteRun(first.batchId, alice.id);

  expect(batch.total).toBe(2);
  expect(batch.status).toBe('queued');
  expect(batch.counts.queued).toBe(2);
  expect(new Set(batch.runs.map((run) => run.name))).toEqual(new Set(['Original A', 'Original B']));
  await expect(getSuiteRun(first.batchId, bob.id)).rejects.toMatchObject({ status: 404 });
  await expect(cancelSuiteRun(first.batchId, bob.id)).rejects.toMatchObject({ status: 404 });
  await saveTest(input('Changed'), a.id, alice.id);
  await saveSuite(suite.id, { name: 'Changed suite', testIds: [b.id], version: 1 }, alice.id);
  await deleteTest(a.id, alice.id);
  await deleteSuite(suite.id, alice.id);
  const history = await getSuiteRun(first.batchId, alice.id);

  expect(history.suiteId).toBeNull();
  expect(history.name).toBe('Snapshot suite');
  expect(history.runs.find((run) => run.name === 'Original A')).toMatchObject({
    testId: undefined,
  });
  expect(history.runs).toHaveLength(2);
});

test('rolls back the entire batch if creating any individual run fails', async () => {
  const a = await saveTest(input('Valid run'), undefined, alice.id);
  const b = await saveTest(input('Broken run'), undefined, alice.id);
  const suite = await saveSuite(
    undefined,
    { name: 'Rollback suite', testIds: [a.id, b.id] },
    alice.id,
  );

  await fixture.database!.client
    .exec(`CREATE FUNCTION reject_suite_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = 'Broken run' THEN RAISE EXCEPTION 'Simulated failure'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER reject_suite_test BEFORE INSERT ON test_runs FOR EACH ROW EXECUTE FUNCTION reject_suite_test();`);
  try {
    await expect(startSuite(request(suite.id), suite.id, alice.id)).rejects.toThrow();
    expect(await db.select().from(suiteRuns).where(eq(suiteRuns.suiteId, suite.id))).toHaveLength(
      0,
    );
    expect(await db.select().from(testRuns).where(eq(testRuns.testId, a.id))).toHaveLength(0);
  } finally {
    await fixture.database!.client.exec(
      'DROP TRIGGER reject_suite_test ON test_runs; DROP FUNCTION reject_suite_test();',
    );
  }
});

test('aggregates results and stops queued and active runs without modifying completed results', async () => {
  const cases = await Promise.all(
    ['Done', 'Failed', 'Active', 'Queued'].map((name) =>
      saveTest(input(name), undefined, alice.id),
    ),
  );
  const suite = await saveSuite(
    undefined,
    { name: 'Stop suite', testIds: cases.map((item) => item.id) },
    alice.id,
  );
  const { batchId } = await startSuite(request(suite.id), suite.id, alice.id);

  for (const [name, status] of [
    ['Done', 'passed'],
    ['Failed', 'failed'],
    ['Active', 'running'],
  ] as const)
    await db
      .update(testRuns)
      .set({ status })
      .where(and(eq(testRuns.batchId, batchId), eq(testRuns.name, name)));
  expect((await getSuiteRun(batchId, alice.id)).status).toBe('running');
  await cancelSuiteRun(batchId, alice.id);
  const batch = await getSuiteRun(batchId, alice.id);

  expect(batch.cancelRequested).toBe(true);
  expect(batch.counts).toMatchObject({ passed: 1, failed: 1, running: 1, cancelled: 1, queued: 0 });
  expect(batch.runs.find((run) => run.name === 'Active')).toMatchObject({ cancelRequested: true });
  expect(batch.runs.find((run) => run.name === 'Done')).toMatchObject({
    status: 'passed',
    cancelRequested: false,
  });
  await db
    .update(testRuns)
    .set({ status: 'cancelled' })
    .where(and(eq(testRuns.batchId, batchId), eq(testRuns.name, 'Active')));
  expect((await getSuiteRun(batchId, alice.id)).status).toBe('failed');
});

test('shares suites and batches within a team, including latest-result filters and realtime events', async () => {
  const { activeTeamId } = await executeTeamCommand(alice, { action: 'create', name: 'Suite QA' });
  const scope = teamScope(activeTeamId!);
  const a = await saveTest(input('Team login'), undefined, scope);
  const suite = await saveSuite(undefined, { name: 'Team smoke', testIds: [a.id] }, scope);
  const { batchId } = await startSuite(request(suite.id), suite.id, scope);

  expect((await getSuiteRun(batchId, scope)).counts.queued).toBe(1);
  await expect(getSuite(suite.id, alice.id)).rejects.toMatchObject({ status: 404 });
  await expect(getSuite(suite.id, null)).rejects.toMatchObject({ status: 404 });
  await expect(
    saveSuite(undefined, { name: 'Cross workspace', testIds: [a.id] }, alice.id),
  ).rejects.toMatchObject({ status: 409 });
  await db.update(testRuns).set({ status: 'passed' }).where(eq(testRuns.batchId, batchId));
  expect(
    (await listTestPage({ ...page, status: 'passed' }, scope)).tests.map((item) => item.id),
  ).toContain(a.id);
  expect(
    (await listTestPage({ ...page, status: 'none' }, scope)).tests.map((item) => item.id),
  ).not.toContain(a.id);
  const events = await db
    .select()
    .from(realtimeOutbox)
    .where(and(ownedBy(realtimeOutbox, scope), eq(realtimeOutbox.kind, 'suites')));

  expect(events).toHaveLength(1);
  expect(events[0].teamId).toBe(activeTeamId);
  const second = await startSuite(request(suite.id), suite.id, scope);
  const firstPage = await listSuiteRuns({ ...page, limit: 1 }, scope, suite.id);

  expect(firstPage.nextCursor).toBeTruthy();
  const cursor = JSON.parse(Buffer.from(firstPage.nextCursor!, 'base64url').toString());
  const secondPage = await listSuiteRuns({ ...page, limit: 1, cursor }, scope, suite.id);

  expect(new Set([firstPage.batches[0].id, secondPage.batches[0].id])).toEqual(
    new Set([batchId, second.batchId]),
  );
  expect((await listSuiteRuns(page, bob.id, suite.id)).batches).toHaveLength(0);
});

test('removes deleted cases from suite membership and rejects empty-suite execution', async () => {
  const a = await saveTest(input('Removed'), undefined, alice.id);
  const suite = await saveSuite(undefined, { name: 'Empty suite', testIds: [a.id] }, alice.id);

  await deleteTest(a.id, alice.id);
  expect((await getSuite(suite.id, alice.id)).tests).toHaveLength(0);
  await expect(startSuite(request(suite.id), suite.id, alice.id)).rejects.toMatchObject({
    status: 409,
  });
});

test('runs nested folders with unique cases, validates moves and preserves history after recursive deletion', async () => {
  const a = await saveTest(input('Nested A'), undefined, alice.id);
  const b = await saveTest(input('Nested B'), undefined, alice.id);
  const root = await saveSuite(undefined, { name: 'Regression folder', testIds: [] }, alice.id);
  const one = await saveSuite(
    undefined,
    { name: 'Smoke folder', parentId: root.id, testIds: [a.id] },
    alice.id,
  );
  const two = await saveSuite(
    undefined,
    { name: 'Checkout folder', parentId: one.id, testIds: [a.id, b.id] },
    alice.id,
  );
  const parent = await getSuite(root.id, alice.id);

  expect(parent.testCount).toBe(0);
  expect(parent.totalTestCount).toBe(2);
  expect(parent.folders.map((folder) => folder.id)).toEqual([one.id]);
  await expect(
    saveSuite(root.id, { name: 'Cycle', parentId: two.id, testIds: [], version: 1 }, alice.id),
  ).rejects.toMatchObject({ status: 409 });
  const outsider = await saveSuite(undefined, { name: 'Private parent', testIds: [] }, bob.id);

  await expect(
    saveSuite(
      one.id,
      { name: 'Invalid move', parentId: outsider.id, testIds: [a.id], version: 1 },
      alice.id,
    ),
  ).rejects.toMatchObject({ status: 404 });
  const first = await startSuite(request(root.id), root.id, alice.id);

  expect((await getSuiteRun(first.batchId, alice.id)).total).toBe(2);
  const childRun = await startSuite(request(two.id), two.id, alice.id);

  await saveSuite(
    two.id,
    { name: 'Moved', parentId: null, testIds: [a.id, b.id], version: 1 },
    alice.id,
  );
  expect((await getSuite(root.id, alice.id)).totalTestCount).toBe(0);
  expect((await getSuite(two.id, alice.id)).parentId).toBeNull();
  await deleteSuite(root.id, alice.id);
  await expect(getSuite(one.id, alice.id)).rejects.toMatchObject({ status: 404 });
  expect((await getSuite(two.id, alice.id)).name).toBe('Moved');
  expect((await getSuiteRun(first.batchId, alice.id)).suiteId).toBeNull();
  expect((await getSuiteRun(childRun.batchId, alice.id)).runs).toHaveLength(2);
  expect(await db.select().from(testRuns).where(eq(testRuns.testId, a.id))).not.toHaveLength(0);
});

test('creates cases in a folder atomically, moves them and returns them to root on folder deletion', async () => {
  const first = await saveSuite(undefined, { name: 'First', testIds: [] }, alice.id);
  const second = await saveSuite(undefined, { name: 'Second', testIds: [] }, alice.id);
  const foreign = await saveSuite(undefined, { name: 'Private', testIds: [] }, bob.id);
  const item = await saveTest(
    { ...input('Owned location'), folderId: first.id },
    undefined,
    alice.id,
  );

  expect((await listTestPage(page, alice.id, first.id)).tests.map((row) => row.id)).toContain(
    item.id,
  );
  expect((await listTestPage(page, alice.id, null)).tests.map((row) => row.id)).not.toContain(
    item.id,
  );
  await expect(moveTest(item.id, foreign.id, alice.id)).rejects.toMatchObject({ status: 404 });
  await expect(moveTest(item.id, null, bob.id)).rejects.toMatchObject({ status: 404 });
  await moveTest(item.id, second.id, alice.id);
  expect((await getSuite(first.id, alice.id)).testCount).toBe(0);
  expect((await getSuite(second.id, alice.id)).tests.map((row) => row.id)).toEqual([item.id]);
  const before = await getSuite(second.id, alice.id);

  await saveSuite(
    second.id,
    { name: 'Renamed only', parentId: null, version: before.version },
    alice.id,
  );
  expect((await getSuite(second.id, alice.id)).testCount).toBe(1);
  await deleteSuite(second.id, alice.id);
  expect((await getSuiteTree(alice.id)).rootTests.map((row) => row.id)).toContain(item.id);
  const name = 'Must roll back';

  await expect(
    saveTest({ ...input(name), folderId: foreign.id }, undefined, alice.id),
  ).rejects.toMatchObject({ status: 404 });
  expect((await listTestPage({ ...page, q: name }, alice.id)).tests).toHaveLength(0);
});

test('renaming changes only the name and respects workspace ownership', async () => {
  const item = await saveTest(input('Rename target'), undefined, alice.id);

  await saveTest(
    { ...input('Rename target'), goal: 'Newer goal from another editor' },
    item.id,
    alice.id,
  );
  await renameTest(item.id, '  Renamed  ', alice.id);
  expect(await getTest(item.id, alice.id)).toMatchObject({
    name: 'Renamed',
    goal: 'Newer goal from another editor',
  });
  await expect(renameTest(item.id, 'Intruder', bob.id)).rejects.toMatchObject({ status: 404 });
  await expect(renameTest(item.id, ' ', alice.id)).rejects.toMatchObject({ status: 400 });
  expect((await getTest(item.id, alice.id)).name).toBe('Renamed');
});
