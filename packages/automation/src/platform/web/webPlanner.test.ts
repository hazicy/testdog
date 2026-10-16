import { beforeEach, expect, it, vi } from 'vitest';
import type { ActionPlanner } from '@testdog/contracts/automation/platform/contracts';
import { WebActionPlanner } from '@testdog/automation/platform/web/webPlanner';
import { ReplanRequiredError } from '@testdog/automation/replanning';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));

const model = { generate };

const input: Parameters<ActionPlanner['plan']>[0] = {
  goal: 'Open the account page',
  observation: {
    schemaVersion: 1,
    sessionId: 'web-session',
    revision: 2,
    capturedAt: '2026-10-10T00:00:00.000Z',
    surface: { id: 'page-1', platform: 'web', url: 'https://example.com' },
    tree: [{ ref: 'e1', role: 'button', name: 'Account' }],
  },
  capabilities: { actions: ['click', 'wait'], artifacts: [], assertions: [] },
  completedSteps: [
    {
      platform: 'web',
      action: { type: 'click', target: { kind: 'ariaRef', value: 'e2', name: '' }, value: '' },
    },
  ],
  remainingWaitMs: 15000,
};

beforeEach(() => generate.mockReset());

it('returns platform actions through ActionPlanner and preserves browser history for the model', async () => {
  generate.mockResolvedValue({
    content: { text: '' },
    toolCalls: [{ name: 'click', arguments: JSON.stringify({ ref: 'e1' }) }],
  });
  const signal = new AbortController().signal;
  const planner: ActionPlanner = new WebActionPlanner(model, signal);

  await expect(planner.plan(input)).resolves.toMatchObject({
    done: false,
    steps: [{ platform: 'web', action: { type: 'click', target: { value: 'e1' } } }],
  });
  const request = generate.mock.calls[0][0];

  expect(request.signal).toBe(signal);
  expect(JSON.parse(request.messages[0].content.text)).toMatchObject({
    observation: input.observation,
    completedSteps: [input.completedSteps[0].action],
    remainingWaitMs: input.remainingWaitMs,
  });
});

it('returns completion without actions through the shared interface', async () => {
  generate.mockResolvedValue({ content: { text: 'DONE' }, toolCalls: [] });
  const planner: ActionPlanner = new WebActionPlanner(model);

  await expect(planner.plan(input)).resolves.toEqual({ done: true, steps: [] });
});

it('accepts explicit completion as a tool call without dispatching a browser action', async () => {
  generate.mockResolvedValue({
    content: { text: '' },
    toolCalls: [{ name: 'done', arguments: '{}' }],
  });

  await expect(new WebActionPlanner(model).plan(input)).resolves.toEqual({ done: true, steps: [] });
});

it('rejects completion combined with an action', async () => {
  generate.mockResolvedValue({
    content: { text: '' },
    toolCalls: [
      { name: 'done', arguments: '{}' },
      { name: 'click', arguments: '{"ref":"e1"}' },
    ],
  });

  await expect(new WebActionPlanner(model).plan(input)).rejects.toThrow(
    'Completion must not be combined with browser actions',
  );
});

it('describes the clicked link on its source page even when its ref is reused by a submit button', async () => {
  generate.mockResolvedValue({ content: { text: 'DONE' }, toolCalls: [] });
  const planner = new WebActionPlanner(model);
  const source = {
    ...input.observation,
    surface: { ...input.observation.surface, url: 'http://localhost:3001/login' },
    tree: [{ ref: 'e2', role: 'link', name: '注册', url: '/register' }],
  };
  const destination = {
    ...input.observation,
    surface: { ...input.observation.surface, url: 'http://localhost:3001/register' },
    tree: [{ ref: 'e2', role: 'button', name: '注册' }],
  };

  await planner.plan({
    ...input,
    goal: '点击表单下方的“注册”链接',
    observation: destination,
    completedObservations: [source],
  });
  const payload = JSON.parse(generate.mock.calls[0][0].messages[0].content.text);

  expect(payload.completedSteps).toEqual([
    {
      ...input.completedSteps[0].action,
      target: { kind: 'ariaRef', value: 'e2', name: '注册', role: 'link', url: '/register' },
      sourceSurface: source.surface,
    },
  ]);
  expect(payload.observation).toEqual(destination);
  expect(payload).not.toHaveProperty('completedObservations');
});

it('rejects a batched wait so subsequent actions require a fresh observation', async () => {
  generate.mockResolvedValue({
    content: { text: '' },
    toolCalls: [
      {
        name: 'wait',
        arguments: JSON.stringify({ condition: 'text', value: 'Account', timeoutMs: 1000 }),
      },
      { name: 'click', arguments: JSON.stringify({ ref: 'e1' }) },
    ],
  });
  const planner: ActionPlanner = new WebActionPlanner(model);

  await expect(planner.plan(input)).rejects.toThrow('Wait must be followed by a fresh observation');
});

