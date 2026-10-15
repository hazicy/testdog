import { z } from 'zod';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ compile: vi.fn(), auth: vi.fn() }));

vi.mock('@/server/shared/auth', () => ({ requireUserId: mocks.auth }));
vi.mock('@testdog/server/shared/model', () => ({ modelClient: {} }));
vi.mock('@testdog/automation/compiler/textCompiler', () => ({
  TextCompiler: class {
    compile = mocks.compile;
  },
}));
import { POST } from '@/app/api/tests/compile/route';

it('reports request cancellation distinctly from model failure', async () => {
  const controller = new AbortController();

  controller.abort();
  mocks.compile.mockRejectedValueOnce(new Error('aborted'));
  const response = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({ goal: '点击登录' }),
    }),
  );

  expect(response.status).toBe(408);
  expect((await response.json()).message).toContain('已取消');
});

it('passes native authoring context without requiring a selected execution device', async () => {
  mocks.compile.mockResolvedValueOnce({});
  const input = {
    goal: '填写 Ada',
    context: { platform: 'android', appId: 'com.example.app' },
  };
  const response = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );

  expect(response.status).toBe(200);
  expect(mocks.compile).toHaveBeenLastCalledWith(input, expect.any(AbortSignal));
  const invalid = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify({ ...input, url: 'https://example.com' }),
    }),
  );

  expect(invalid.status).toBe(400);
});

it('includes the current board when compiling an adjustment', async () => {
  const plan = {
    rootId: 'root',
    nodes: { root: { id: 'root', kind: 'group', goal: '登录测试', children: [], dependsOn: [] } },
  };

  mocks.compile.mockResolvedValueOnce(plan);
  const result = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify({ goal: '补充账号名称验证', currentPlan: plan }),
    }),
  );

  expect(result.status).toBe(200);
  expect(mocks.compile).toHaveBeenLastCalledWith(
    { goal: '补充账号名称验证', currentPlan: plan },
    expect.any(AbortSignal),
  );
});

it('authenticates, validates input and compiles text without saving a case', async () => {
  const plan = {
    rootId: 'a',
    nodes: {
      a: {
        id: 'a',
        kind: 'task',
        goal: '点击登录',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
    },
  };

  mocks.compile.mockResolvedValueOnce(plan);
  const result = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify({ goal: '点击登录', url: 'https://example.com' }),
    }),
  );

  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ plan });
  expect(mocks.auth).toHaveBeenCalled();
  expect(mocks.compile).toHaveBeenCalledWith(
    { goal: '点击登录', url: 'https://example.com' },
    expect.any(AbortSignal),
  );
  const invalid = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify({ goal: '' }),
    }),
  );

  expect(invalid.status).toBe(400);
  const failure = new Error('Provider unavailable');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  mocks.compile.mockRejectedValueOnce(failure);
  const failed = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify({ goal: '点击登录' }),
    }),
  );

  expect(failed.status).toBe(502);
  expect((await failed.json()).message).toContain('步骤生成失败');
  expect(log).toHaveBeenCalledWith('步骤生成失败', failure);
  log.mockRestore();
});

it('rejects removed input configuration before calling the compiler', async () => {
  mocks.compile.mockClear();
  const response = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify({ goal: '填写姓名', context: { platform: 'web', inputs: {} } }),
    }),
  );

  expect(response.status).toBe(400);
  expect(mocks.compile).not.toHaveBeenCalled();
});

it('reports invalid generated navigation URLs instead of hiding the validation failure', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  mocks.compile.mockRejectedValueOnce(
    new z.ZodError([
      {
        code: 'custom',
        message: '请在 Navigate 步骤中填写有效的 http 或 https 地址',
        path: ['nodes', 'open', 'goal'],
      },
    ]),
  );
  const response = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify({ goal: '打开网站' }),
    }),
  );

  expect(response.status).toBe(422);
  expect((await response.json()).message).toContain('请在描述中提供完整的 http 或 https 地址');
  log.mockRestore();
});
