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
    goal: '填写 ${input.name}',
    context: { platform: 'android', appId: 'com.example.app', inputs: { name: { value: 'Ada' } } },
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
  mocks.compile.mockRejectedValueOnce(new Error('Provider unavailable'));
  const failed = await POST(
    new Request('http://localhost/api/tests/compile', {
      method: 'POST',
      body: JSON.stringify({ goal: '点击登录' }),
    }),
  );

  expect(failed.status).toBe(502);
  expect((await failed.json()).message).toContain('步骤生成失败');
});
