import { claimRun, registerWorker, withLease, releaseLease } from './scheduler';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));
vi.mock('@/db', async () => {
  const result = await (await import('./testDatabase')).createTestDatabase();
  isolated.client = result.client;
  return { db: result.db };
});
import {
  saveTest,
  createRun,
  getRun,
  deleteTest,
  finishRun,
  recoverExpiredRuns,
  requestCancellation,
  insertStep,
  saveRecordingVersion,
  listRecordingVersions,
} from './store';
beforeEach(async () => {
  await isolated.client!.exec('TRUNCATE run_artifacts, run_steps, test_runs, test_cases CASCADE');
});
afterAll(() => isolated.client!.close());
async function finishClaimed(...args: Parameters<typeof finishRun>) {
  await registerWorker('store-test', 'test', [
    { id: 'store-web', hostId: 'test', platform: 'web', profileId: 'mobile' },
  ]);
  const claim = (await claimRun('store-test', 'test', args[0]))!;
  await withLease(claim.lease, () => finishRun(...args));
  await releaseLease(claim.lease, true);
}
const input = { name: 'Login', url: 'https://example.com', goal: 'Verify login', tags: ['smoke'] };
describe('PostgreSQL workspace repository', () => {
  it('queues concurrent runs and preserves execution snapshots after edit and delete', async () => {
    const test = await saveTest(input);
    const results = await Promise.allSettled([
      createRun({ testId: test.id }),
      createRun({ testId: test.id }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const run = (
      results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof createRun>>
      >
    ).value;
    await saveTest({ ...input, goal: 'Changed test' }, test.id);
    await deleteTest(test.id);
    const saved = await getRun(run.id);
    expect(saved.goal).toBe('Verify login');
    expect(saved.testId).toBeUndefined();
  });
  it('recovers an expired lease, but leaves live workers running', async () => {
    const test = await saveTest(input);
    const run = await createRun({ testId: test.id });
    await recoverExpiredRuns();
    expect((await getRun(run.id)).status).toBe('queued');
    await registerWorker('recovery', 'test', [
      { id: 'recovery-web', hostId: 'test', platform: 'web', profileId: 'mobile' },
    ]);
    const claim = (await claimRun('recovery', 'test', run.id))!;
    await withLease(claim.lease, () =>
      insertStep({
        id: randomUUID(),
        runId: run.id,
        sequence: 1,
        kind: 'wait',
        title: 'Wait for page',
        status: 'running',
        startedAt: new Date(Date.now() - 120000).toISOString(),
        pageId: 'page-1',
        pageUrl: input.url,
        replayable: true,
      }),
    );
    await isolated.client!.query(
      'UPDATE test_runs SET "leaseUntil" = now() - interval \'2 minutes\' , "heartbeatAt" = now() - interval \'2 minutes\'  , "startedAt" = now() - interval \'2 minutes\' WHERE id = $1',
      [run.id],
    );
    const recovered = await getRun(run.id);
    expect(recovered.status).toBe('failed');
    expect(recovered.error).toContain('连接中断');
    expect(recovered.durationMs).toBeGreaterThanOrEqual(120000);
    expect(recovered.steps[0].status).toBe('failed');
    expect(recovered.steps[0].durationMs).toBeGreaterThanOrEqual(120000);
    expect(recovered.finishedAt).toBeDefined();
    expect((await createRun({ testId: test.id })).status).toBe('queued');
  });
  it('stores cancellation intent and rejects replay of an incomplete recording', async () => {
    const run = await createRun({ case: 'Check title', url: input.url });
    await requestCancellation(run.id);
    expect((await getRun(run.id)).cancelRequested).toBe(true);
    expect((await getRun(run.id)).status).toBe('cancelled');
    await expect(finishRun(run.id, 'cancelled', run.startedAt)).rejects.toThrow('claimed');
    await expect(createRun({ mode: 'replay', sourceRunId: run.id })).rejects.toThrow('不能重放');
  });
});

it('saves independent versions and claims an immutable replay snapshot from a repaired failed recording', async () => {
  const original = await createRun({ case: 'Original goal', url: input.url });
  await expect(
    saveRecordingVersion(original.id, 'await page1.goto("https://example.com");'),
  ).rejects.toThrow('结束');
  await finishClaimed(original.id, 'failed', original.startedAt, 'Original failure');
  await expect(saveRecordingVersion(original.id, 'process.exit();')).rejects.toThrow('第 1 行');
  const version = await saveRecordingVersion(
    original.id,
    'await page1.goto("https://example.com");\nawait expect(page1).toHaveURL("https://example.com/");',
  );
  expect(await listRecordingVersions(original.id)).toHaveLength(1);
  const replay = await createRun({
    mode: 'replay',
    sourceRunId: original.id,
    recordingVersionId: version.id,
  });
  expect(replay.recordingVersionId).toBe(version.id);
  expect(replay.recordingSteps).toHaveLength(2);
  await saveRecordingVersion(original.id, 'await page1.goto("https://other.example.com");');
  expect((await getRun(replay.id)).recordingSteps?.[0].action?.value).toBe('https://example.com');
  expect((await getRun(original.id)).error).toBe('Original failure');
  await finishClaimed(replay.id, 'passed', replay.startedAt);
  const unrelated = await createRun({ case: 'Other run', url: input.url });
  await finishClaimed(unrelated.id, 'failed', unrelated.startedAt);
  await expect(
    createRun({ mode: 'replay', sourceRunId: unrelated.id, recordingVersionId: version.id }),
  ).rejects.toThrow('不属于');
});
