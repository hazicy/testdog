import { describe, expect, it, vi } from 'vitest';
import type { ModelClient } from '@testdog/contracts/automation/llm/contracts';
import type { ActionPlanner, PlatformAction } from '@testdog/contracts/automation/platform/contracts';
import {
  JevActionPlanner,
  canFinishWithoutLLM,
  createJevActionChooser,
  explicitFillValue,
  jevActionOptions,
} from './jevActionPlanner';

type Input = Parameters<ActionPlanner['plan']>[0];
const signal = new AbortController().signal;
const emptyModel = { generate: vi.fn() } as unknown as ModelClient;
const observation = (name = 'Issues', role = 'link') => ({
  schemaVersion: 1 as const,
  sessionId: 'session-1',
  revision: 0,
  capturedAt: new Date().toISOString(),
  surface: { id: 'page-1', platform: 'web' as const, url: 'https://example.test' },
  tree: [{ role, name, ref: 'e1', ...(role === 'textbox' ? { editable: true } : {}) }],
  page: { focused: null as null | { value: string } },
});
const input = (goal = '点击 Issues'): Input => ({
  goal,
  observation: observation(),
  capabilities: { actions: ['click', 'fill', 'press', 'wait'], artifacts: [], assertions: [] },
  completedSteps: [],
  completedObservations: [],
  remainingWaitMs: 5000,
});
const completed = (state: Input, action: PlatformAction) => {
  state.completedSteps.push(action);
  state.completedObservations!.push(state.observation);
  state.observation = { ...state.observation, revision: state.observation.revision + 1 };
};
const fallback = () => ({
  plan: vi.fn().mockResolvedValue({ done: true, steps: [] }),
});

describe('Jev-first action planner', () => {
  it('constructs typed DOM actions without fabricating values', () => {
    const state = input('点击 Issues');
    const actions = [...jevActionOptions(state).values()];

    expect(actions.some((option) => option.kind === 'action' && option.action.action.type === 'click')).toBe(true);
    expect(actions.some((option) => option.kind === 'action' && option.action.action.type === 'fill')).toBe(false);
    expect(jevActionOptions(state).has('done')).toBe(false);
  });

  it('only extracts explicit, unambiguous literal values', () => {
    expect(explicitFillValue('在 Name 输入框输入 Ada')).toBe('Ada');
    expect(explicitFillValue('搜索 vscode')).toBe('vscode');
    expect(explicitFillValue('在用户名处输入 admin，然后在密码处输入 secret')).toBeUndefined();
    expect(explicitFillValue('点击搜索框')).toBeUndefined();
    expect(explicitFillValue('根据客户资料填写收货地址')).toBeUndefined();
  });

  it('uses Jev for a simple click and does not call the general LLM', async () => {
    const choose = vi.fn()
      .mockResolvedValueOnce({ choice: 'a1', modelCallId: 'jev-1' })
      .mockResolvedValueOnce({ choice: 'done', modelCallId: 'jev-2' });
    const back = fallback();
    const planner = new JevActionPlanner(emptyModel, signal, choose, back as unknown as ActionPlanner);
    const state = input();

    const first = await planner.plan(state);
    expect(first).toMatchObject({
      done: false,
      modelCallId: 'jev-1',
      steps: [{ platform: 'web', action: { type: 'click', target: { value: 'e1' } } }],
    });
    completed(state, first.steps[0]);
    expect(canFinishWithoutLLM(state)).toBe(true);
    expect(await planner.plan(state)).toMatchObject({ done: true, steps: [] });
    expect(back.plan).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledTimes(2);
  });

  it('allows a typed fill and verifies the observed value before accepting done', async () => {
    const state = input('在 Name 输入框输入 Ada');
    state.observation = observation('Name', 'textbox');
    const options = jevActionOptions(state);
    const fillId = [...options].find(([, option]) =>
      option.kind === 'action' && option.action.action.type === 'fill')![0];
    const choose = vi.fn().mockResolvedValueOnce({ choice: fillId }).mockResolvedValueOnce({ choice: 'done' });
    const back = fallback();
    const planner = new JevActionPlanner(emptyModel, signal, choose, back as unknown as ActionPlanner);
    const first = await planner.plan(state);

    expect(first.steps[0]).toMatchObject({ action: { type: 'fill', value: 'Ada' } });
    completed(state, first.steps[0]);
    state.observation = { ...state.observation, page: { focused: { value: 'Ada' } } };
    expect(await planner.plan(state)).toMatchObject({ done: true });
    expect(back.plan).not.toHaveBeenCalled();
  });

  it('delegates multi-step completion, uncertain actions and missing values', async () => {
    const back = fallback();
    const choose = vi.fn().mockResolvedValue({ choice: 'done' });
    const planner = new JevActionPlanner(emptyModel, signal, choose, back as unknown as ActionPlanner);
    const state = input('点击 Issues，然后点击 Bug');
    completed(state, {
      platform: 'web',
      action: { type: 'click', target: { kind: 'ariaRef', value: 'e1', name: '' }, value: '' },
    });
    expect(await planner.plan(state)).toMatchObject({ done: true });
    expect(back.plan).toHaveBeenCalledTimes(1);

    const state2 = input('根据客户资料填写收货地址');
    state2.previousFailure = { reason: 'Browser action uncertain' };
    expect(await planner.plan(state2)).toMatchObject({ done: true });
    expect(choose).toHaveBeenCalledTimes(1);
    expect(back.plan).toHaveBeenCalledTimes(2);
  });

  it('validates the Jev response and falls back on low confidence', async () => {
    const generate = vi.fn().mockResolvedValueOnce({
      structuredContent: {
        answers: { next: { type: 'choice', choice: 'a1', confidence: 0.3 } },
      },
      callId: 'jev-low',
    }).mockResolvedValueOnce({
      structuredContent: {
        answers: { next: { type: 'choice', choice: 'invented', confidence: 1 } },
      },
    });
    const choose = createJevActionChooser({ generate } as unknown as ModelClient);
    const state = {
      goal: '点击 Issues',
      url: 'https://example.test',
      completed: [],
      focused: null,
      choices: { a1: 'click Issues' },
    };

    expect(await choose(state, signal)).toEqual({ choice: 'need_llm', modelCallId: 'jev-low' });
    expect(generate.mock.calls[0][0].provider).toBe('jev');
    await expect(choose(state, signal)).rejects.toThrow('unknown action');
  });
});
