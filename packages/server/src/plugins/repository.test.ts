import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
vi.mock('@/server/shared/auth', async () => {
  const { WorkspaceError } = await import('@testdog/server/shared/errors');

  return {
    requireUserId: async (request: Request) => {
      const user = request.headers.get('test-user');

      if (!user) throw new WorkspaceError('请先登录', 401);

      return user;
    },
  };
});
import { db } from '@testdog/server/db';
import { authUsers, testRuns, runSteps } from '@testdog/server/db/schema';
import { eq } from 'drizzle-orm';
import { readPluginSettings, savePluginSettings } from './repository';
import { saveTest, getTest } from '@testdog/server/test-cases/repository';
import { createRun } from '@testdog/server/runs/submission';
import { getRun } from '@testdog/server/runs/repository';
import { GET } from '../../../../apps/web/src/app/api/plugins/route';
import { PUT } from '../../../../apps/web/src/app/api/plugins/[pluginId]/route';

const config = () => ({
  urlIncludes: '/abtest_config',
  dataPath: '/data',
  experiments: [
    { key: 'checkout', groups: [{ name: 'B', value: { layout: 'new' }, variantId: '200' }] },
  ],
});
const context = { params: Promise.resolve({ pluginId: 'volcengine-abtest' }) };

beforeEach(async () => {
  await isolated.client!.exec(
    'TRUNCATE auth_users, test_cases, test_runs, plugin_settings CASCADE',
  );
  await db.insert(authUsers).values([
    { id: 'alice', name: 'Alice', email: 'alice@example.com' },
    { id: 'bob', name: 'Bob', email: 'bob@example.com' },
  ]);
});
afterAll(async () => isolated.client?.close());

it('persists shared configuration per account and protects both endpoints', async () => {
  expect((await GET(new Request('http://localhost/api/plugins'))).status).toBe(401);
  expect(
    (
      await PUT(
        new Request('http://localhost/api/plugins/volcengine-abtest', {
          method: 'PUT',
          body: '{}',
        }),
        context,
      )
    ).status,
  ).toBe(401);
  const request = new Request('http://localhost/api/plugins/volcengine-abtest', {
    method: 'PUT',
    headers: { 'test-user': 'alice' },
    body: JSON.stringify({ version: 0, config: config() }),
  });

  expect((await PUT(request, context)).status).toBe(200);
  expect((await readPluginSettings('alice')).settings[0]).toMatchObject({
    version: 1,
    config: config(),
  });
  expect((await readPluginSettings('bob')).settings[0]).toMatchObject({
    version: 0,
    config: { experiments: [] },
  });
  expect((await readPluginSettings(null)).settings[0].version).toBe(0);
});

it('rejects duplicate keys and groups and detects stale saves including first-save races', async () => {
  const duplicate = config();

  duplicate.experiments.push(duplicate.experiments[0]);
  await expect(
    savePluginSettings('volcengine-abtest', { version: 0, config: duplicate }, 'alice'),
  ).rejects.toThrow();
  const groups = config();

  groups.experiments[0].groups.push(groups.experiments[0].groups[0]);
  await expect(
    savePluginSettings('volcengine-abtest', { version: 0, config: groups }, 'alice'),
  ).rejects.toThrow();
  await savePluginSettings('volcengine-abtest', { version: 0, config: config() }, 'alice');
  await expect(
    savePluginSettings('volcengine-abtest', { version: 0, config: config() }, 'alice'),
  ).rejects.toMatchObject({ status: 409 });
  await savePluginSettings('volcengine-abtest', { version: 1, config: config() }, 'alice');
  await expect(
    savePluginSettings('volcengine-abtest', { version: 1, config: config() }, 'alice'),
  ).rejects.toMatchObject({ status: 409 });
});

it('keeps case nodes to key and group and freezes resolved values for record and replay', async () => {
  await savePluginSettings('volcengine-abtest', { version: 0, config: config() }, 'alice');
  const selection = { id: 'volcengine-abtest', config: { key: 'checkout', group: 'B' } };
  const saved = await saveTest(
    {
      name: 'AB test',
      url: 'https://example.com',
      goal: 'Use B',
      plan: {
        rootId: 'plugin',
        nodes: {
          plugin: {
            id: 'plugin',
            kind: 'task',
            actionType: 'plugin',
            goal: 'Checkout B',
            plugin: selection,
            dependsOn: [],
            requirementIds: [],
            assertions: [],
          },
        },
      },
    },
    undefined,
    'alice',
  );
  const first = await createRun({ testId: saved.id }, undefined, 'alice');

  expect((await getTest(saved.id, 'alice')).plan?.nodes.plugin).toMatchObject({
    plugin: selection,
  });
  const initial = first.plan!.nodes.plugin;

  if (initial.kind !== 'task' || !initial.plugin) throw new Error('Missing plugin');
  expect(initial.plugin.config).toMatchObject({
    key: 'checkout',
    value: { layout: 'new' },
    urlIncludes: '/abtest_config',
  });
  const changed = config();

  changed.experiments[0].groups[0].value = { layout: 'updated' };
  await savePluginSettings('volcengine-abtest', { version: 1, config: changed }, 'alice');
  const second = await createRun({ testId: saved.id }, undefined, 'alice');

  expect(second.plan!.nodes.plugin).toMatchObject({
    plugin: { config: { value: { layout: 'updated' } } },
  });
  expect((await getRun(first.id, { userId: 'alice' })).plan!.nodes.plugin).toMatchObject({
    plugin: { config: { value: { layout: 'new' } } },
  });
  await db
    .update(testRuns)
    .set({ status: 'passed', replayable: true })
    .where(eq(testRuns.id, first.id));
  await db.insert(runSteps).values({
    id: crypto.randomUUID(),
    runId: first.id,
    sequence: 1,
    kind: 'action',
    title: 'Use B',
    status: 'passed',
    startedAt: new Date().toISOString(),
    pageId: 'page-1',
    pageUrl: 'https://example.com',
    planNodeId: 'plugin',
    action: { platform: 'web', action: { type: 'plugin', plugin: initial.plugin } },
  });
  const replay = await createRun({ mode: 'replay', sourceRunId: first.id }, undefined, 'alice');

  expect(replay.recordingSteps?.[0].action).toMatchObject({
    action: { plugin: { config: { value: { layout: 'new' } } } },
  });
  await expect(createRun({ testId: saved.id }, undefined, 'bob')).rejects.toThrow('用例不存在');
  await savePluginSettings(
    'volcengine-abtest',
    { version: 2, config: { ...config(), experiments: [] } },
    'alice',
  );
  await expect(createRun({ testId: saved.id }, undefined, 'alice')).rejects.toThrow('未配置实验组');
});
