import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  const database = await (
    await import('@testdog/server/testing/testDatabase')
  ).createTestDatabase();

  state.client = database.client;

  return { db: database.db };
});
vi.mock('@/server/shared/auth', () => ({ requireUserId: async () => null }));

import { db } from '@testdog/server/db';
import { testRuns, modelCalls, runSteps } from '@testdog/server/db/schema';
import { listModelCalls } from './modelUsage';
import { GET } from '../../../../apps/web/src/app/api/runs/[id]/model-usage/[callId]/route';

afterAll(async () => {
  await state.client?.close();
});

it('serves scoped call details while keeping summaries small and legacy calls readable', async () => {
  const runId = randomUUID();
  const otherRunId = randomUUID();
  const callId = randomUUID();
  const oldCallId = randomUUID();
  const stepId = randomUUID();
  const at = new Date().toISOString();
  const target = {
    schemaVersion: 1 as const,
    platform: 'web' as const,
    url: 'https://example.com',
    browser: 'chromium' as const,
    deviceProfile: 'Pixel 7' as const,
  };

  await db.insert(testRuns).values(
    [runId, otherRunId].map((id) => ({
      id,
      name: 'Run',
      goal: 'Click',
      status: 'passed' as const,
      targetSnapshot: target,
    })),
  );
  const metric = {
    startedAt: at,
    durationMs: 100,
    model: 'deepseek-flash',
    status: 'passed' as const,
    retryCount: 0,
    failedAttempts: 0,
  };

  await db.insert(modelCalls).values([
    {
      ...metric,
      id: callId,
      runId,
      trace: {
        input: [
          { role: 'system', content: 'Follow the plan' },
          { role: 'user', content: 'Click next' },
        ],
        reply: 'Click next',
        purpose: 'plan',
        tools: [{ id: 'tool-1', name: 'click', arguments: '{"ref":"e1"}' }],
      },
    },
    { ...metric, id: oldCallId, runId },
  ]);
  await db.insert(runSteps).values({
    id: stepId,
    runId,
    modelCallId: callId,
    toolCallId: 'tool-1',
    kind: 'action',
    title: 'click',
    sequence: 1,
    status: 'failed',
    startedAt: at,
    finishedAt: at,
    durationMs: 30,
    pageId: 'page-1',
    pageUrl: target.url,
    error: 'Target disappeared',
  });
  const summary = await listModelCalls(runId);

  expect(summary.find((call) => call.id === callId)).toMatchObject({
    hasTrace: true,
    purpose: 'plan',
    preview: 'Click next',
  });
  expect(summary.find((call) => call.id === oldCallId)).toMatchObject({
    hasTrace: false,
    purpose: null,
    preview: null,
  });
  expect(summary.every((call) => !('trace' in call))).toBe(true);
  const request = new Request('http://localhost/');
  const context = (id: string, modelId: string) => ({
    params: Promise.resolve({ id, callId: modelId }),
  });
  const response = await GET(request, context(runId, callId));

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    trace: {
      input: [
        { role: 'system', content: 'Follow the plan' },
        { role: 'user', content: 'Click next' },
      ],
      reply: 'Click next',
    },
    steps: [{ id: stepId, toolCallId: 'tool-1', status: 'failed', error: 'Target disappeared' }],
  });
  expect(await (await GET(request, context(runId, oldCallId))).json()).toEqual({
    trace: null,
    steps: [],
  });
  expect((await GET(request, context(otherRunId, callId))).status).toBe(404);
  expect((await GET(request, context(runId, randomUUID()))).status).toBe(404);
  expect((await GET(request, context(runId, 'invalid'))).status).toBe(400);
});
