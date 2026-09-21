import { z, type JSONType } from 'zod';
import { generateWithOpenAI } from '../ai/provider/openai';
export const TargetSchema = z.object({
  kind: z.enum(['role', 'label', 'placeholder', 'testId', 'css', 'ariaRef']),
  value: z.string(),
  name: z.string(),
  scope: z.string(),
  index: z.number().int().min(-1),
});
export const CheckSchema = z.object({
  urlPattern: z.string().min(1),
  visible: TargetSchema.nullable(),
  mode: z.enum(['unique', 'any', 'count', 'value']).default('unique'),
  minCount: z.number().int().nonnegative().default(1),
  inputValue: z.string().default(''),
});
export const StepSchema = z.object({
  type: z.enum(['navigate', 'click', 'fill', 'press', 'wait', 'assert']),
  target: TargetSchema,
  value: z.string(),
  transition: z.enum(['same', 'navigation', 'popup']),
  expected: CheckSchema.nullable(),
});
export const AttentionSchema = z.object({
  location: z.string().min(1),
  scope: z.string(),
});
export const FlowSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  goal: z.string().min(1),
  createdAt: z.string(),
  steps: z.array(StepSchema).min(1),
  final: CheckSchema.nullable(),
});
export type Target = z.infer<typeof TargetSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Flow = z.infer<typeof FlowSchema>;
// Navigation has no destination evidence yet. Persisted steps still require a check.
const Decision = z.object({
  done: z.boolean(),
  reason: z.string(),
  step: StepSchema.extend({ expected: CheckSchema.nullable() }).nullable(),
  attention: AttentionSchema.nullable(),
});
export class RollingCaseCompiler {
  async compileIntents(goal: string, startUrl?: string) {
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
      responseFormat: {
        type: 'json_schema',
        name: 'case_intents',
        schema: z.toJSONSchema(schema) as JSONType,
      },
      temperature: 0,
    });
    return schema.parse(response.structuredContent).intents;
  }

  async planNext(input: { goal: string; tree: string; steps: Step[] }) {
    const response = await generateWithOpenAI({
      systemPrompt: `Plan one browser action.返回下一步你想操作的 ref 和 动作`,
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: JSON.stringify(input) },
        },
      ],
      temperature: 0,
      responseFormat: {
        type: 'json_schema',
        name: 'browser_step',
        schema: z.toJSONSchema(Decision) as JSONType,
      },
    });

    console.log('response', response.structuredContent);

    return Decision.parse(response.structuredContent);
  }
}
