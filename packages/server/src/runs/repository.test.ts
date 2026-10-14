import { recordingOperation } from '@testdog/contracts/runs/lib/recordingOperation';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
import { saveTest, deleteTest } from '@testdog/server/test-cases/repository';
import { createRun as createQueuedRun } from '@testdog/server/runs/submission';
import {
  getRun,
  getRunInternal,
  insertStep as insertClaimedStep,
  appendEvent as appendClaimedEvent,
  insertArtifact as insertClaimedArtifact,
  appendBrowserLogs,
} from '@testdog/server/runs/repository';
import {
  finishRun as finishClaimedRun,
  finishRun as completeClaimedRun,
  requestCancellation,
} from '@testdog/server/runs/lifecycle';
import type { RunRequest } from '@testdog/contracts/runs/schemas';

import {
  claimRun,
  registerResources,
  recoverLeases,
  withLease,
} from '@testdog/server/scheduling/scheduler';
import { setRunPhase, type RunLease } from '@testdog/server/scheduling/lease';

import { listBrowserLogs } from '@testdog/server/runs/logs';
import { listRunPage, listTestPage } from '@testdog/server/workspace/queries';

const page = { limit: 50, q: '', status: 'all', cursor: undefined };
const listRuns = async () => (await listRunPage(page, null)).runs;
const listTests = async () => (await listTestPage(page, null)).tests;

const testLeases = new Map<string, RunLease>();

async function createRun(...args: Parameters<typeof createQueuedRun>) {
  const run = await createQueuedRun(...args);

  await registerResources([
    { id: `test:${run.id}`, hostId: 'test', platform: 'web', profileId: 'mobile' },
  ]);
  const claim = (await claimRun('repository-test', 'test', run.id))!;

  testLeases.set(run.id, claim.lease);
  await withLease(claim.lease, () => setRunPhase(run.id, 'running'));

  return getRun(run.id, { userId: null });
}

async function finishRun(
  id: string,
  status: import('@testdog/contracts/runs/types').RunStatus,
  error?: string,
) {
  return withLease(testLeases.get(id)!, async () =>
    finishClaimedRun(id, status, (await getRun(id, { userId: null })).startedAt, error),
  );
}

async function insertStep(...args: Parameters<typeof insertClaimedStep>) {
  return withLease(testLeases.get(args[0].runId)!, () => insertClaimedStep(...args));
}

async function appendEvent(...args: Parameters<typeof appendClaimedEvent>) {
  return withLease(testLeases.get(args[0])!, () => appendClaimedEvent(...args));
}

async function insertArtifact(...args: Parameters<typeof insertClaimedArtifact>) {
  return withLease(testLeases.get(args[0].runId)!, () => insertClaimedArtifact(...args));
}

beforeEach(async () => {
  await isolated.client!.exec(
    'TRUNCATE automation_resources, automation_run_events, run_artifacts, run_steps, test_runs, test_cases CASCADE',
  );
});
afterAll(() => isolated.client!.close());
const input = { name: 'Login', url: 'https://example.com', goal: 'Verify login', tags: ['smoke'] };

