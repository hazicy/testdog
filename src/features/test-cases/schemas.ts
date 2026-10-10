import { TestTargetSchema } from '@/automation/platform/target';
import { PlanSchema } from '@/automation/compiler/schema';
import { z } from 'zod';

export const websiteSchema = z
  .url()
  .refine((value) => /^https?:\/\//i.test(value), '网站地址必须使用 http 或 https');
export const testInputMessage = '请填写名称、有效的网站地址和测试步骤。';
export const testSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Native cases normalize their legacy URL column to ''. API and repository
    // validation must both accept this representation without requiring a URL.
    url: z.preprocess((value) => (value === '' ? undefined : value), websiteSchema.optional()),
    target: TestTargetSchema.optional(),
    goal: z.string().trim().min(1).max(20000),
    plan: PlanSchema.nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  })
  .superRefine((input, ctx) => {
    if (input.plan && !Object.values(input.plan.nodes).some((node) => node.kind === 'task'))
      ctx.addIssue({ code: 'custom', message: '请在画板中添加至少一个步骤' });
    if (!input.target && !input.url) ctx.addIssue({ code: 'custom', message: '请提供测试目标' });
  })
  .transform((input) => ({
    ...input,
    url: input.target?.platform === 'web' ? input.target.url : input.target ? '' : input.url!,
  }));
