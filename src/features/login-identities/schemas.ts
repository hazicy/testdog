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
    secrets: z
      .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), z.string().min(1).max(20000))
      .refine((secrets) => Object.keys(secrets).length <= 50, 'Too many secrets')
      .default({}),
    ttlMinutes: z.number().int().min(1).max(1440).default(60),
    version: z.number().int().min(0),
  })
  .refine((value) => new URL(value.website).origin === new URL(value.checkUrl).origin, {
    message: '登录后的验证页面必须属于同一网站',
    path: ['checkUrl'],
  });
