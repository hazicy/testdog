import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  execute: vi.fn(),
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));
vi.mock('@/db', async () => {
  const result = await (await import('@/workspace/server/testDatabase')).createTestDatabase();
  mocks.client = result.client;
  return { db: result.db };
});
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('@/workspace/server/run', () => ({ executeRun: mocks.execute }));
import { saveTest, getRun } from '@/workspace/server/store';
import { POST, GET } from './route';
beforeEach(async () => {
  vi.clearAllMocks();
  await mocks.client!.exec('TRUNCATE run_artifacts, run_steps, test_runs, test_cases CASCADE');
});
afterAll(() => mocks.client!.close());
const request = (body: unknown) =>
  new Request('http://localhost/api/runs', { method: 'POST', body: JSON.stringify(body) });
describe('execution API with PostgreSQL persistence', () => {
  it('returns 202 only after persisting a run and schedules its background job', async () => {
    const test = await saveTest({
      name: 'Login',
      goal: 'Check login',
      url: 'https://example.com',
      tags: [],
    });
    const response = await POST(request({ testId: test.id }));
    expect(response.status).toBe(202);
    const { run } = await response.json();
    expect((await getRun(run.id)).goal).toBe('Check login');
    expect((await getRun(run.id)).status).toBe('queued');
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect((await POST(request({ testId: test.id }))).status).toBe(202);
    expect((await (await GET()).json()).runs).toHaveLength(2);
  });
  it('rejects invalid targets, malformed requests and missing cases without scheduling jobs', async () => {
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
