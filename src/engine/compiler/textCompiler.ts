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

    const IntentTreeSchema = z
      .object({
        goal: z.string().min(1).max(200),
        status: z.literal('compound'),
        constraints: z.array(z.string()).default([]),
        successCriteria: z.array(z.string()).default([]),
        children: z.array(AtomicIntentSchema).min(1),
      })
      .strict();

    const response = await generateWithOpenAI({
      systemPrompt: `Return one intent tree for the user's case. Its children are ordered browser actions.
When the case has more than one action, the root node must be compound.
Use a compound node only to group child intents. A compound node must have children.
An atomic node is a leaf and must never have children. Keep the tree shallow: when possible,
the root compound node should contain the atomic actions directly; do not add unary or reworded
compound nodes. Each atomic node is one browser subgoal, which may require multiple navigate, fill, click, or press actions to complete.
Example login: fill email, fill password, click login. Search: fill query, press Enter,
click requested result. Do not append verification unless explicitly requested.
Do not invent DOM selectors. Retain user-specified input values and ordinal intent.
If startUrl is supplied, navigation to it is already handled; omit that initial navigation.
Never add waits, retries, restart loops or actions after the requested sequence is finished.`,
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
        schema: z.toJSONSchema(IntentTreeSchema) as JSONType,
      },
    });

    return IntentTreeSchema.parse(response.structuredContent) as IntentNode;
  }
}
