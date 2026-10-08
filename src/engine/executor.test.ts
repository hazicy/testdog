import type { Page } from 'playwright';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestCase } from './compiler/type';
import { Observer } from './observer';
import { Executor } from './executor';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../ai/provider/stepfun', () => ({ generateWithOpenAI: generate }));
vi.mock('../ai/provider/jev', () => ({ jev: { decideClick: vi.fn() } }));

const action = (id: string) => ({
  id,
  type: 'action' as const,
  goal: `goal ${id}`,
  inputs: { password: 'secret' },
});
const done = { structuredContent: { done: true, reason: 'complete', step: null } };
const passed = { structuredContent: { passed: true, evidence: 'Visible success message' } };

function fixture(overrides: Partial<TestCase> = {}) {
  const testCase: TestCase = {
    name: 'test',
    preconditions: ['Already logged in'],
    steps: [],
    assertions: [],
    ...overrides,
  };
  const observation = { tree: {}, page: { url: 'https://example.com', focused: null } };
  const observer = new Observer();
  const observe = vi.spyOn(observer, 'observe').mockResolvedValue(observation);
  const page = { goto: vi.fn().mockResolvedValue(undefined) } as unknown as Page;
  const executor = new Executor(observer, testCase);
  const execute = vi.spyOn(executor, 'execute').mockResolvedValue(page);
  return { executor, observe, observation, page, execute };
}

function payload(index: number) {
  return JSON.parse(generate.mock.calls[index][0].messages[0].content.text);
}

beforeEach(() => vi.clearAllMocks());

describe('Executor TestCase recording', () => {
  it('navigates first, recursively runs groups in order and checks final assertions last', async () => {
    const { executor, page, observe, execute } = fixture({
      startUrl: 'https://example.com/start',
      steps: [
        action('a'),
        {
          id: 'g',
          type: 'group',
          name: 'group',
          steps: [
            { id: 'nested', type: 'group', name: 'nested', steps: [action('b')] },
            { id: 'check', type: 'assert', assertion: { description: 'Success visible' } },
          ],
        },
        action('c'),
      ],
      assertions: [{ description: 'Final success' }, { description: 'Still logged in' }],
    });
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

  it('passes inputs and context to every action plan and preserves completed browser steps', async () => {
    const { executor, page, execute } = fixture({ steps: [action('login')] });
    const step = {
      type: 'fill',
      target: { kind: 'ariaRef', value: 'e1', name: '' },
      value: 'secret',
    };
    generate
      .mockResolvedValueOnce({ structuredContent: { done: false, reason: 'Fill', step } })
      .mockResolvedValueOnce(done);
    await executor.record(page);
    expect(page.goto).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledExactlyOnceWith(page, step);
    for (const index of [0, 1]) {
      expect(payload(index)).toMatchObject({
        inputs: { password: 'secret' },
        preconditions: ['Already logged in'],
      });
    }
    expect(payload(0).completedSteps).toEqual([]);
    expect(payload(1).completedSteps).toEqual([step]);
    expect(generate.mock.calls[0][0].systemPrompt).toContain('Never invent setup actions');
  });

  it('fails an inline assertion without executing later actions or final assertions', async () => {
    const { executor, page, execute } = fixture({
      steps: [
        { id: 'check-1', type: 'assert', assertion: { description: 'Account exists' } },
        action('later'),
      ],
      assertions: [{ description: 'Final' }],
    });
    generate.mockResolvedValueOnce({
      structuredContent: { passed: false, evidence: 'Insufficient evidence' },
    });
    await expect(executor.record(page)).rejects.toThrow('Assertion check-1 failed: Account exists');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();
    expect(generate.mock.calls[0][0].systemPrompt).toContain(
      'Missing, ambiguous, or insufficient evidence',
    );
    expect(payload(0)).not.toHaveProperty('inputs');
  });

  it.each([
    { passed: false, evidence: 'Not visible' },
    { passed: true, evidence: '' },
    { done: false, step: { type: 'navigate', value: 'https://example.com' } },
  ])('fails closed on failed or invalid final assertion results: %j', async (result) => {
    const { executor, page, execute } = fixture({
      assertions: [{ description: 'Final state' }, { description: 'Later' }],
    });
    generate.mockResolvedValueOnce({ structuredContent: result });
    await expect(executor.record(page)).rejects.toThrow(
      'Assertion final-assertion-1 failed: Final state',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('includes the action id and goal when planning fails', async () => {
    const { executor, page } = fixture({ steps: [action('broken')] });
    generate.mockResolvedValueOnce({
      structuredContent: { done: false, reason: 'Cannot act', step: null },
    });
    await expect(executor.record(page)).rejects.toThrow('Step broken (goal broken) failed');
  });

  it('includes the assertion id and description when observation fails', async () => {
    const { executor, page, observe } = fixture({
      steps: [{ id: 'check', type: 'assert', assertion: { description: 'Visible result' } }],
    });
    observe.mockRejectedValueOnce(new Error('Observation unavailable'));
    await expect(executor.record(page)).rejects.toThrow('Assertion check failed: Visible result');
    expect(generate).not.toHaveBeenCalled();
  });
});
