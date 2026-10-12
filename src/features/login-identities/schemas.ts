import { z } from 'zod';
import { InputRefsSchema } from '@/automation/platform/inputs';
import { HttpUrlSchema } from '@/automation/platform/target';

export const loginIdentityInput = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    website: HttpUrlSchema,
    loginTestId: z.uuid(),
    checkUrl: HttpUrlSchema,
    successText: z.string().trim().min(1).max(200),
    inputs: InputRefsSchema.default({}),
    ttlMinutes: z.number().int().min(1).max(1440).default(60),
    version: z.number().int().min(0),
  })
  .refine(
    (value) => new URL(value.website).origin === new URL(value.checkUrl).origin,
    '登录后的验证页面必须属于同一网站',
  );
