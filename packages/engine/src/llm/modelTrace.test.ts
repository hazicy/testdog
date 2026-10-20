import { expect, it } from 'vitest';
import { modelTrace } from './modelTrace';
import type { LLMGenerateResult } from '@testdog/engine/llm/contracts';

const result: LLMGenerateResult = {
  role: 'assistant',
  content: { type: 'text', text: 'Done' },
  outputFormat: 'text',
  toolCalls: [],
};

it('keeps malformed arguments inspectable and hides credential fields in structured output', () => {
  const trace = modelTrace(
    { messages: [] },
    {
      ...result,
      content: { type: 'text', text: '{"password":"secret","result":"ok"}' },
      toolCalls: [
        {
          id: 'valid',
          name: 'request',
          arguments: '{"headers":{"Authorization":"Bearer secret"},"q":"vscode"}',
        },
        { id: 'invalid', name: 'click', arguments: '{invalid' },
      ],
    },
  );

  expect(trace.reply).toContain('[redacted]');
  expect(trace.reply).not.toContain('secret');
  expect(trace.tools[0].arguments).not.toContain('Bearer secret');
  expect(trace.tools[0].arguments).toContain('vscode');
  expect(trace.tools[1].arguments).toBe('{invalid');
});

it('bounds trace payloads and records when output was truncated', () => {
  const trace = modelTrace(
    { messages: [] },
    {
      ...result,
      content: { type: 'text', text: 'x'.repeat(100000) },
      toolCalls: Array.from({ length: 40 }, (_, index) => ({
        id: String(index),
        name: 'fill',
        arguments: 'y'.repeat(20000),
      })),
    },
  );

  expect(trace.reply).toHaveLength(65536);
  expect(trace.tools).toHaveLength(32);
  expect(trace.tools[0].arguments).toHaveLength(16384);
  expect(trace.truncated).toBe(true);
});

it('keeps input roles and order, including tool context, without image payloads', () => {
  const trace = modelTrace({
    systemPrompt: 'Follow the test plan',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Open account <script>' },
          { type: 'image', data: 'PRIVATE_BASE64', mimeType: 'image/png' },
        ],
      },
      {
        role: 'assistant',
        content: {
          type: 'tool_use',
          id: 'click-1',
          name: 'click',
          input: { ref: 'e1', password: 'PRIVATE_PASSWORD' },
        },
      },
      {
        role: 'user',
        content: {
          type: 'tool_result',
          toolUseId: 'click-1',
          content: [
            { type: 'text', text: '{"authorization":"PRIVATE_TOKEN","result":"opened"}' },
            { type: 'image', data: 'PRIVATE_BASE64', mimeType: 'image/jpeg' },
          ],
          structuredContent: { cookie: 'PRIVATE_COOKIE', success: true },
        },
      },
    ],
  });

  expect(trace.input?.map((message) => message.role)).toEqual([
    'system',
    'user',
    'assistant',
    'user',
  ]);
  expect(trace.input?.[0].content).toBe('Follow the test plan');
  expect(trace.input?.[1].content).toBe('Open account <script>\n\n[图片：image/png]');
  expect(trace.input?.[2].content).toContain('click-1');
  expect(trace.input?.[3].content).toContain('opened');
  expect(trace.input?.[3].content).toContain('image/jpeg');
  expect(JSON.stringify(trace)).not.toContain('PRIVATE_');
  expect(trace.reply).toBe('');
  expect(trace.tools).toEqual([]);
});

it('bounds the combined input size and message count without changing request data', () => {
  const params = {
    systemPrompt: 's'.repeat(65530),
    messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'u'.repeat(20) } }],
  };
  const trace = modelTrace(params, result);

  expect(trace.input?.map((message) => message.content.length)).toEqual([65530, 6]);
  expect(trace.truncated).toBe(true);
  expect(params.messages[0].content.text).toHaveLength(20);
  const many = modelTrace({
    messages: Array.from({ length: 200 }, () => ({
      role: 'user',
      content: { type: 'text', text: '' },
    })),
  });

  expect(many.input).toHaveLength(128);
  expect(many.truncated).toBe(true);
});
