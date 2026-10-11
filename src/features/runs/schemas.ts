import { TestTargetSchema } from '@/automation/platform/target';
import { z } from 'zod';
import { websiteSchema } from '@/features/test-cases/schemas';
import { PlanSchema } from '@/automation/compiler/schema';

export const runRequestSchema = z.union([
  z.strictObject({
    draft: z.strictObject({
      name: z.string().trim().min(1).max(120),
      goal: z.string().trim().min(1).max(20000),
      target: TestTargetSchema,
      plan: PlanSchema.refine(
        (plan) => Object.values(plan.nodes).some((node) => node.kind === 'task'),
        '请添加至少一个步骤',
      ),
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
  z.strictObject({
    mode: z.literal('record').default('record'),
    case: z.string().trim().min(1).max(20000),
    url: websiteSchema.optional(),
    target: TestTargetSchema.optional(),
  }),
]);
export type RunRequest = z.input<typeof runRequestSchema>;
export const recordingCodeSchema = z.string().min(1).max(100000);
export const recordingRequestSchema = z.object({ code: recordingCodeSchema });
export const recordingInputMessage = '请提供有效脚本（最多 100,000 字符）。';
