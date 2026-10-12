import {
  HttpUrlSchema,
  TestTargetSchema,
  targetUrl,
} from '@testdog/contracts/automation/platform/target';
import { validateInputReferences } from '@testdog/contracts/automation/compiler/executionPlan';
import { ExecutablePlanSchema } from '@testdog/contracts/automation/compiler/schema';
import { z } from 'zod';

const testInputMessage = '请填写名称、有效的测试目标和测试步骤。';

export function testValidationMessage(error: z.ZodError) {
  return error.issues.find((issue) => issue.code === 'custom')?.message ?? testInputMessage;
}

export const testSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Native cases normalize their legacy URL column to ''. API and repository
    // validation must both accept this representation without requiring a URL.
    url: z.preprocess((value) => (value === '' ? undefined : value), HttpUrlSchema.optional()),
    target: TestTargetSchema.optional(),
    goal: z.string().trim().min(1).max(20000),
    plan: ExecutablePlanSchema.nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  })
  .superRefine((input, ctx) => {
    if (!input.target && !input.url) ctx.addIssue({ code: 'custom', message: '请提供测试目标' });
    try {
      validateInputReferences(input.goal, input.plan, input.target?.inputs);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
  .transform((input) => ({
    ...input,
    url: input.target ? targetUrl(input.target) : input.url!,
  }));
