import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  state.client = result.client;

  return { db: result.db };
});
import { createRun } from '@testdog/server/runs/submission';
import { getRun, getArtifact } from '@testdog/server/runs/repository';
import { saveTest } from '@testdog/server/test-cases/repository';
import { executeTestRun as executeRun } from '@testdog/server/testing/executeTestRun';

const enabled = process.env.RUN_WORKSPACE_LIVE_TESTS === 'true';
let server: Server;
let url: string;
let directory: string;

beforeAll(async () => {
  if (!enabled) return;
  directory = await mkdtemp(join(tmpdir(), 'testdog-live-'));
  vi.stubEnv('TESTDOG_DATA_DIR', directory);
  vi.stubEnv('AUTOMATION_HEADLESS', 'true');
  const html = await readFile(
    join(process.cwd(), 'packages/server/src/runs/fixtures/checkout.html'),
    'utf8',
  );

  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/login' || request.url === '/register') {
      const register = request.url === '/register';

      response.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>
        <h1>${register ? '创建账号' : '登录 testdog'}</h1>
        <form>${register ? '<label>姓名<input required></label>' : ''}
          <label>邮箱<input type="email" required></label>
          <label>密码<input type="password" required></label>
          <button>${register ? '注册' : '登录'}</button>
        </form>
        <a href="${register ? '/login' : '/register'}">${register ? '登录' : '注册'}</a>
        <script>document.querySelector('form').onsubmit = event => {
          event.preventDefault();
          document.querySelector('h1').textContent = '提交成功';
          document.querySelector('form').hidden = true;
        };</script>
      </body></html>`);

      return;
    }

    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
it.skipIf(!enabled)(
  'switches between login and registration links without repeatedly clicking same-named submit buttons',
  async () => {
    const test = await saveTest(
      {
        name: '登录注册往返 · 同名链接与按钮',
        url: `${url}/login`,
        goal: `打开 ${url}/login。
点击表单下方的“注册”链接。
验证页面标题为“创建账号”，并显示姓名、邮箱和密码输入框。
点击表单下方的“登录”链接。
验证回到登录页，页面标题为“登录 testdog”。`,
        tags: ['regression'],
      },
      undefined,
      null,
    );
    const run = await createRun({ testId: test.id }, undefined, null);

    await executeRun(run);
    const result = await getRun(run.id, { userId: null });

    expect(result.status, result.error).toBe('passed');
    const clicks = result.steps.filter(
      (step) => step.action?.platform === 'web' && step.action.action.type === 'click',
    );

    expect(clicks).toHaveLength(2);
    expect(clicks.map((step) => step.action)).toMatchObject([
      { action: { target: { kind: 'role', value: 'link', name: '注册' } } },
      { action: { target: { kind: 'role', value: 'link', name: '登录' } } },
    ]);
  },
  360000,
);
it.skipIf(!enabled).each([
  {
    name: 'explicit return navigation',
    goal: '点击表单下方的“注册”链接，然后点击注册页面表单下方的“登录”链接返回登录页。',
    expected: '页面主标题为“登录 testdog”',
    clicks: [
      { action: { target: { kind: 'role', value: 'link', name: '注册' } } },
      { action: { target: { kind: 'role', value: 'link', name: '登录' } } },
    ],
  },
  {
    name: 'explicit same-named form submission',
    goal: '点击表单下方的“注册”链接，在注册页面姓名填写 Ada，邮箱填写 ada@example.com，密码填写 TestPassword123!，然后点击表单的“注册”按钮。',
    expected: '页面主标题为“提交成功”',
    clicks: [
      { action: { target: { kind: 'role', value: 'link', name: '注册' } } },
      { action: { target: { kind: 'role', value: 'button', name: '注册' } } },
    ],
  },
])(
  'completes a compound task with $name',
  async ({ goal, expected, clicks }) => {
    const test = await saveTest(
      {
        name: goal,
        url: `${url}/login`,
        goal,
        tags: ['regression'],
        plan: {
          rootId: 'root',
          nodes: {
            root: { id: 'root', kind: 'group', goal, children: ['open', 'task'], dependsOn: [] },
            open: {
              id: 'open',
              kind: 'task',
              actionType: 'navigate',
              goal: `${url}/login`,
              dependsOn: [],
              requirementIds: [],
              assertions: [],
            },
            task: {
              id: 'task',
              kind: 'task',
              actionType: 'act',
              goal,
              dependsOn: [],
              requirementIds: [],
              assertions: [{ description: expected }],
            },
          },
        },
      },
      undefined,
      null,
    );
    const run = await createRun({ testId: test.id }, undefined, null);

    await executeRun(run);
    const result = await getRun(run.id, { userId: null });

    expect(result.status, result.error).toBe('passed');
    const actions = result.steps.filter(
      (step) => step.action?.platform === 'web' && step.action.action.type === 'click',
    );

    expect(actions).toHaveLength(clicks.length);
    expect(actions.map((step) => step.action)).toMatchObject(clicks);
  },
  360000,
);
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
  await state.client?.close();
  vi.unstubAllEnvs();
});
it.skipIf(!enabled)(
  'compiles a real natural language case, records browser actions and replays with the real model',
  async () => {
    const test = await saveTest(
      {
        name: '订阅表单 · 真实模型验证',
        url,
        goal: '在当前网页的「姓名」输入框中填写 Ada，在「邮箱」输入框中填写 ada@example.com，然后点击「订阅更新」按钮。验证页面显示「订阅成功，Ada」，并显示邮箱 ada@example.com。',
        tags: ['smoke', 'form'],
      },
      undefined,
      null,
    );
    const run = await createRun({ testId: test.id }, undefined, null);

    await executeRun(run);
    const recorded = await getRun(run.id, { userId: null });

    expect(recorded.status, recorded.error).toBe('passed');
    expect(recorded.steps.some((step) => step.kind === 'action')).toBe(true);
    expect(recorded.steps.some((step) => step.kind === 'assertion')).toBe(true);
    expect(recorded.artifacts.some((artifact) => artifact.kind === 'video')).toBe(true);
    expect(recorded.replayable).toBe(true);
    const replay = await createRun({ mode: 'replay', sourceRunId: run.id }, undefined, null);

    await executeRun(replay);
    const result = await getRun(replay.id, { userId: null });

    expect(result.status, result.error).toBe('passed');
    expect(result.steps.length).toBe(recorded.steps.length);
    const preview = process.env.TESTDOG_PREVIEW_DIR;

    if (preview) {
      await mkdir(preview, { recursive: true });
      await writeFile(
        join(preview, 'workspace.json'),
        JSON.stringify({ tests: [test], runs: [result, recorded] }),
      );
      for (const item of [recorded, result])
        for (const artifact of item.artifacts) {
          const file = await getArtifact(item.id, artifact.id, null);

          await copyFile(file.path, join(preview, artifact.id));
        }
    }
  },
  660000,
);