it('requires explicit user scopes and exposes worker reads through the internal entry', async () => {
  await isolated.client!.exec(`INSERT INTO auth_users (id,name,email) VALUES
    ('scope-alice','Alice','scope-alice@example.com'),
    ('scope-bob','Bob','scope-bob@example.com') ON CONFLICT DO NOTHING`);
  const alice = await createQueuedRun({ case: 'Alice', url: input.url }, undefined, 'scope-alice');
  const bob = await createQueuedRun({ case: 'Bob', url: input.url }, undefined, 'scope-bob');
  const unassigned = await createQueuedRun({ case: 'Local', url: input.url }, undefined, null);

  expect((await getRun(alice.id, { userId: 'scope-alice' })).id).toBe(alice.id);
  await expect(getRun(bob.id, { userId: 'scope-alice' })).rejects.toMatchObject({ status: 404 });
  await expect(getRun(alice.id, { userId: null })).rejects.toMatchObject({ status: 404 });
  expect((await getRun(unassigned.id, { userId: null })).id).toBe(unassigned.id);
  expect((await getRunInternal(bob.id)).id).toBe(bob.id);
  // @ts-expect-error A missing scope must fail both typechecking and at runtime.
  await expect(getRun(alice.id)).rejects.toThrow('必须指定');
  // @ts-expect-error Mutations cannot fall back to an unscoped query.
  await expect(requestCancellation(alice.id)).rejects.toThrow('必须指定');
  // @ts-expect-error Creation cannot silently choose unassigned ownership.
  await expect(createQueuedRun({ case: 'Missing scope', url: input.url })).rejects.toThrow(
    '必须指定',
  );
  // @ts-expect-error Case creation also requires an explicit scope.
  await expect(saveTest(input)).rejects.toThrow('必须指定');
  // @ts-expect-error Lists cannot silently select unassigned data.
  await expect(listRunPage(page)).rejects.toThrow('必须指定');
  expect((await getRunInternal(alice.id)).cancelRequested).toBe(false);
  expect((await listRunPage(page, null)).runs.map((run) => run.id)).toEqual([unassigned.id]);
});

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
  it('serializes concurrent events across attempts and rejects stale worker writes', async () => {
    const run = await createRun({ case: 'Events', url: input.url }, undefined, null);

    await Promise.all([appendEvent(run.id, 'First'), appendEvent(run.id, 'Second')]);
    await isolated.client!.query('UPDATE test_runs SET attempt = 2 WHERE id = $1', [run.id]);
    await appendEvent(run.id, 'Retry');
    const events = await isolated.client!.query<{
      sequence: number;
      attempt: number;
      message: string;
    }>(
      'SELECT sequence,attempt,message FROM automation_run_events WHERE "runId"=$1 ORDER BY sequence',
      [run.id],
    );

    expect(events.rows.map(({ sequence, attempt }) => [sequence, attempt])).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
    expect((await getRun(run.id, { userId: null })).events.map(({ message }) => message)).toEqual(
      events.rows.map(({ message }) => message),
    );
    const lease = testLeases.get(run.id)!;

    await expect(
      withLease({ ...lease, fencingToken: lease.fencingToken + 1 }, () =>
        appendClaimedEvent(run.id, 'Stale'),
      ),
    ).rejects.toThrow('Execution lease lost');
    expect((await getRun(run.id, { userId: null })).events).toHaveLength(3);
  });
  it('stores logs separately, tolerates retries, and rejects writes by stale workers', async () => {
    const run = await createRun({ case: 'Check', url: input.url }, undefined, null);
    const log: import('@testdog/contracts/runs/types').BrowserLog = {
      id: randomUUID(),
      at: new Date().toISOString(),
      elapsedMs: 1,
      pageId: 'page-1',
      pageUrl: input.url,
      kind: 'console',
      level: 'log',
      message: 'hello',
    };
    const lease = testLeases.get(run.id)!;

    await withLease(lease, () => appendBrowserLogs(run.id, [log]));
    await withLease(lease, () => appendBrowserLogs(run.id, [log]));
    expect(
      (
        await listBrowserLogs(
          run.id,
          new Request(`http://localhost/api/runs/${run.id}/logs?kind=all`),
          null,
        )
      ).logs,
    ).toEqual([log]);
    expect(await getRun(run.id, { userId: null })).not.toHaveProperty('browserLogs');
    const rows = await isolated.client!.query<{ data: unknown }>(
      'SELECT data FROM run_browser_logs WHERE "runId" = $1',
      [run.id],
    );

    expect(rows.rows).toEqual([{ data: log }]);
    await expect(
      withLease({ ...lease, fencingToken: lease.fencingToken + 1 }, () =>
        appendBrowserLogs(run.id, [{ ...log, id: randomUUID() }]),
      ),
    ).rejects.toThrow('Execution lease lost');
    expect(
      (
        await listBrowserLogs(
          run.id,
          new Request(`http://localhost/api/runs/${run.id}/logs?kind=all`),
          null,
        )
      ).logs,
    ).toEqual([log]);
    expect(await getRun(run.id, { userId: null })).not.toHaveProperty('browserLogs');
    // Empty batches need no lease or database access, even for an unknown run.
    await appendBrowserLogs(randomUUID(), []);
  });
  it('normalizes case writes and excludes protected fields at the repository boundary', async () => {
    const requestedId = randomUUID();
    const saved = await saveTest(
      {
        ...input,
        id: requestedId,
        createdAt: '2000-01-01',
        name: '  Login  ',
        goal: '  Verify login  ',
        tags: [' smoke '],
      } as typeof input,
      undefined,
      null,
    );

    expect(saved.id).not.toBe(requestedId);
    expect(saved.name).toBe('Login');
    expect(saved.goal).toBe('Verify login');
    expect(saved.tags).toEqual(['smoke']);
    expect(saved.createdAt).not.toContain('2000');
    await expect(saveTest({ ...input, name: ' ' }, saved.id, null)).rejects.toMatchObject({
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
    await expect(saveTest(request, undefined, null)).rejects.toMatchObject({ status: 400 });
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
    await expect(createRun(request as RunRequest, undefined, null)).rejects.toMatchObject({
      status: 400,
    });
    expect(await listRuns()).toHaveLength(0);
    const valid = await createRun({ case: '  Check title  ', url: input.url }, undefined, null);

    expect(valid.goal).toBe('Check title');
    expect(valid.mode).toBe('record');
  });
  it('lists lightweight summaries while retaining full detail for reports and replay', async () => {
    const test = await saveTest(input, undefined, null);
    const run = await createRun({ testId: test.id }, undefined, null);

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
    ])
      expect(summary).not.toHaveProperty(field);
    expect(JSON.stringify(summary).length).toBeLessThan(1000);
    const detail = await getRun(run.id, { userId: null });

    expect(detail.events[0].message).toHaveLength(180000);
    expect(detail.steps).toHaveLength(1);
    expect(detail.recordingSteps).toHaveLength(1);
    await deleteTest(test.id, null);
    expect((await listRuns())[0].testId).toBeUndefined();
  });
  it('keeps timeline order stable when screenshots share an elapsed time', async () => {
    const run = await createRun({ case: 'Timeline', url: input.url }, undefined, null);
    const ids = [
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ];

    for (const [index, id] of ids.entries())
      await insertArtifact(
        {
          id,
          runId: run.id,
          kind: 'screenshot',
          stage: 'live',
          pageId: 'page-1',
          pageUrl: input.url,
          capturedAt: index === 0 ? '2026-10-01T00:00:01Z' : '2026-10-01T00:00:00Z',
          elapsedMs: 1000,
          contentType: 'image/jpeg',
          size: 10,
        },
        `/private/timeline-${id}.jpg`,
      );
    const expected = [ids[2], ids[1], ids[0]];

    expect(
      (await getRun(run.id, { userId: null })).artifacts.map((artifact) => artifact.id),
    ).toEqual(expected);
    expect(
      (await getRun(run.id, { userId: null })).artifacts.map((artifact) => artifact.id),
    ).toEqual(expected);
  });
  it.each(['passed', 'failed', 'cancelled'] as const)(
    'does not persist %s or interrupt steps after execution ownership changes',
    async (status) => {
      const run = await createRun({ case: 'Ownership', url: input.url }, undefined, null);
      const step = pendingStep(run.id);

      await insertStep(step);
      await isolated.client!.query('UPDATE test_runs SET "workerId" = $1 WHERE id = $2', [
        'replacement-worker',
        run.id,
      ]);
      await expect(finishRun(run.id, status, 'Old worker result')).rejects.toThrow('lease lost');
      const current = await getRun(run.id, { userId: null });

      expect(current.status).toBe('running');
      expect(current.finishedAt).toBeUndefined();
      expect(current.error).toBeUndefined();
      expect(current.steps[0]).toMatchObject({ id: step.id, status: 'running' });
      expect(current.steps[0].finishedAt).toBeUndefined();
    },
  );
  it.each(['finish', 'recover'] as const)(
    'rolls back %s when saving step state fails',
    async (operation) => {
      const run = await createRun({ case: 'Atomic execution', url: input.url }, undefined, null);

      await insertStep(pendingStep(run.id));
      if (operation === 'recover')
        await isolated.client!.query(
          'UPDATE test_runs SET "leaseUntil" = now() - interval \'2 minutes\' WHERE id = $1',
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
          operation === 'finish' ? finishRun(run.id, 'failed', 'Browser closed') : recoverLeases(),
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
    const run = await createRun({ case: 'Interrupted run', url: input.url }, undefined, null);

    await insertStep(pendingStep(run.id));
    await finishRun(run.id, 'failed', 'Browser closed');
    const finished = await getRun(run.id, { userId: null });

    expect(finished.status).toBe('failed');
    expect(finished.steps[0].status).toBe('failed');
    expect(finished.steps[0].finishedAt).toBe(finished.finishedAt);
    expect(finished.steps[0].error).toBe('Browser closed');
    await expect(finishRun(run.id, 'passed')).rejects.toThrow('lease lost');
    expect(await getRun(run.id, { userId: null })).toEqual(finished);
  });

  it('keeps live runs and their pending steps untouched while recovering an expired run', async () => {
    const expired = await createRun({ case: 'Expired worker', url: input.url }, undefined, null);

    await insertStep(pendingStep(expired.id));
    await isolated.client!.query(
      'UPDATE test_runs SET "leaseUntil" = now() - interval \'2 minutes\' WHERE id = $1',
      [expired.id],
    );
    const live = await createRun({ case: 'Live worker', url: input.url }, undefined, null);
    const step = pendingStep(live.id);

    await insertStep(step);
    await recoverLeases();
    const current = await getRun(live.id, { userId: null });

    expect(current.status).toBe('running');
    expect(current.steps[0].status).toBe('running');
    expect(current.steps[0].finishedAt).toBeUndefined();
    expect((await getRun(expired.id, { userId: null })).steps[0].status).toBe('failed');
  });

  it('serializes run claims and preserves execution snapshots after edit and delete', async () => {
    const test = await saveTest(input, undefined, null);
    const results = await Promise.allSettled([
      createRun({ testId: test.id }, undefined, null),
      createRun({ testId: test.id }, undefined, null),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const run = (
      results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof createRun>>
      >
    ).value;

    await saveTest({ ...input, goal: 'Changed test' }, test.id, null);
    await deleteTest(test.id, null);
    const saved = await getRun(run.id, { userId: null });

    expect(saved.goal).toBe('Verify login');
    expect(saved.testId).toBeUndefined();
  });
  it('recovers an expired lease, but leaves live workers running', async () => {
    const test = await saveTest(input, undefined, null);
    const run = await createRun({ testId: test.id }, undefined, null);

    await recoverLeases();
    expect((await getRun(run.id, { userId: null })).status).toBe('running');
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
      'UPDATE test_runs SET "leaseUntil" = now() - interval \'2 minutes\'  , "startedAt" = now() - interval \'2 minutes\' WHERE id = $1',
      [run.id],
    );
    expect((await getRun(run.id, { userId: null })).status).toBe('running');
    await recoverLeases();
    const recovered = await getRun(run.id, { userId: null });

    expect(recovered.status).toBe('failed');
    expect(recovered.error).toContain('连接中断');
    expect(recovered.durationMs).toBeGreaterThanOrEqual(120000);
    expect(recovered.steps[0].status).toBe('failed');
    expect(recovered.steps[0].durationMs).toBeGreaterThanOrEqual(120000);
    expect(recovered.finishedAt).toBeDefined();
    expect((await createRun({ testId: test.id }, undefined, null)).status).toBe('running');
  });
  it('stores cancellation intent and rejects replay of an incomplete recording', async () => {
    const run = await createRun({ case: 'Check title', url: input.url }, undefined, null);

    await requestCancellation(run.id, null);
    expect((await getRun(run.id, { userId: null })).cancelRequested).toBe(true);
    await finishRun(run.id, 'cancelled');
    await expect(
      createRun({ mode: 'replay', sourceRunId: run.id }, undefined, null),
    ).rejects.toThrow('不能重放');
  });
});

