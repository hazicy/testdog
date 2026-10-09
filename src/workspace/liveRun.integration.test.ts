import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));
vi.mock('@/db', async () => {
  const result = await (await import('./testDatabase')).createTestDatabase();
  state.client = result.client;
  return { db: result.db };
});
import { createRun, getRun, getArtifact, saveTest } from './store';
import { executeRun } from './run';
const enabled = process.env.RUN_WORKSPACE_LIVE_TESTS === 'true';
let server: Server;
let url: string;
let directory: string;
beforeAll(async () => {
  if (!enabled) return;
  directory = await mkdtemp(join(tmpdir(), 'caseforge-live-'));
  vi.stubEnv('CASEFORGE_DATA_DIR', directory);
  vi.stubEnv('AUTOMATION_HEADLESS', 'true');
  const html = await readFile(join(process.cwd(), 'src/workspace/fixtures/checkout.html'), 'utf8');
  server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
  await state.client?.close();
  vi.unstubAllEnvs();
});
it.skipIf(!enabled)(
  'compiles a real natural language case, records browser actions and replays with the real model',
  async () => {
    const test = await saveTest({
      name: '订阅表单 · 真实模型验证',
      url,
      goal: '在当前网页的「姓名」输入框中填写 Ada，在「邮箱」输入框中填写 ada@example.com，然后点击「订阅更新」按钮。验证页面显示「订阅成功，Ada」，并显示邮箱 ada@example.com。',
      tags: ['smoke', 'form'],
    });
    const run = await createRun({ testId: test.id });
    await executeRun(run);
    const recorded = await getRun(run.id);
    expect(recorded.status, recorded.error).toBe('passed');
    expect(recorded.steps.some((step) => step.kind === 'action')).toBe(true);
    expect(recorded.steps.some((step) => step.kind === 'assertion')).toBe(true);
    expect(recorded.artifacts.some((artifact) => artifact.kind === 'video')).toBe(true);
    expect(recorded.replayable).toBe(true);
    const replay = await createRun({ mode: 'replay', sourceRunId: run.id });
    await executeRun(replay);
    const result = await getRun(replay.id);
    expect(result.status, result.error).toBe('passed');
    expect(result.steps.length).toBe(recorded.steps.length);
    const preview = process.env.CASEFORGE_PREVIEW_DIR;
    if (preview) {
      await mkdir(preview, { recursive: true });
      await writeFile(
        join(preview, 'workspace.json'),
        JSON.stringify({ tests: [test], runs: [result, recorded] }),
      );
      for (const item of [recorded, result])
        for (const artifact of item.artifacts) {
          const file = await getArtifact(item.id, artifact.id);
          await copyFile(file.path, join(preview, artifact.id));
        }
    }
  },
  240000,
);
