import type { Page } from 'playwright';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan, PlanNode } from './compiler/schema';
import { Observer } from './observer';
import { Executor } from './executor';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('./deepseek', () => ({ generateWithOpenAI: generate }));
vi.mock('./pageStability', () => ({
  performAndWaitForStablePage: async (page: Page, action: () => Promise<unknown>) => {
    await action();
    return page;
  },
}));

const task = (
  id: string,
  overrides: Partial<Extract<PlanNode, { kind: 'task' }>> = {},
): PlanNode => ({
  kind: 'task',
  id,
  goal: `goal ${id}`,
  dependsOn: [],
  requirementIds: [],
  assertions: [],
  ...overrides,
});
const group = (id: string, children: string[], dependsOn: string[] = []): PlanNode => ({
  kind: 'group',
  id,
  goal: `group ${id}`,
  children,
  dependsOn,
});
const branch = (otherwise?: string): PlanNode => ({
  kind: 'branch',
  id: 'branch',
  condition: 'Account exists',
  then: 'yes',
  otherwise,
  dependsOn: [],
});
const done = { content: { text: 'DONE' }, toolCalls: [] };
const action = (name: string, args: unknown) => ({
  content: { text: '' },
  toolCalls: [{ id: 'call-1', name, arguments: JSON.stringify(args) }],
});
const passed = { structuredContent: { passed: true, evidence: 'Visible success message' } };

function fixture(nodes: PlanNode[] = [group('root', [])], startUrl?: string) {
  const plan: Plan = {
    rootId: nodes[0].id,
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
  };
  const observation = { tree: {}, page: { url: 'https://example.com', focused: null } };
  const observer = new Observer();
  const observe = vi.spyOn(observer, 'observe').mockResolvedValue(observation);
  const page = { goto: vi.fn().mockResolvedValue(undefined) } as unknown as Page;
  const executor = new Executor(observer, plan, startUrl);
  const execute = vi.spyOn(executor, 'execute').mockResolvedValue(page);
  return { executor, observe, observation, page, execute };
}

function payload(index: number) {
  return JSON.parse(generate.mock.calls[index][0].messages[0].content.text);
}

beforeEach(() => vi.resetAllMocks());

