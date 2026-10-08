import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWithOpenAI } from '@/ai/provider/deepseek';
import { TextCompiler } from './textCompiler';

vi.mock('@/ai/provider/deepseek', () => ({ generateWithOpenAI: vi.fn() }));
const generate = vi.mocked(generateWithOpenAI);
const compiled = () => ({
  name: '导入标签',
  preconditions: ['账号有管理权限'],
  steps: [
    {
      type: 'group',
      name: '准备',
      steps: [
        { type: 'action', goal: '登录', inputs: [{ name: 'email', value: 'test@example.com' }] },
        { type: 'assert', assertion: { description: '已进入管理页面' } },
      ],
    },
  ],
  assertions: [{ description: '标签列表包含新标签' }],
});
function respond(content: unknown) {
  generate.mockResolvedValue({
    role: 'assistant',
    content: { type: 'text', text: JSON.stringify(content) },
    outputFormat: 'json_schema',
    structuredContent: content,
  } as Awaited<ReturnType<typeof generateWithOpenAI>>);
}

beforeEach(() => vi.clearAllMocks());
describe('TextCompiler case definition', () => {
  it('preserves nested steps, inputs, preconditions, assertions and startUrl', async () => {
    respond(compiled());
    const result = await new TextCompiler().compile(
      '登录后检查页面，再导入标签',
      'https://example.com',
    );
    expect(result.startUrl).toBe('https://example.com');
    expect(result.preconditions).toEqual(['账号有管理权限']);
    expect(result.steps[0]).toEqual({
      id: 'step-1',
      type: 'group',
      name: '准备',
      steps: [
        { id: 'step-2', type: 'action', goal: '登录', inputs: { email: 'test@example.com' } },
        { id: 'step-3', type: 'assert', assertion: { description: '已进入管理页面' } },
      ],
    });
    expect(result.assertions).toEqual(compiled().assertions);
  });

  it('sends recursive refs outside anyOf branches and strict object definitions', async () => {
    respond(compiled());
    await new TextCompiler().compile('导入标签');
    const format = generate.mock.calls[0][0].responseFormat;
    expect(format?.type).toBe('json_schema');
    if (format?.type !== 'json_schema') throw new Error('Expected schema');
    const schema = format.schema as Record<string, any>;
    expect(schema.properties.steps.items).toEqual({ $ref: '#/$def/step' });
    function check(value: any): void {
      if (!value || typeof value !== 'object') return;
      if (value.type === 'object') {
        expect(value.additionalProperties).toBe(false);
        expect([...value.required].sort()).toEqual(Object.keys(value.properties).sort());
      }
      if (value.anyOf) for (const branch of value.anyOf) expect(branch.type).toBe('object');
      for (const key of ['minLength', 'maxLength', 'minItems', 'oneOf'])
        expect(value).not.toHaveProperty(key);
      Object.values(value).forEach(check);
    }
    check(schema);
  });

  it('rejects duplicate input names', async () => {
    respond({
      ...compiled(),
      steps: [
        {
          type: 'action',
          goal: '填写',
          inputs: [
            { name: 'value', value: 'a' },
            { name: 'value', value: 'b' },
          ],
        },
      ],
    });
    await expect(new TextCompiler().compile('填写')).rejects.toThrow('Duplicate input names');
  });

  it('rejects empty groups and malformed assertions', async () => {
    respond({ ...compiled(), steps: [{ type: 'group', name: '空', steps: [] }] });
    await expect(new TextCompiler().compile('操作')).rejects.toThrow();
    respond({ ...compiled(), assertions: [{ description: '' }] });
    await expect(new TextCompiler().compile('操作')).rejects.toThrow();
  });

  it('allows action-only cases without inventing assertions or a startUrl', async () => {
    respond({
      name: '登录',
      preconditions: [],
      steps: [{ type: 'action', goal: '登录', inputs: [] }],
      assertions: [],
    });
    const result = await new TextCompiler().compile('登录');
    expect(result.assertions).toEqual([]);
    expect(result).not.toHaveProperty('startUrl');
  });
});
