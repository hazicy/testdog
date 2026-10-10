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
  expect((await failed.json()).message).toContain('AI 转换失败');
});
