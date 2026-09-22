import { generateWithOpenAI } from '@/ai/provider/openai';
import { type JSONType, z } from 'zod';
import { StepSchema } from '.';
import type { Compiler, Intent } from './type';

export class TextCompiler implements Compiler {
  async compile(goal: string, startUrl?: string): Promise<Intent[]> {
    const schema = z.object({
      intents: z
        .array(
          z.object({
            type: StepSchema.shape.type,
            instruction: z.string().min(1),
          }),
        )
        .min(1)
        .max(20),
    });
    const response = await generateWithOpenAI({
      systemPrompt: `Split the user's case into a fixed ordered list of atomic browser actions.
Each item is exactly one navigate, fill, click, press or explicitly requested assert.
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
        schema: z.toJSONSchema(schema) as JSONType,
      },
    });

    return schema.parse(response.structuredContent).intents;
  }
}