it('sends the selected detail and global overview without duplicating the raw tree', async () => {
  generate.mockResolvedValue({
    content: { text: '' },
    toolCalls: [{ name: 'click', arguments: '{"ref":"e3"}' }],
  });
  const scoped = {
    ...input.observation,
    tree: [
      { role: 'button', ref: 'e2', name: 'Background' },
      { role: 'button', ref: 'e3', name: 'Import' },
    ],
    requestedRegion: 'e3',
  };

  await new WebActionPlanner(model).plan({
    ...input,
    observation: scoped,
    completedObservations: [input.observation],
  });
  const payload = JSON.parse(generate.mock.calls[0][0].messages[0].content.text);

  expect(payload.observation.tree).toEqual([scoped.tree[1]]);
  expect(payload.observation.overview).toEqual(scoped.tree);
  expect(payload.observation).not.toHaveProperty('requestedRegion');
  expect(scoped.tree).toHaveLength(2);
});

it.each(['e2', 'e99'])(
  'rejects omitted or invented ref %s even in an otherwise valid batch',
  async (ref) => {
    generate.mockResolvedValue({
      content: { text: '' },
      toolCalls: [
        { name: 'click', arguments: '{"ref":"e1"}' },
        { name: 'click', arguments: JSON.stringify({ ref }) },
      ],
    });

    await expect(
      new WebActionPlanner(model).plan({
        ...input,
        observation: {
          ...input.observation,
          tree: [
            { ref: 'e1', role: 'button' },
            {
              ref: 'e3',
              role: 'rowgroup',
              children: [
                { role: 'row', ref: 'e10' },
                { role: 'row', ref: 'e11' },
                { role: 'row', ref: 'e2' },
              ],
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(ReplanRequiredError);
  },
);

it.each(['e1', ''])(
  'returns the model-selected observation request %s without browser actions',
  async (ref) => {
    generate.mockResolvedValue({
      content: { text: '' },
      toolCalls: [{ name: 'observe', arguments: JSON.stringify({ ref }) }],
    });

    await expect(new WebActionPlanner(model).plan(input)).resolves.toMatchObject({
      done: false,
      steps: [],
      observe: { ref },
    });
  },
);

it('allows selecting new regions from the global overview while inspecting another region', async () => {
  generate.mockResolvedValue({
    content: { text: '' },
    toolCalls: [{ name: 'observe', arguments: '{"ref":"e2"}' }],
  });

  await expect(
    new WebActionPlanner(model).plan({
      ...input,
      observation: {
        ...input.observation,
        tree: [
          { role: 'textbox', ref: 'e1' },
          { role: 'generic', ref: 'e2', name: 'Choices' },
        ],
        requestedRegion: 'e1',
      },
    }),
  ).resolves.toMatchObject({ observe: { ref: 'e2' }, steps: [] });
});

it('rejects an invented observation ref before requesting a region', async () => {
  generate.mockResolvedValue({
    callId: 'model-inspect',
    content: { text: '' },
    toolCalls: [{ name: 'observe', arguments: '{"ref":"e99"}' }],
  });

  await expect(new WebActionPlanner(model).plan(input)).rejects.toMatchObject({
    modelCallId: 'model-inspect',
  });
});

it('rejects an observation batched with browser input', async () => {
  generate.mockResolvedValue({
    content: { text: '' },
    toolCalls: [
      { name: 'observe', arguments: '{"ref":"e1"}' },
      { name: 'click', arguments: '{"ref":"e1"}' },
    ],
  });

  await expect(new WebActionPlanner(model).plan(input)).rejects.toThrow(
    'Region observation must not be combined',
  );
});

it('plans a relative locator directly inside an observed region without an extra observation', async () => {
  generate.mockResolvedValue({
    content: { text: '' },
    toolCalls: [
      {
        name: 'act_in',
        arguments: JSON.stringify({
          type: 'fill',
          scopeRef: 'e1',
          locator: { kind: 'label', value: 'Dimension', name: '' },
          value: 'test',
        }),
      },
    ],
  });

  await expect(new WebActionPlanner(model).plan(input)).resolves.toMatchObject({
    done: false,
    steps: [
      {
        platform: 'web',
        action: {
          type: 'fill',
          value: 'test',
          target: {
            kind: 'label',
            value: 'Dimension',
            scope: { kind: 'ariaRef', value: 'e1' },
          },
        },
      },
    ],
  });
});

it.each([
  { scopeRef: 'e99', locator: { kind: 'label', value: 'Dimension', name: '' } },
  { scopeRef: 'e1', locator: { kind: 'css', value: 'input', name: '' } },
  { scopeRef: 'e1', locator: { kind: 'role', value: 'textbox', name: '', index: 0 } },
])(
  'rejects unknown regions and unrestricted or positional relative locators: %j',
  async (target) => {
    generate.mockResolvedValue({
      content: { text: '' },
      toolCalls: [
        { name: 'act_in', arguments: JSON.stringify({ type: 'fill', value: 'test', ...target }) },
      ],
    });

    await expect(new WebActionPlanner(model).plan(input)).rejects.toThrow();
  },
);
