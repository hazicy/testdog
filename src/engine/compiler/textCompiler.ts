import { generateWithOpenAI } from '@/ai/provider/deepseek';
import { type JSONType, z } from 'zod';
import type { Compiler, IntentNode } from './type';

export class TextCompiler implements Compiler {
  constructor() {}

  async compile(goal: string, startUrl?: string): Promise<IntentNode> {
    const AtomicIntentSchema = z
      .object({
        goal: z.string().min(1).max(200),
        status: z.literal('atomic'),
        constraints: z.array(z.string()).default([]),
        successCriteria: z.array(z.string()).default([]),
      })
      .strict();

    const IntentNodeSchema: z.ZodType<IntentNode> = z.lazy(() =>
      z.union([AtomicIntentSchema, IntentTreeSchema]),
    );

    const IntentTreeSchema = z
      .object({
        goal: z.string().min(1).max(200),
        status: z.literal('compound'),
        constraints: z.array(z.string()).default([]),
        successCriteria: z.array(z.string()).default([]),
        children: z.array(IntentNodeSchema).min(1),
      })
      .strict();

    // Use the provider's documented schema dialect; keep length constraints in Zod.
    const commonProperties = {
      goal: { type: 'string' },
      constraints: { type: 'array', items: { type: 'string' } },
      successCriteria: { type: 'array', items: { type: 'string' } },
    };
    const atomicSchema = {
      type: 'object',
      properties: {
        ...commonProperties,
        status: { type: 'string', enum: ['atomic'] },
      },
      required: ['goal', 'status', 'constraints', 'successCriteria'],
      additionalProperties: false,
    };
    const compoundSchema = {
      type: 'object',
      properties: {
        ...commonProperties,
        status: { type: 'string', enum: ['compound'] },
        children: {
          type: 'array',
          items: { $ref: '#/$def/node' },
        },
      },
      required: ['goal', 'status', 'constraints', 'successCriteria', 'children'],
      additionalProperties: false,
    };
    const schema = {
      ...compoundSchema,
      $def: {
        node: { anyOf: [atomicSchema, compoundSchema] },
      },
    };

    const response = await generateWithOpenAI({
      systemPrompt: `为用户的用例返回一棵意图树，其子节点是按顺序排列的浏览器操作。
当用例包含多个操作时，根节点必须为 compound（复合节点）。
复合节点仅用于组织子意图，并且必须包含非空的 children，其子节点可以是 compound 或 atomic。
允许按有意义的子目标嵌套复合节点，每一层的子节点都必须按执行顺序排列。
atomic（原子节点）是叶节点，绝不能包含 children。
不要添加只有一个子节点或仅换一种说法的复合节点。每个原子节点代表一个浏览器子目标，可能需要多次导航、填写、点击或按键操作才能完成。
例如，登录：填写邮箱、填写密码、点击登录。搜索：填写查询内容、按 Enter 键、
点击指定的搜索结果。除非用户明确要求，否则不要追加验证操作。
不要编造 DOM 选择器。保留用户指定的输入值以及序号所表达的意图。
如果提供了 startUrl，则已处理导航到该地址的操作；省略这一步初始导航。
绝不要添加等待、重试、重新开始的循环，也不要在请求的操作序列完成后追加操作。`,
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: JSON.stringify({ goal, startUrl }) },
        },
      ],
      temperature: 0,
      responseFormat: {
        type: 'json_schema',
        name: 'case_intents',
        schema: schema as JSONType,
      },
    });

    return IntentTreeSchema.parse(response.structuredContent);
  }
}
