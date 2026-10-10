import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ compile: vi.fn(), auth: vi.fn() }));

vi.mock('@/server/shared/auth', () => ({ requireUserId: mocks.auth }));
vi.mock('@/server/shared/model', () => ({ modelClient: {} }));
vi.mock('@/automation/compiler/textCompiler', () => ({
  TextCompiler: class {
    compile = mocks.compile;
  },
}));
import { POST } from './route';

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
    expect.stringContaining('当前计划：'),
    undefined,
    expect.any(AbortSignal),
  );
  const prompt = mocks.compile.mock.lastCall?.[0] as string;

  expect(JSON.parse(prompt.split('当前计划：')[1].split('\n修改要求：')[0])).toEqual(plan);
  expect(prompt).toContain('补充账号名称验证');
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
    '点击登录',
    'https://example.com',
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
