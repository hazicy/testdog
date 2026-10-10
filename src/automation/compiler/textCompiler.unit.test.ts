import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWithOpenAI } from '@/automation/deepseek';
import { TextCompiler } from './textCompiler';

vi.mock('@/automation/deepseek', () => ({ generateWithOpenAI: vi.fn() }));
const generate = vi.mocked(generateWithOpenAI);
const task = {
  kind: 'task',
  id: 'login',
  goal: '使用 test@example.com 登录',
  dependsOn: [],
  requirementIds: ['R1'],
  assertions: [{ description: '显示主页' }],
};
const compiled = () => ({
  rootId: 'root',
  nodes: [
    { kind: 'group', id: 'root', goal: '登录', children: ['branch'], dependsOn: [] },
    {
      kind: 'branch',
      id: 'branch',
      condition: '显示登录页面',
      then: 'login',
      otherwise: null,
      dependsOn: [],
    },
    task,
  ],
});

function respond(content: unknown) {
  generate.mockResolvedValue({
    role: 'assistant',
    content: { type: 'text', text: JSON.stringify(content) },
    outputFormat: 'json_schema',
    structuredContent: content,
  } as Awaited<ReturnType<typeof generateWithOpenAI>>);
}

beforeEach(() => vi.clearAllMocks());
describe('TextCompiler flat plan', () => {
  it('returns a flat map with logical nesting and preserves task details', async () => {
    respond(compiled());
    const result = await new TextCompiler().compile('登录', 'https://example.com');

    expect(result.rootId).toBe('root');
    expect(result.nodes.login).toEqual(task);
    expect(result.nodes.root).toMatchObject({ children: ['branch'] });
    expect(result.nodes.branch).not.toHaveProperty('otherwise');
    expect(result).not.toHaveProperty('startUrl');
    expect(generate.mock.calls[0][0].messages).toEqual([
      {
        role: 'user',
        content: {
          type: 'text',
          text: JSON.stringify({ goal: '登录', startUrl: 'https://example.com' }),
        },
      },
    ]);
  });
  it('preserves an explicit otherwise reference', async () => {
    const content = compiled();

    respond({
      ...content,
      nodes: content.nodes.map((node) =>
        node.kind === 'branch' ? { ...node, otherwise: 'login' } : node,
      ),
    });
    expect((await new TextCompiler().compile('登录')).nodes.branch).toMatchObject({
      otherwise: 'login',
    });
  });
  it.each([
    ['duplicate IDs', () => ({ ...compiled(), nodes: [...compiled().nodes, task] })],
    ['missing root', () => ({ ...compiled(), rootId: 'missing' })],
    [
      'dangling references',
      () => ({ ...compiled(), nodes: compiled().nodes.filter((n) => n.id !== 'login') }),
    ],
    [
      'cycles',
      () => ({
        ...compiled(),
        nodes: compiled().nodes.map((n) => (n.id === 'login' ? { ...n, dependsOn: ['root'] } : n)),
      }),
    ],
    ['empty groups', () => ({ rootId: 'root', nodes: [{ ...compiled().nodes[0], children: [] }] })],
    [
      'empty assertions',
      () => ({ rootId: 'login', nodes: [{ ...task, assertions: [{ description: '' }] }] }),
    ],
  ])('rejects %s', async (_name, content) => {
    respond(content());
    await expect(new TextCompiler().compile('登录')).rejects.toThrow();
  });
  it('allows tasks without assertions or requirements', async () => {
    respond({ rootId: 'login', nodes: [{ ...task, requirementIds: [], assertions: [] }] });
    expect((await new TextCompiler().compile('登录')).nodes.login).toMatchObject({
      assertions: [],
      requirementIds: [],
    });
  });
});

it('regenerates a plan after validation feedback, without accepting an ancestor dependency cycle', async () => {
  const original = compiled();
  const invalid = {
    ...original,
    nodes: original.nodes.map((n) => (n.id === 'login' ? { ...n, dependsOn: ['branch'] } : n)),
  };

  respond(compiled());
  generate.mockResolvedValueOnce({
    role: 'assistant',
    content: { type: 'text', text: JSON.stringify(invalid) },
    toolCalls: [],
    outputFormat: 'json_schema',
    structuredContent: invalid,
  } as Awaited<ReturnType<typeof generateWithOpenAI>>);
  const result = await new TextCompiler().compile('登录');

  expect(result.nodes.login.dependsOn).toEqual([]);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(generate.mock.calls[1][0].messages)).toContain('Cycle detected');
});
