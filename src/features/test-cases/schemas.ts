import { TestTargetSchema } from '@/automation/platform/target';
import { z } from 'zod';

export const websiteSchema = z
  .url()
  .refine((value) => /^https?:\/\//i.test(value), '网站地址必须使用 http 或 https');
export const testSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Native cases normalize their legacy URL column to ''. API and repository
    // validation must both accept this representation without requiring a URL.
    url: z.preprocess((value) => (value === '' ? undefined : value), websiteSchema.optional()),
    target: TestTargetSchema.optional(),
    goal: z.string().trim().min(1).max(20000),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  })
  .superRefine((input, ctx) => {
    if (!input.target && !input.url) ctx.addIssue({ code: 'custom', message: '请提供测试目标' });
  })
  .transform((input) => ({
    ...input,
    url: input.target?.platform === 'web' ? input.target.url : input.target ? '' : input.url!,
  }));
