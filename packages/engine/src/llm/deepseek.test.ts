import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deepseekClient } from '@testdog/engine/llm/deepseek';
import { SemanticEvaluator } from '@testdog/engine/evaluator';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('openai', () => ({
  default: class {
    responses = { create };
  },
}));
beforeEach(() => vi.resetAllMocks());
const messages = [{ role: 'user' as const, content: { type: 'text' as const, text: 'goal' } }];

describe('deepseekClient.generate', () => {
  it('returns function calls without parsing empty output text', async () => {
    create.mockResolvedValue({
      output_text: '',
      output: [{ type: 'function_call', call_id: 'c1', name: 'click', arguments: '{"ref":"e1"}' }],
    });
    const tools = [
      { type: 'function' as const, name: 'click', parameters: { type: 'object' }, strict: true },
    ];
    const result = await deepseekClient.generate({ messages, tools });

    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'click', arguments: '{"ref":"e1"}' }]);
    expect(result.structuredContent).toBeUndefined();
    expect(create.mock.calls[0][0]).toMatchObject({ tools, parallel_tool_calls: false });
    expect(create.mock.calls[0][0]).not.toHaveProperty('text');
  });
  it('keeps schema generations read-only and parses structured output', async () => {
    create.mockResolvedValue({ output_text: '{"passed":true,"evidence":"visible"}', output: [] });
    const result = await deepseekClient.generate({
      messages,
      responseFormat: { type: 'json_schema', name: 'assertion', schema: { type: 'object' } },
    });

    expect(result.structuredContent).toEqual({ passed: true, evidence: 'visible' });
    expect(create.mock.calls[0][0]).not.toHaveProperty('tools');
    expect(create.mock.calls[0][0]).not.toHaveProperty('tool_choice');
  });
  it.each([
    '```json\n{"passed":true,"evidence":"visible"}\n```',
    '```\n{"passed":true,"evidence":"visible"}\n```',
    ' \n```JSON\r\n{"passed":true,"evidence":"visible"}\r\n```\r\n ',
    '```json\n\n{"passed":true,"evidence":"visible"}\n\n  ```',
  ])('parses complete JSON code blocks while preserving the raw response: %j', async (text) => {
    create.mockResolvedValue({ output_text: text, output: [] });
    const result = await deepseekClient.generate({
      messages,
      responseFormat: { type: 'json_schema', name: 'assertion', schema: { type: 'object' } },
    });

    expect(result.structuredContent).toEqual({ passed: true, evidence: 'visible' });
    expect(result.content.text).toBe(text);
  });
  it('removes schema metadata without changing backticks inside JSON values', async () => {
    create.mockResolvedValue({
      output_text:
        '```json\n{"$schema":"metadata","passed":true,"evidence":"literal ```json"}\n```',
      output: [],
    });
    const result = await deepseekClient.generate({
      messages,
      responseFormat: { type: 'json_schema', name: 'assertion', schema: { type: 'object' } },
    });

    expect(result.structuredContent).toEqual({ passed: true, evidence: 'literal ```json' });
  });
  it('evaluates step evidence returned as fenced JSON', async () => {
    create.mockResolvedValue({
      output_text: '```json\n{"passed":true,"evidence":"Welcome label is visible"}\n```',
      output: [],
    });

    await expect(
      new SemanticEvaluator(deepseekClient).evaluate({
        subject: { assertion: 'Welcome label is visible' },
        observation: {
          schemaVersion: 1,
          sessionId: 'session',
          revision: 1,
          capturedAt: '2026-10-10T00:00:00.000Z',
          surface: { id: 'page-1', platform: 'web' },
        },
        name: 'assertion_result',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ passed: true, evidence: 'Welcome label is visible' });
  });
  it.each(['DONE', '```json\n{"passed":true}\n```'])(
    'supports plain text completion without JSON parsing: %j',
    async (text) => {
      create.mockResolvedValue({ output_text: text, output: [] });
      const result = await deepseekClient.generate({ messages });

      expect(result.content.text).toBe(text);
      expect(result.structuredContent).toBeUndefined();
    },
  );
  it.each([
    '```json\n{"passed":true,}\n```',
    '```json\n{"passed":true}',
    'Here is the result:\n```json\n{"passed":true}\n```',
    '```json\n{"passed":true}\n```\n```json\n{"passed":false}\n```',
  ])('rejects malformed or ambiguous structured responses: %j', async (text) => {
    create.mockResolvedValue({ output_text: text, output: [] });

    await expect(
      deepseekClient.generate({
        messages,
        responseFormat: { type: 'json_schema', name: 'assertion', schema: { type: 'object' } },
      }),
    ).rejects.toThrow(SyntaxError);
  });
  it('rejects invalid schema and malformed structured JSON', async () => {
    await expect(
      deepseekClient.generate({
        messages,
        responseFormat: { type: 'json_schema', name: 'bad', schema: [] },
      }),
    ).rejects.toThrow('object schema');
    expect(create).not.toHaveBeenCalled();
    create.mockResolvedValue({ output_text: 'not JSON', output: [] });
    await expect(
      deepseekClient.generate({
        messages,
        responseFormat: { type: 'json_schema', name: 'bad', schema: {} },
      }),
    ).rejects.toThrow();
  });
});