it('snapshots an authored tree and clears it for a text goal override', async () => {
  const plan = {
    rootId: 'task',
    nodes: {
      task: {
        id: 'task',
        kind: 'task' as const,
        goal: '点击登录',
        dependsOn: [],
        requirementIds: [],
        assertions: [{ description: '显示登录表单' }],
      },
    },
  };
  const saved = await saveTest(
    {
      name: 'Authored',
      url: 'https://example.com',
      goal: '登录',
      tags: [],
      plan,
    },
    undefined,
    null,
  );
  const first = await createQueuedRun({ testId: saved.id }, undefined, null);

  expect(first.plan).toEqual(plan);
  await saveTest(
    { ...saved, target: saved.target ?? undefined, goal: '修改文本', plan: null },
    saved.id,
    null,
  );
  expect((await getRun(first.id, { userId: null }))?.plan).toEqual(plan);
  const overridden = await createQueuedRun(
    { testId: saved.id, goalOverride: '只检查首页' },
    undefined,
    null,
  );

  expect(overridden.plan).toBeUndefined();
});

it('uses the validated target URL for new cases and native temporary runs', async () => {
  const saved = await saveTest(
    { ...input, url: '  https://example.com/trimmed  ' },
    undefined,
    null,
  );

  expect(saved.url).toBe('https://example.com/trimmed');
  expect(saved.target).toMatchObject({ url: saved.url, deviceProfile: 'Pixel 7' });
  const native = await createQueuedRun(
    {
      case: 'Open app',
      url: input.url,
      target: {
        platform: 'ios',
        appId: 'com.example.app',
        deviceProfileId: 'phone',
      },
    },
    undefined,
    null,
  );

  expect(native.url).toBe('');
  expect(native.targetSnapshot?.platform).toBe('ios');
});

