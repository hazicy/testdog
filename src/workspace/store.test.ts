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
  insertStep,
  saveRecordingVersion,
  listRecordingVersions,
  listRuns,
  appendEvent,
  listTests,
} from './store';
import { finishRun, recoverExpiredRuns, requestCancellation } from './runLifecycle';
import type { RunRequest } from './validation';
beforeEach(async () => {
  await isolated.client!.exec('TRUNCATE run_artifacts, run_steps, test_runs, test_cases CASCADE');
});
afterAll(() => isolated.client!.close());
const input = { name: 'Login', url: 'https://example.com', goal: 'Verify login', tags: ['smoke'] };
function pendingStep(runId: string) {
  return {
    id: randomUUID(),
    runId,
    sequence: 1,
    kind: 'wait' as const,
    title: 'Wait for page',
    status: 'running' as const,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    pageId: 'page-1',
    pageUrl: input.url,
    replayable: true,
  };
}
describe('PostgreSQL workspace repository', () => {
  it('normalizes case writes and excludes protected fields at the repository boundary', async () => {
    const requestedId = randomUUID();
    const saved = await saveTest({
      ...input,
      id: requestedId,
      createdAt: '2000-01-01',
      name: '  Login  ',
      goal: '  Verify login  ',
      tags: [' smoke '],
    } as typeof input);
    expect(saved.id).not.toBe(requestedId);
    expect(saved.name).toBe('Login');
    expect(saved.goal).toBe('Verify login');
    expect(saved.tags).toEqual(['smoke']);
    expect(saved.createdAt).not.toContain('2000');
    await expect(saveTest({ ...input, name: ' ' }, saved.id)).rejects.toMatchObject({
      status: 400,
    });
    expect((await listTests())[0]).toEqual(saved);
  });

  it.each([
    { ...input, name: '' },
    { ...input, goal: ' ' },
    { ...input, url: 'javascript:alert(1)' },
    { ...input, tags: Array(11).fill('tag') },
  ])('rejects invalid case writes before persistence: %j', async (request) => {
    await expect(saveTest(request)).rejects.toMatchObject({ status: 400 });
    expect(await listTests()).toHaveLength(0);
  });
  it.each([
    {},
    { mode: 'replay' },
    { mode: 'replay', testId: '62534c46-a8eb-4991-993e-af6df14bece0' },
    { case: '   ', url: input.url },
    { case: 'Check', url: 'file:///tmp/index.html' },
    { case: 'Check', sourceRunId: '62534c46-a8eb-4991-993e-af6df14bece0' },
  ])('rejects invalid run parameters before acquiring a run: %j', async (request) => {
    await expect(createRun(request as RunRequest)).rejects.toMatchObject({ status: 400 });
    expect(await listRuns()).toHaveLength(0);
    const valid = await createRun({ case: '  Check title  ', url: input.url });
    expect(valid.goal).toBe('Check title');
    expect(valid.mode).toBe('record');
  });
  it('lists lightweight summaries while retaining full detail for reports and replay', async () => {
    const test = await saveTest(input);
    const run = await createRun({ testId: test.id });
    await insertStep(pendingStep(run.id));
    await appendEvent(run.id, 'Detailed evidence '.repeat(10000));
    await isolated.client!.query(
      'UPDATE test_runs SET "recordingSteps" = $1::jsonb WHERE id = $2',
      [JSON.stringify([pendingStep(run.id)]), run.id],
    );
    const [summary] = await listRuns();
    expect(summary).toMatchObject({
      id: run.id,
      testId: test.id,
      name: input.name,
      status: 'running',
    });
    for (const field of [
      'goal',
      'plan',
      'events',
      'steps',
      'artifacts',
      'recordingSteps',
      'workerId',
      'heartbeatAt',
    ])
      expect(summary).not.toHaveProperty(field);
    expect(JSON.stringify(summary).length).toBeLessThan(1000);
    const detail = await getRun(run.id);
    expect(detail.events[0].message).toHaveLength(180000);
    expect(detail.steps).toHaveLength(1);
    expect(detail.recordingSteps).toHaveLength(1);
    await deleteTest(test.id);
    expect((await listRuns())[0].testId).toBeUndefined();
  });
  it.each(['finish', 'recover'] as const)(
    'rolls back %s when saving step state fails',
    async (operation) => {
      const run = await createRun({ case: 'Atomic execution', url: input.url });
      await insertStep(pendingStep(run.id));
      if (operation === 'recover')
        await isolated.client!.query(
          'UPDATE test_runs SET "heartbeatAt" = now() - interval \'2 minutes\' WHERE id = $1',
          [run.id],
        );
      await isolated.client!.exec(`
      CREATE FUNCTION reject_step_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'step write failed'; END $$;
      CREATE TRIGGER reject_step_update BEFORE UPDATE ON run_steps
      FOR EACH ROW EXECUTE FUNCTION reject_step_update();
    `);
      try {
        await expect(
          operation === 'finish'
            ? finishRun(run.id, 'failed', 'Browser closed')
            : recoverExpiredRuns(),
        ).rejects.toThrow();
        const result = await isolated.client!.query<{ status: string; finishedAt: string | null }>(
          'SELECT status, "finishedAt" FROM test_runs WHERE id = $1',
          [run.id],
        );
        expect(result.rows[0]).toEqual({ status: 'running', finishedAt: null });
        expect(
          (
            await isolated.client!.query<{ status: string }>(
              'SELECT status FROM run_steps WHERE "runId" = $1',
              [run.id],
            )
          ).rows[0].status,
        ).toBe('running');
      } finally {
        await isolated.client!.exec(
          'DROP TRIGGER reject_step_update ON run_steps; DROP FUNCTION reject_step_update();',
        );
      }
    },
  );

  it('finalizes pending steps with the run and preserves the first terminal result on retry', async () => {
    const run = await createRun({ case: 'Interrupted run', url: input.url });
    await insertStep(pendingStep(run.id));
    await finishRun(run.id, 'failed', 'Browser closed');
    const finished = await getRun(run.id);
    expect(finished.status).toBe('failed');
    expect(finished.steps[0].status).toBe('failed');
    expect(finished.steps[0].finishedAt).toBe(finished.finishedAt);
    expect(finished.steps[0].error).toBe('Browser closed');
    await finishRun(run.id, 'passed');
    expect(await getRun(run.id)).toEqual(finished);
  });

  it('keeps live runs and their pending steps untouched while recovering an expired run', async () => {
    const expired = await createRun({ case: 'Expired worker', url: input.url });
    await insertStep(pendingStep(expired.id));
    await isolated.client!.query(
      'UPDATE test_runs SET "heartbeatAt" = now() - interval \'2 minutes\' WHERE id = $1',
      [expired.id],
    );
    const live = await createRun({ case: 'Live worker', url: input.url });
    const step = pendingStep(live.id);
    await insertStep(step);
    await recoverExpiredRuns();
    const current = await getRun(live.id);
    expect(current.status).toBe('running');
    expect(current.steps[0].status).toBe('running');
    expect(current.steps[0].finishedAt).toBeUndefined();
    expect((await getRun(expired.id)).steps[0].status).toBe('failed');
  });

  it('serializes run claims and preserves execution snapshots after edit and delete', async () => {
    const test = await saveTest(input);
    const results = await Promise.allSettled([
      createRun({ testId: test.id }),
      createRun({ testId: test.id }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
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
    expect((await getRun(run.id)).status).toBe('running');
    await insertStep({
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
    });
    await isolated.client!.query(
      'UPDATE test_runs SET "heartbeatAt" = now() - interval \'2 minutes\'  , "startedAt" = now() - interval \'2 minutes\' WHERE id = $1',
      [run.id],
    );
    const recovered = await getRun(run.id);
    expect(recovered.status).toBe('failed');
    expect(recovered.error).toContain('连接中断');
    expect(recovered.durationMs).toBeGreaterThanOrEqual(120000);
    expect(recovered.steps[0].status).toBe('failed');
    expect(recovered.steps[0].durationMs).toBeGreaterThanOrEqual(120000);
    expect(recovered.finishedAt).toBeDefined();
    expect((await createRun({ testId: test.id })).status).toBe('running');
  });
  it('stores cancellation intent and rejects replay of an incomplete recording', async () => {
    const run = await createRun({ case: 'Check title', url: input.url });
    await requestCancellation(run.id);
    expect((await getRun(run.id)).cancelRequested).toBe(true);
    await finishRun(run.id, 'cancelled');
    await expect(createRun({ mode: 'replay', sourceRunId: run.id })).rejects.toThrow('不能重放');
  });
});

it('saves independent versions and claims an immutable replay snapshot from a repaired failed recording', async () => {
  const original = await createRun({ case: 'Original goal', url: input.url });
  await expect(
    saveRecordingVersion(original.id, 'await page1.goto("https://example.com");'),
  ).rejects.toThrow('结束');
  await finishRun(original.id, 'failed', 'Original failure');
  await expect(saveRecordingVersion(original.id, 'process.exit();')).rejects.toThrow('第 1 行');
  const version = await saveRecordingVersion(
    original.id,
    'await page1.goto("https://example.com");\nawait expect(page1).toHaveURL("https://example.com/");',
  );
  const versions = await listRecordingVersions(original.id);
  expect(versions).toHaveLength(1);
  expect(versions[0]).toEqual(version);
  expect(version).not.toHaveProperty('steps');
  expect(versions[0]).not.toHaveProperty('steps');
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
  await finishRun(replay.id, 'passed');
  const unrelated = await createRun({ case: 'Other run', url: input.url });
  await finishRun(unrelated.id, 'failed');
  await expect(
    createRun({ mode: 'replay', sourceRunId: unrelated.id, recordingVersionId: version.id }),
  ).rejects.toThrow('不属于');
});
