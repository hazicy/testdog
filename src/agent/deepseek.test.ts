import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWithOpenAI } from './deepseek';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    responses = { create };
  },
}));
beforeEach(() => vi.resetAllMocks());
const messages = [{ role: 'user' as const, content: { type: 'text' as const, text: 'goal' } }];

describe('generateWithOpenAI', () => {
  it('returns function calls without parsing empty output text', async () => {
    create.mockResolvedValue({
      output_text: '',
      output: [{ type: 'function_call', call_id: 'c1', name: 'click', arguments: '{"ref":"e1"}' }],
    });
    const tools = [
      { type: 'function' as const, name: 'click', parameters: { type: 'object' }, strict: true },
    ];
    const result = await generateWithOpenAI({ messages, tools });
    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'click', arguments: '{"ref":"e1"}' }]);
    expect(result.structuredContent).toBeUndefined();
    expect(create.mock.calls[0][0]).toMatchObject({ tools, parallel_tool_calls: false });
    expect(create.mock.calls[0][0]).not.toHaveProperty('text');
  });
  it('keeps schema generations read-only and parses structured output', async () => {
    create.mockResolvedValue({ output_text: '{"passed":true,"evidence":"visible"}', output: [] });
    const result = await generateWithOpenAI({
      messages,
      responseFormat: { type: 'json_schema', name: 'assertion', schema: { type: 'object' } },
    });
    expect(result.structuredContent).toEqual({ passed: true, evidence: 'visible' });
    expect(create.mock.calls[0][0]).not.toHaveProperty('tools');
    expect(create.mock.calls[0][0]).not.toHaveProperty('tool_choice');
  });
  it('supports plain text completion without JSON parsing', async () => {
    create.mockResolvedValue({ output_text: 'DONE', output: [] });
    expect((await generateWithOpenAI({ messages })).content.text).toBe('DONE');
  });
  it('rejects invalid schema and malformed structured JSON', async () => {
    await expect(
      generateWithOpenAI({
        messages,
        responseFormat: { type: 'json_schema', name: 'bad', schema: [] },
      }),
    ).rejects.toThrow('object schema');
    expect(create).not.toHaveBeenCalled();
    create.mockResolvedValue({ output_text: 'not JSON', output: [] });
    await expect(
      generateWithOpenAI({
        messages,
        responseFormat: { type: 'json_schema', name: 'bad', schema: {} },
      }),
    ).rejects.toThrow();
  });
});