it('commits an automatic issue when a failed run is finalized', async () => {
  const { issues, issueOccurrences } = await import('@testdog/server/db/schema');
  const { db } = await import('@testdog/server/db');
  const { eq } = await import('drizzle-orm');
  const run = await createRun({ case: '验证金额', url: input.url }, undefined, null);

  await insertStep({
    ...pendingStep(run.id),
    kind: 'assertion',
    title: '金额为100',
    assertion: { description: '金额为100' },
    status: 'failed',
    error: '实际为120',
  });
  await finishRun(run.id, 'failed', '实际为120');
  const [occurrence] = await db
    .select()
    .from(issueOccurrences)
    .where(eq(issueOccurrences.runId, run.id));

  expect(occurrence).toBeDefined();
  const [issue] = await db.select().from(issues).where(eq(issues.id, occurrence.issueId));

  expect(issue).toMatchObject({ title: '金额为100', category: 'product', status: 'open' });
});

it('freezes per-platform target overrides without modifying the case', async () => {
  const target = {
    schemaVersion: 1 as const,
    platform: 'web' as const,
    url: input.url,
    browser: 'chromium' as const,
    deviceProfile: 'Pixel 7' as const,
  };
  const saved = await saveTest(
    {
      ...input,
      target,
      goal: 'Fill Ada and submit',
    },
    undefined,
    null,
  );
  const first = await createQueuedRun(
    {
      testId: saved.id,
      target: {
        platform: 'ios',
        appId: 'com.example.app',
        deviceProfileId: 'phone',
      },
    },
    undefined,
    null,
  );
  const second = await createQueuedRun(
    {
      testId: saved.id,
      target: {
        platform: 'android',
        appId: 'com.example.app',
        deviceProfileId: 'phone',
      },
    },
    undefined,
    null,
  );

  expect(first.url).toBe('');
  expect(first.targetSnapshot.platform).toBe('ios');
  expect(second.targetSnapshot.platform).toBe('android');
  await saveTest(
    {
      ...input,
      target: {
        ...target,
        url: `${input.url}/changed`,
      },
    },
    saved.id,
    null,
  );
  expect((await getRun(first.id, { userId: null })).targetSnapshot).toEqual(first.targetSnapshot);
  expect((await getRun(second.id, { userId: null })).targetSnapshot).toEqual(second.targetSnapshot);
});

