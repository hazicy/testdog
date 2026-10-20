import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  execute: vi.fn(),
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@/server/shared/auth', () => ({ requireUserId: async () => null }));
vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  mocks.client = result.client;

  return { db: result.db };
});
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('@testdog/server/execution/executeRun', () => ({ executeRun: mocks.execute }));
import { saveTest } from '@testdog/server/test-cases/repository';
import { getRun } from '@testdog/server/runs/repository';
import { POST, GET } from '@/app/api/runs/route';

beforeEach(async () => {
  vi.clearAllMocks();
  await mocks.client!.exec(
    'TRUNCATE submission_requests, run_artifacts, run_steps, test_runs, test_cases CASCADE',
  );
});
afterAll(() => mocks.client!.close());
const request = (body: unknown) =>
  new Request('http://localhost/api/runs', { method: 'POST', body: JSON.stringify(body) });

describe('execution API with PostgreSQL persistence', () => {
  it('persists a draft plan and target as an independent run without modifying cases', async () => {
    const saved = await saveTest(
      {
        name: 'Saved',
        goal: 'Original',
        url: 'https://example.com',
        tags: [],
      },
      undefined,
      null,
    );
    const draft = {
      name: 'Edited draft',
      goal: 'Check the draft',
      target: {
        schemaVersion: 1,
        platform: 'web',
        url: 'https://example.com/draft',
        browser: 'chromium',
        deviceProfile: 'legacy-desktop',
      },
      plan: {
        rootId: 'check',
        nodes: {
          check: {
            id: 'check',
            kind: 'task',
            actionType: 'assert',
            goal: 'Check draft',
            dependsOn: [],
            requirementIds: [],
            assertions: [{ description: 'Draft appears' }],
          },
        },
      },
    };
    const response = await POST(request({ draft }));

    expect(response.status).toBe(202);
    const { run } = await response.json();
    const persisted = await getRun(run.id, { userId: null });

    expect(persisted.testId).toBeUndefined();
    expect(persisted.name).toBe('Edited draft · 草稿试跑');
    expect(persisted.plan).toEqual(draft.plan);
    expect(persisted.targetSnapshot).toEqual(draft.target);
    const cases = await mocks.client!.query<{ id: string; name: string; goal: string }>(
      'SELECT id, name, goal FROM test_cases',
    );

    expect(cases.rows).toEqual([{ id: saved.id, name: 'Saved', goal: 'Original' }]);
    expect(
      (
        await POST(
          request({
            draft: {
              ...draft,
              plan: {
                rootId: 'empty',
                nodes: {
                  empty: { id: 'empty', kind: 'group', goal: 'Empty', children: [], dependsOn: [] },
                },
              },
            },
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('returns 202 only after persisting a run and schedules its background job', async () => {
    const test = await saveTest(
      {
        name: 'Login',
        goal: 'Check login',
        url: 'https://example.com',
        tags: [],
      },
      undefined,
      null,
    );
    const response = await POST(request({ testId: test.id }));

    expect(response.status).toBe(202);
    const { run } = await response.json();

    expect((await getRun(run.id, { userId: null })).goal).toBe('Check login');
    expect((await getRun(run.id, { userId: null })).status).toBe('queued');
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect((await POST(request({ testId: test.id }))).status).toBe(202);
    expect((await (await GET(new Request('http://localhost/api/runs'))).json()).runs).toHaveLength(
      2,
    );
  });
  it('rejects invalid targets, malformed requests and missing cases without scheduling jobs', async () => {
    expect((await POST(request({ case: 'Check' }))).status).toBe(400);
    expect((await POST(request({ case: 'Check', url: 'file:///etc/passwd' }))).status).toBe(400);
    expect((await POST(request({ testId: '62534c46-a8eb-4991-993e-af6df14bece0' }))).status).toBe(
      404,
    );
    expect((await POST(request({ mode: 'replay' }))).status).toBe(400);
    expect(
      (await POST(request({ case: 'Check', sourceRunId: '62534c46-a8eb-4991-993e-af6df14bece0' })))
        .status,
    ).toBe(400);
    expect((await POST(request({ case: 'Check', unexpected: true }))).status).toBe(400);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

it('deduplicates concurrent submissions and rejects conflicting reuse of the request ID', async () => {
  const key = randomUUID();
  const submit = (body: unknown) =>
    POST(
      new Request('http://localhost/api/runs', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(body),
      }),
    );
  const body = { case: 'Idempotent', url: 'https://example.com' };
  const responses = await Promise.all([submit(body), submit(body)]);

  expect(responses.map((response) => response.status)).toEqual([202, 202]);
  const results = await Promise.all(responses.map((response) => response.json()));

  expect(results[0].run.id).toBe(results[1].run.id);
  const normalizedRetry = await submit({ ...body, case: '  Idempotent  ', mode: 'record' });

  expect(normalizedRetry.status).toBe(202);
  expect((await normalizedRetry.json()).run.id).toBe(results[0].run.id);
  expect((await (await GET(new Request('http://localhost/api/runs'))).json()).runs).toHaveLength(1);
  expect((await submit({ ...body, case: 'Different' })).status).toBe(409);
});
it('rolls back failed reservations so the same request can be retried', async () => {
  const key = randomUUID();
  const submit = (testId: string) =>
    POST(
      new Request('http://localhost/api/runs', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ testId }),
      }),
    );

  expect((await submit(randomUUID())).status).toBe(404);
  const test = await saveTest(
    {
      name: 'Retry',
      goal: 'Retry',
      url: 'https://example.com',
      tags: [],
    },
    undefined,
    null,
  );

  expect((await submit(test.id)).status).toBe(202);
});
