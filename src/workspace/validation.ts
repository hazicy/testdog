import { z } from 'zod';
export const websiteSchema = z
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    '网站地址必须使用 http 或 https',
  );
export const testSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: websiteSchema,
  goal: z.string().trim().min(1).max(20000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});