it('commits cancellation, evidence completeness and error code together at finalization', async () => {
  const run = await createRun({ case: 'Cancel while archiving', url: input.url }, undefined, null);

  await requestCancellation(run.id, null);
  await withLease(testLeases.get(run.id)!, () =>
    completeClaimedRun(run.id, 'failed', run.startedAt, 'archive failed', {
      evidenceComplete: false,
      errorCode: 'FINALIZATION_FAILED',
    }),
  );
  expect(await getRun(run.id, { userId: null })).toMatchObject({
    status: 'cancelled',
    errorCode: 'CANCELLED',
    evidenceComplete: false,
    replayable: false,
  });
});

it('freezes the replay plan and ordered steps when submitted', async () => {
  const plan = {
    rootId: 'task',
    nodes: {
      task: {
        id: 'task',
        kind: 'task' as const,
        goal: '原计划',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
    },
  };
  const saved = await saveTest({ ...input, plan }, undefined, null);
  const source = await createRun({ testId: saved.id }, undefined, null);
  const step = { ...pendingStep(source.id), status: 'passed' as const };

  await insertStep(step);
  await finishRun(source.id, 'passed');
  await isolated.client!.query('UPDATE test_runs SET "environmentSnapshot" = $1 WHERE id = $2', [
    JSON.stringify({ browserVersion: 'recorded-version' }),
    source.id,
  ]);
  const recorded = await getRun(source.id, { userId: null });
  const replay = await createQueuedRun({ mode: 'replay', sourceRunId: source.id }, undefined, null);

  expect(replay.plan).toEqual(recorded.plan);
  expect(replay.recordingSteps).toEqual(recorded.steps.map(recordingOperation));
  for (const operation of replay.recordingSteps!) {
    for (const field of ['id', 'runId', 'status', 'startedAt', 'evidence'])
      expect(operation).not.toHaveProperty(field);
  }

  expect(replay.replayEnvironmentSnapshot).toEqual(recorded.environmentSnapshot);
  await isolated.client!.query(
    'UPDATE test_runs SET plan = NULL, "environmentSnapshot" = NULL WHERE id = $1',
    [source.id],
  );
  await isolated.client!.query('UPDATE run_steps SET title = $1 WHERE "runId" = $2', [
    '修改后的动作',
    source.id,
  ]);
  const frozen = await getRun(replay.id, { userId: null });

  expect(frozen.plan).toEqual(plan);
  expect(frozen.recordingSteps).toEqual(recorded.steps.map(recordingOperation));
  expect(frozen.replayEnvironmentSnapshot).toEqual(recorded.environmentSnapshot);
  await isolated.client!.query('DELETE FROM test_runs WHERE id = $1', [source.id]);
  const detached = await getRun(replay.id, { userId: null });

  expect(detached.sourceRunId).toBeUndefined();
  expect(detached.replayEnvironmentSnapshot).toEqual({ browserVersion: 'recorded-version' });
  expect(detached.recordingSteps).toEqual(recorded.steps.map(recordingOperation));
});
