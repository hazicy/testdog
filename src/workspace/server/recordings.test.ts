import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));
vi.mock('@/db', async () => {
  const result = await (await import('./testDatabase')).createTestDatabase();
  isolated.client = result.client;
  return { db: result.db };
});
import { createRun, getRun, savePlan } from './store';
import { finishRun } from './runLifecycle';
import { saveRecordingVersion, listRecordingVersions } from './recordings';

beforeEach(async () => {
  await isolated.client!.exec('TRUNCATE run_artifacts, run_steps, test_runs, test_cases CASCADE');
});
afterAll(() => isolated.client!.close());
const input = { url: 'https://example.com' };

it.each(['constructor', 'toString', '__proto__'])(
  'rejects inherited object properties as plan node links: %s',
  async (nodeId) => {
    const run = await createRun({ case: 'Node links', url: input.url });
    await savePlan(run.id, {
      rootId: 'task',
      nodes: {
        task: {
          id: 'task',
          kind: 'task',
          goal: 'Open',
          dependsOn: [],
          requirementIds: [],
          assertions: [],
        },
      },
    });
    await finishRun(run.id, 'passed');
    await expect(
      saveRecordingVersion(run.id, `// @node ${nodeId}\nawait page1.goto("https://example.com");`),
    ).rejects.toThrow(`计划节点 ${nodeId} 不存在`);
    expect(await listRecordingVersions(run.id)).toEqual([]);
    const version = await saveRecordingVersion(
      run.id,
      '// @node task\nawait page1.goto("https://example.com");',
    );
    const replay = await createRun({
      mode: 'replay',
      sourceRunId: run.id,
      recordingVersionId: version.id,
    });
    expect(replay.recordingSteps?.[0].planNodeId).toBe('task');
  },
);

it.each(['', ' '.repeat(100001)])(
  'rejects invalid script size before reading or writing records',
  async (code) => {
    await expect(saveRecordingVersion(randomUUID(), code)).rejects.toMatchObject({
      status: 400,
      message: '请提供有效脚本（最多 100,000 字符）。',
    });
  },
);

it('preserves scripts exactly at the length limit', async () => {
  const run = await createRun({ case: 'Script boundary', url: input.url });
  await finishRun(run.id, 'passed');
  const statement = 'await page1.goto("https://example.com");\n//';
  const code = statement + 'x'.repeat(100000 - statement.length);
  const version = await saveRecordingVersion(run.id, code);
  expect(version.code).toBe(code);
  expect((await listRecordingVersions(run.id))[0].code).toBe(code);
});

it('distinguishes missing recordings from recordings without edited versions', async () => {
  const missing = randomUUID();
  await expect(listRecordingVersions(missing)).rejects.toMatchObject({ status: 404 });
  await expect(
    saveRecordingVersion(missing, 'await page1.goto("https://example.com");'),
  ).rejects.toMatchObject({ status: 404 });
  const run = await createRun({ case: 'Check title', url: input.url });
  expect(await listRecordingVersions(run.id)).toEqual([]);
  await finishRun(run.id, 'passed');
  await expect(
    saveRecordingVersion(run.id, '// @node unknown\nawait page1.goto("https://example.com");'),
  ).rejects.toThrow('计划节点 unknown 不存在');
  expect(await listRecordingVersions(run.id)).toEqual([]);
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
