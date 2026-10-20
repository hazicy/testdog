import { HttpUrlSchema, TestTargetSchema } from '@testdog/contracts/execution/target';
import { z } from 'zod';
import { ExecutablePlanSchema } from '@testdog/contracts/execution/plan';

export const runRequestSchema = z.union([
  z.strictObject({
    draft: z.strictObject({
      name: z.string().trim().min(1).max(120),
      goal: z.string().trim().min(1).max(20000),
      target: TestTargetSchema,
      plan: ExecutablePlanSchema,
    }),
  }),
  z.strictObject({
    testId: z.uuid(),
    mode: z.literal('record').optional(),
    target: TestTargetSchema.optional(),
  }),
  z.strictObject({
    mode: z.literal('replay'),
    sourceRunId: z.uuid(),
    recordingVersionId: z.uuid().optional(),
    target: TestTargetSchema.optional(),
  }),
  z
    .strictObject({
      mode: z.literal('record').default('record'),
      case: z.string().trim().min(1).max(20000),
      url: HttpUrlSchema.optional(),
      target: TestTargetSchema.optional(),
    })
    .refine((input) => input.target || input.url, '请提供测试目标'),
]);
export type RunRequest = z.input<typeof runRequestSchema>;
export const recordingCodeSchema = z.string().min(1).max(100000);
export const recordingInputMessage = '请提供有效脚本（最多 100,000 字符）。';
