import { z } from 'zod';
import { PlanSchema } from './schema';
import { HttpUrlSchema } from '../platform/target';
import { InputRefsSchema } from '../platform/inputs';

// Authoring does not require a fully configured device or URL yet.
export const CompilationContextSchema = z.strictObject({
  platform: z.enum(['web', 'android', 'ios']),
  appId: z.string().trim().min(1).max(200).optional(),
  inputs: InputRefsSchema.optional(),
});
export const CompileRequestSchema = z
  .strictObject({
    goal: z.string().trim().min(1).max(20000),
    url: HttpUrlSchema.optional(),
    currentPlan: PlanSchema.optional(),
    context: CompilationContextSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.url && input.context && input.context.platform !== 'web')
      ctx.addIssue({ code: 'custom', message: '原生测试不使用网站地址作为启动目标' });
  });
export type CompileRequest = z.infer<typeof CompileRequestSchema>;