describe('Executor Plan recording', () => {
  it('sends a plain string URL schema without the unsupported uri format', async () => {
    const { executor, page } = fixture([task('act')]);
    generate.mockResolvedValueOnce(done);
    await executor.record(page);
    const tool = generate.mock.calls[0][0].tools.find(
      (tool: { name: string }) => tool.name === 'navigate',
    );
    expect(tool.parameters.properties.url.type).toBe('string');
    expect(tool.parameters.properties.url).not.toHaveProperty('format');
  });

  it.each(['not-a-url', 'ftp://example.com', 'javascript:alert(1)'])(
    'rejects invalid navigation URL %s before execution',
    async (url) => {
      const { executor, page, execute } = fixture([task('act')]);
      generate.mockResolvedValueOnce(action('navigate', { url }));
      await expect(executor.record(page)).rejects.toThrow('Step act');
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'navigate',
      { url: 'https://example.com/next' },
      { type: 'navigate', value: 'https://example.com/next' },
    ],
    [
      'fill',
      { ref: 'e18', value: '' },
      { type: 'fill', target: { kind: 'ariaRef', value: 'e18', name: '' }, value: '' },
    ],
    [
      'press',
      { ref: 'f1e297', value: 'Enter' },
      { type: 'press', target: { kind: 'ariaRef', value: 'f1e297', name: '' }, value: 'Enter' },
    ],
  ])(
    'executes %s then observes and plans without an acknowledgement turn',
    async (name, args, step) => {
      const { executor, page, execute, observe } = fixture([task('act')]);
      generate.mockResolvedValueOnce(action(name as string, args)).mockResolvedValueOnce(done);
      await executor.record(page);
      expect(execute).toHaveBeenCalledExactlyOnceWith(page, expect.objectContaining(step));
      expect(observe).toHaveBeenCalledTimes(2);
      expect(observe.mock.invocationCallOrder[1]).toBeGreaterThan(
        execute.mock.invocationCallOrder[0],
      );
      expect(generate).toHaveBeenCalledTimes(2);
      expect(payload(1).completedSteps).toEqual([expect.objectContaining(step)]);
      const request = generate.mock.calls[0][0];
      expect(request.tools.map((tool: { name: string }) => tool.name)).toEqual([
        'navigate',
        'click',
        'fill',
        'press',
      ]);
      expect(request).not.toHaveProperty('responseFormat');
      expect(generate.mock.calls[1][0].messages).toHaveLength(1);
    },
  );

  it.each([
    ['click', { ref: 'textbox [ref=e18]' }],
    ['click', { ref: 'e18', extra: true }],
    ['fill', { ref: 'e18' }],
    ['press', { ref: 'e18', value: '' }],
    ['navigate', { url: 'javascript:alert(1)' }],
    ['unknown', {}],
  ])('rejects invalid %s arguments before execution', async (name, args) => {
    const { executor, page, execute } = fixture([task('bad')]);
    generate.mockResolvedValueOnce(action(name, args));
    await expect(executor.record(page)).rejects.toThrow('Step bad');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'limits execution to 20 actions with a final completion check: %s',
    async (complete) => {
      const { executor, page, execute, observe } = fixture([task('bounded')]);
      generate.mockResolvedValue(action('click', { ref: 'e1' }));
      for (let i = 0; i < 20; i++) generate.mockResolvedValueOnce(action('click', { ref: 'e1' }));
      generate.mockResolvedValueOnce(complete ? done : action('click', { ref: 'e1' }));
      if (complete) await executor.record(page);
      else await expect(executor.record(page)).rejects.toThrow('Step bounded');
      expect(execute).toHaveBeenCalledTimes(20);
      expect(observe).toHaveBeenCalledTimes(21);
      expect(generate).toHaveBeenCalledTimes(21);
      expect(payload(20).completedSteps).toHaveLength(20);
    },
  );

  it('executes multiple calls in order before observing again', async () => {
    const { executor, page, execute, observe } = fixture([task('batch')]);
    const first = action('fill', { ref: 'e1', value: 'account' });
    const second = action('fill', { ref: 'e2', value: 'password' });
    generate
      .mockResolvedValueOnce({
        content: { text: '' },
        toolCalls: [...first.toolCalls, ...second.toolCalls],
      })
      .mockResolvedValueOnce(done);
    await executor.record(page);
    expect(execute.mock.calls.map(([, step]) => step.value)).toEqual(['account', 'password']);
    expect(observe.mock.invocationCallOrder[1]).toBeGreaterThan(
      execute.mock.invocationCallOrder[1],
    );
    expect(payload(1).completedSteps).toHaveLength(2);
  });

  it('uses a new tab for subsequent actions, assertions, branches and tasks', async () => {
    const { executor, page, execute, observe } = fixture([
      group('root', ['open', 'branch', 'after']),
      task('open', { assertions: [{ description: 'New tab is visible' }] }),
      branch('no'),
      task('yes'),
      task('no'),
      task('after'),
    ]);
    const newPage = {} as Page;
    execute.mockResolvedValue(newPage);
    generate
      .mockResolvedValueOnce(action('click', { ref: 'e1' }))
      .mockResolvedValueOnce(action('fill', { ref: 'e2', value: 'new tab input' }))
      .mockResolvedValueOnce(done)
      .mockResolvedValueOnce(passed)
      .mockResolvedValueOnce(passed)
      .mockResolvedValueOnce(done)
      .mockResolvedValueOnce(done);

    await executor.record(page);

    expect(execute.mock.calls.map(([target]) => target)).toEqual([page, newPage]);
    expect(observe.mock.calls.map(([target]) => target)).toEqual([
      page,
      newPage,
      newPage,
      newPage,
      newPage,
      newPage,
      newPage,
    ]);
    expect(payload(5).goal).toBe('goal yes');
    expect(payload(6).goal).toBe('goal after');
  });

  it('passes a tab opened by a dependency to the dependent task', async () => {
    const { executor, page, execute, observe } = fixture([
      task('after', { dependsOn: ['open'] }),
      task('open'),
    ]);
    const newPage = {} as Page;
    execute.mockResolvedValue(newPage);
    generate
      .mockResolvedValueOnce(action('click', { ref: 'e1' }))
      .mockResolvedValueOnce(done)
      .mockResolvedValueOnce(done);

    await executor.record(page);

    expect(observe.mock.calls.map(([target]) => target)).toEqual([page, newPage, newPage]);
  });

  it('rejects malformed JSON without executing', async () => {
    const { executor, page, execute } = fixture([task('bad')]);
    const call = action('click', { ref: 'e1' });
    generate.mockResolvedValueOnce({
      ...call,
      toolCalls: [{ ...call.toolCalls[0], arguments: '{' }],
    });
    await expect(executor.record(page)).rejects.toThrow('Step bad');
    expect(execute).not.toHaveBeenCalled();
  });
  it('navigates first, recursively runs groups and checks task assertions in order', async () => {
    const { executor, page, observe, execute } = fixture(
      [
        group('root', ['a', 'nested', 'c']),
        task('a'),
        group('nested', ['b']),
        task('b', { assertions: [{ description: 'Success visible' }] }),
        task('c', {
          assertions: [{ description: 'Final success' }, { description: 'Still logged in' }],
        }),
      ],
      'https://example.com/start',
    );
    generate
      .mockResolvedValueOnce(done)
      .mockResolvedValueOnce(done)
      .mockResolvedValueOnce(passed)
      .mockResolvedValueOnce(done)
      .mockResolvedValueOnce(passed)
      .mockResolvedValueOnce(passed);
    await executor.record(page);
    expect(page.goto).toHaveBeenCalledWith('https://example.com/start', {
      waitUntil: 'domcontentloaded',
    });
    expect(vi.mocked(page.goto).mock.invocationCallOrder[0]).toBeLessThan(
      observe.mock.invocationCallOrder[0],
    );
    expect(
      generate.mock.calls.map((_, i) => payload(i).goal ?? payload(i).assertion.description),
    ).toEqual([
      'goal a',
      'goal b',
      'Success visible',
      'goal c',
      'Final success',
      'Still logged in',
    ]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs dependencies first and executes shared nodes only once per recording', async () => {
    const { executor, page } = fixture([
      group('root', ['a', 'nested', 'shared', 'a']),
      task('a', { dependsOn: ['shared'] }),
      group('nested', ['b'], ['shared']),
      task('b', { dependsOn: ['shared'] }),
      task('shared', { assertions: [{ description: 'Shared check' }] }),
    ]);
    generate.mockResolvedValue(done).mockResolvedValueOnce(done).mockResolvedValueOnce(passed);
    await executor.record(page);
    expect(
      generate.mock.calls.map((_, i) => payload(i).goal ?? payload(i).assertion.description),
    ).toEqual(['goal shared', 'Shared check', 'goal a', 'goal b']);
    generate.mockClear();
    generate.mockResolvedValue(done).mockResolvedValueOnce(done).mockResolvedValueOnce(passed);
    await executor.record(page);
    expect(generate).toHaveBeenCalledTimes(4);
  });

  it('preserves input values in the task goal and completed browser steps with empty legacy context', async () => {
    const goal = 'Log in using password secret';
    const { executor, page, execute } = fixture([task('login', { goal })]);
    const step = {
      type: 'fill',
      target: { kind: 'ariaRef', value: 'e1', name: '' },
      value: 'secret',
    };
    generate
      .mockResolvedValueOnce(action('fill', { ref: 'e1', value: 'secret' }))
      .mockResolvedValueOnce(done);
    await executor.record(page);
    expect(page.goto).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledExactlyOnceWith(page, step);
    for (const index of [0, 1])
      expect(payload(index)).toMatchObject({ goal, inputs: {}, preconditions: [] });
    expect(payload(0).completedSteps).toEqual([]);
    expect(payload(1).completedSteps).toEqual([step]);
    expect(generate.mock.calls[0][0].systemPrompt).toContain('Never invent setup actions');
  });

  it('executes an ariaRef click when the planner omits target.name', async () => {
    const { executor, page, execute } = fixture([task('enter_repo')]);
    const step = {
      type: 'click',
      target: { kind: 'ariaRef', value: 'f1e297' },
      value: '',
    };
    generate.mockResolvedValueOnce(action('click', { ref: 'f1e297' })).mockResolvedValueOnce(done);

    await executor.record(page);

    const normalized = { ...step, target: { ...step.target, name: '' } };
    expect(execute).toHaveBeenCalledExactlyOnceWith(page, normalized);
    expect(payload(1).completedSteps).toEqual([normalized]);
  });

  it.each([true, false])(
    'selects exactly one branch using read-only observation: %s',
    async (matches) => {
      const decision = branch('no');
      decision.dependsOn = ['setup'];
      const { executor, page, observation, execute } = fixture([
        group('root', ['branch', 'after']),
        decision,
        task('setup'),
        task('yes'),
        task('no'),
        task('after'),
      ]);
      generate
        .mockResolvedValueOnce(done)
        .mockResolvedValueOnce({
          structuredContent: { passed: matches, evidence: 'Observed condition' },
        })
        .mockResolvedValueOnce(done)
        .mockResolvedValueOnce(done);
      await executor.record(page);
      expect(payload(0).goal).toBe('goal setup');
      expect(payload(1)).toEqual({ condition: 'Account exists', observation });
      expect(generate.mock.calls[1][0].systemPrompt).toContain('read-only');
      expect(generate.mock.calls[1][0]).not.toHaveProperty('tools');
      expect(generate.mock.calls[1][0].responseFormat.type).toBe('json_schema');
      expect(payload(2).goal).toBe(matches ? 'goal yes' : 'goal no');
      expect(payload(3).goal).toBe('goal after');
      expect(generate).toHaveBeenCalledTimes(4);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('skips a false branch without otherwise', async () => {
    const { executor, page } = fixture([branch(), task('yes')]);
    generate.mockResolvedValueOnce({
      structuredContent: { passed: false, evidence: 'Not visible' },
    });
    await executor.record(page);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('stops on an invalid branch decision without executing either alternative', async () => {
    const { executor, page, execute } = fixture([branch('no'), task('yes'), task('no')]);
    generate.mockResolvedValueOnce({ structuredContent: { passed: true, evidence: '' } });
    await expect(executor.record(page)).rejects.toThrow('Branch branch failed: Account exists');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    { passed: false, evidence: 'Not visible' },
    { passed: true, evidence: '' },
    { done: false, step: { type: 'navigate', value: 'https://example.com' } },
  ])('fails closed on failed or invalid task assertions: %j', async (result) => {
    const { executor, page, execute } = fixture([
      group('root', ['check', 'later']),
      task('check', {
        assertions: [{ description: 'Final state' }, { description: 'Later assertion' }],
      }),
      task('later'),
    ]);
    generate.mockResolvedValueOnce(done).mockResolvedValueOnce({ structuredContent: result });
    await expect(executor.record(page)).rejects.toThrow(
      'Assertion check-assertion-1 failed: Final state',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].systemPrompt).toContain(
      'Missing, ambiguous, or insufficient evidence',
    );
    expect(payload(1)).not.toHaveProperty('inputs');
    expect(generate.mock.calls[1][0]).not.toHaveProperty('tools');
    expect(generate.mock.calls[1][0].responseFormat.type).toBe('json_schema');
  });

  it('includes the task id and goal when planning fails', async () => {
    const { executor, page } = fixture([task('broken')]);
    generate.mockResolvedValueOnce({ content: { text: 'Cannot act' }, toolCalls: [] });
    await expect(executor.record(page)).rejects.toThrow('Step broken (goal broken) failed');
  });

  it('includes the assertion id and description when observation fails', async () => {
    const { executor, page, observe, observation } = fixture([
      task('check', { assertions: [{ description: 'Visible result' }] }),
    ]);
    generate.mockResolvedValueOnce(done);
    observe
      .mockResolvedValueOnce(observation)
      .mockRejectedValueOnce(new Error('Observation unavailable'));
    await expect(executor.record(page)).rejects.toThrow(
      'Assertion check-assertion-1 failed: Visible result',
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('reports missing nodes', async () => {
    const { executor, page } = fixture([group('root', ['missing'])]);
    await expect(executor.record(page)).rejects.toThrow('Unknown plan node: missing');
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    [group('root', ['root'])],
    [task('a', { dependsOn: ['b'] }), task('b', { dependsOn: ['a'] })],
  ])('reports cycles without executing actions', async (...nodes) => {
    const { executor, page } = fixture(nodes);
    await expect(executor.record(page)).rejects.toThrow('Cycle detected');
    expect(generate).not.toHaveBeenCalled();
  });
});
