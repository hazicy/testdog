import { expect, it, vi } from 'vitest';
import { budgetedModel, type ModelBudget } from '@testdog/engine/llm/budget';
import type { LLMGenerateResult } from '@testdog/engine/llm/contracts';

const budget: ModelBudget = {
  timeoutMs: 1000,
  maxCalls: 3,
  maxTokens: 20,
  maxDurationMs: 5000,
  maxRetries: 1,
  maxOutputTokens: 8,
};
const params = { messages: [] };
const result: LLMGenerateResult = {
  role: 'assistant',
  content: { type: 'text', text: 'ok' },
  toolCalls: [],
  outputFormat: 'text',
  usage: { inputTokens: 12, outputTokens: 8 },
};

it('records token usage and refuses another call once the shared budget is exhausted', async () => {
  const generate = vi.fn().mockResolvedValue(result);
  const record = vi.fn().mockResolvedValue(undefined);
  const model = budgetedModel({ generate }, budget, record);

  await model.generate(params);
  await expect(model.generate(params)).rejects.toThrow('预算');
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].maxOutputTokens).toBe(8);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({ inputTokens: 12, outputTokens: 8, status: 'passed', retryCount: 0 }),
  );
});
it('records retry failures, limits attempts, and does not persist raw provider errors', async () => {
  const generate = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error('SECRET'), { status: 429 }))
    .mockResolvedValue(result);
  const record = vi.fn().mockResolvedValue(undefined);

  await budgetedModel({ generate }, budget, record).generate(params);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({ retryCount: 1, failedAttempts: 1, status: 'passed' }),
  );
  expect(JSON.stringify(record.mock.calls)).not.toContain('SECRET');
  const reject = vi.fn().mockRejectedValue(Object.assign(new Error('no retry'), { status: 400 }));

  await expect(
    budgetedModel({ generate: reject }, budget, record).generate(params),
  ).rejects.toThrow('no retry');
  expect(reject).toHaveBeenCalledTimes(1);
});
it('enforces timeout even for adapters ignoring cancellation', async () => {
  const record = vi.fn().mockResolvedValue(undefined);
  const model = budgetedModel(
    { generate: () => new Promise(() => {}) },
    { ...budget, timeoutMs: 10 },
    record,
  );

  await expect(
    model.generate({ messages: [{ role: 'user', content: { type: 'text', text: 'Click next' } }] }),
  ).rejects.toThrow('超时');
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'timeout',
      failedAttempts: 1,
      trace: expect.objectContaining({
        input: [{ role: 'user', content: 'Click next' }],
        reply: '',
        tools: [],
      }),
    }),
  );
});
it('shares attempt budget across concurrent calls and aborts before calling the provider', async () => {
  const generate = vi.fn().mockResolvedValue({ ...result, usage: undefined });
  const record = vi.fn().mockResolvedValue(undefined);
  const model = budgetedModel({ generate }, { ...budget, maxCalls: 1 }, record);
  const results = await Promise.allSettled([model.generate(params), model.generate(params)]);

  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(generate).toHaveBeenCalledTimes(1);
  const controller = new AbortController();

  controller.abort(new Error('stop'));
  await expect(model.generate({ ...params, signal: controller.signal })).rejects.toThrow('stop');
  expect(generate).toHaveBeenCalledTimes(1);
});

it('persists the reply and tool calls under the same ID returned to the planner', async () => {
  const record = vi.fn().mockResolvedValue(undefined);
  const model = budgetedModel(
    {
      generate: async () => ({
        ...result,
        content: { type: 'text', text: 'Open the account page' },
        toolCalls: [{ id: 'tool-1', name: 'click', arguments: '{"ref":"e1"}' }],
      }),
    },
    budget,
    record,
  );
  const response = await model.generate({
    messages: [{ role: 'user', content: { type: 'text', text: 'PRIVATE INPUT' } }],
  });

  expect(response.callId).toMatch(/^[\da-f-]{36}$/);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      id: response.callId,
      trace: expect.objectContaining({ reply: 'Open the account page', tools: response.toolCalls }),
    }),
  );
  expect(record.mock.calls[0][0].trace.input).toEqual([{ role: 'user', content: 'PRIVATE INPUT' }]);
});

it.each([0, 1, 3])('records %i retries when the provider keeps failing', async (maxRetries) => {
  const failure = Object.assign(new Error('rate limited'), { status: 429 });
  const generate = vi.fn().mockRejectedValue(failure);
  const record = vi.fn().mockResolvedValue(undefined);
  const model = budgetedModel(
    { generate },
    { ...budget, maxCalls: 4, timeoutMs: 5000, maxRetries },
    record,
  );

  await expect(model.generate(params)).rejects.toThrow('rate limited');
  expect(generate).toHaveBeenCalledTimes(maxRetries + 1);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'failed',
      retryCount: maxRetries,
      failedAttempts: maxRetries + 1,
    }),
  );
});

it('does not count a retry cancelled during backoff', async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    const generate = vi.fn().mockRejectedValue(Object.assign(new Error('busy'), { status: 429 }));
    const record = vi.fn().mockResolvedValue(undefined);
    const model = budgetedModel({ generate }, budget, record);
    const rejected = expect(
      model.generate({ ...params, signal: controller.signal }),
    ).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', retryCount: 0, failedAttempts: 1 }),
    );
  } finally {
    vi.useRealTimers();
  }
});

it('continues queued calls after metric recording fails', async () => {
  const generate = vi.fn().mockResolvedValue({ ...result, usage: undefined });
  const record = vi
    .fn()
    .mockRejectedValueOnce(new Error('storage unavailable'))
    .mockResolvedValue(undefined);
  const model = budgetedModel({ generate }, budget, record);
  const results = await Promise.allSettled([model.generate(params), model.generate(params)]);

  expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(record).toHaveBeenCalledTimes(2);
});
