import { expect, it, vi } from 'vitest';
import type { ModelClient } from '@testdog/contracts/automation/llm/contracts';
import type { ActionPlanner } from '@testdog/contracts/automation/platform/contracts';
import { NativeActionPlanner } from '@testdog/engine/platform/native/nativePlanner';

const input: Parameters<ActionPlanner['plan']>[0] = {
  goal: 'Submit the form',
  observation: {
    schemaVersion: 1,
    sessionId: 'native-session',
    revision: 2,
    capturedAt: '2026-10-10T00:00:00.000Z',
    surface: { id: 'app', platform: 'ios' },
    nodes: [{ ref: 'e1', role: 'button', label: 'Submit' }],
  },
  capabilities: { actions: ['tap'], artifacts: [], assertions: [] },
  completedSteps: [],
  remainingWaitMs: 15000,
};

it.each(['ios', 'android'] as const)(
  'uses the injected model to plan supported %s actions and forwards cancellation',
  async (platform) => {
    const generate = vi.fn<ModelClient['generate']>().mockResolvedValue({
      role: 'assistant',
      content: { type: 'text', text: '' },
      outputFormat: 'json_schema',
      toolCalls: [],
      structuredContent: {
        done: false,
        steps: [{ type: 'tap', target: { kind: 'ref', value: 'e1', revision: 2 } }],
      },
    });
    const signal = new AbortController().signal;
    const planner: ActionPlanner = new NativeActionPlanner({ generate }, platform, signal);
    const requestInput = {
      ...input,
      observation: { ...input.observation, surface: { id: 'app', platform } },
    };

    await expect(planner.plan(requestInput)).resolves.toMatchObject({
      done: false,
      steps: [{ platform, action: { type: 'tap', target: { value: 'e1', revision: 2 } } }],
    });
    const request = generate.mock.calls[0][0];

    expect(request.signal).toBe(signal);
    expect(request.responseFormat).toMatchObject({ type: 'json_schema', name: 'native_action' });
    expect(JSON.parse((request.messages[0].content as { text: string }).text)).toEqual(
      requestInput,
    );
  },
);

it('rejects a model action outside the device capability set before dispatch', async () => {
  const generate = vi.fn<ModelClient['generate']>().mockResolvedValue({
    role: 'assistant',
    content: { type: 'text', text: '' },
    outputFormat: 'json_schema',
    toolCalls: [],
    structuredContent: { done: false, steps: [{ type: 'back' }] },
  });
  const planner = new NativeActionPlanner({ generate }, 'ios', new AbortController().signal);

  await expect(planner.plan(input)).rejects.toThrow();
});
