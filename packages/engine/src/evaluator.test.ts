import { expect, it, vi } from 'vitest';
import type { ModelClient } from '@testdog/contracts/automation/llm/contracts';
import { SemanticEvaluator } from '@testdog/engine/evaluator';
import type { Observation } from '@testdog/contracts/automation/platform/contracts';

const observation: Observation = {
  schemaVersion: 1,
  sessionId: 'session',
  revision: 1,
  capturedAt: '2026-10-10T00:00:00.000Z',
  surface: { id: 'app', platform: 'ios' },
};

it('evaluates current evidence through the injected model and forwards cancellation', async () => {
  const generate = vi.fn<ModelClient['generate']>().mockResolvedValue({
    role: 'assistant',
    content: { type: 'text', text: '' },
    outputFormat: 'json_schema',
    toolCalls: [],
    structuredContent: { passed: false, evidence: 'No welcome label' },
  });
  const signal = new AbortController().signal;
  const evaluator = new SemanticEvaluator({ generate });

  await expect(
    evaluator.evaluate({
      subject: { condition: 'Logged in' },
      observation,
      name: 'branch_result',
      signal,
    }),
  ).resolves.toEqual({ passed: false, evidence: 'No welcome label' });
  const request = generate.mock.calls[0][0];

  expect(request.signal).toBe(signal);
  expect(request.tools).toBeUndefined();
  expect(request.responseFormat).toMatchObject({ type: 'json_schema', name: 'branch_result' });
  expect(JSON.parse((request.messages[0].content as { text: string }).text)).toEqual({
    condition: 'Logged in',
    observation,
  });
});

it('rejects model decisions with no supporting evidence', async () => {
  const generate = vi.fn<ModelClient['generate']>().mockResolvedValue({
    role: 'assistant',
    content: { type: 'text', text: '' },
    outputFormat: 'json_schema',
    toolCalls: [],
    structuredContent: { passed: true, evidence: '' },
  });

  await expect(
    new SemanticEvaluator({ generate }).evaluate({
      subject: { condition: 'Logged in' },
      observation,
      name: 'branch_result',
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow();
});

it('evaluates the complete raw observation even when a region was requested', async () => {
  const generate = vi.fn<ModelClient['generate']>().mockResolvedValue({
    role: 'assistant',
    content: { type: 'text', text: '' },
    outputFormat: 'json_schema',
    toolCalls: [],
    structuredContent: { passed: true, evidence: 'Last table row exists' },
  });
  const raw = {
    ...observation,
    tree: [{ role: 'cell', name: 'Last table row' }],
    requestedRegion: 'e5',
  };

  await new SemanticEvaluator({ generate }).evaluate({
    subject: { assertion: 'Last table row exists' },
    observation: raw,
    name: 'assertion_result',
    signal: new AbortController().signal,
  });
  const block = generate.mock.calls[0][0].messages[0].content as { text: string };
  const payload = JSON.parse(block.text);

  expect(payload.observation.tree).toEqual(raw.tree);
  expect(payload.observation).toEqual(raw);
});
