import { HttpUrlSchema, TestTargetSchema, targetUrl } from '@testdog/contracts/execution/target';
import { ExecutablePlanSchema } from '@testdog/contracts/execution/plan';
import { z } from 'zod';

const testInputMessage = '请填写名称、有效的测试目标和测试步骤。';

export function testValidationMessage(error: z.ZodError) {
  return error.issues.find((issue) => issue.code === 'custom')?.message ?? testInputMessage;
}

export const testNameSchema = z.string().trim().min(1).max(120);

export const testSchema = z
  .object({
    folderId: z.uuid().nullable().optional(),
    name: testNameSchema,
    // URL-only Web input remains accepted; persisted URLs live in the target.
    url: z.preprocess((value) => (value === '' ? undefined : value), HttpUrlSchema.optional()),
    target: TestTargetSchema.optional(),
    goal: z.string().trim().min(1).max(20000),
    plan: ExecutablePlanSchema.nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  })
  .superRefine((input, ctx) => {
    if (!input.target && !input.url) ctx.addIssue({ code: 'custom', message: '请提供测试目标' });
  })
  .transform((input) => ({
    ...input,
    url: input.target ? targetUrl(input.target) : input.url!,
  }));
