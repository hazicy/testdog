import { z } from 'zod';

export const TargetSchema = z.object({
  kind: z.enum(['role', 'label', 'placeholder', 'testId', 'css', 'ariaRef']),
  value: z.string(),
  name: z.string(),
});

export const CheckSchema = z.object({
  urlPattern: z.string().min(1),
  visible: TargetSchema.nullable(),
  mode: z.enum(['unique', 'any', 'count', 'value']).default('unique'),
  minCount: z.number().int().nonnegative().default(1),
  inputValue: z.string().default(''),
});

export const StepSchema = z.object({
  type: z.enum(['navigate', 'click', 'fill', 'press']),
  target: TargetSchema,
  value: z.string(),
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

export { FeishuCompiler } from './feishuCompiler';
export { TextCompiler } from './textCompiler';
export type { Compiler } from './type';
