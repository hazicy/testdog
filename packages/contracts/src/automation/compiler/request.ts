import { z } from 'zod';
import { PlanSchema } from '@testdog/contracts/automation/compiler/schema';
import { HttpUrlSchema } from '@testdog/contracts/automation/platform/target';

// Authoring does not require a fully configured device or URL yet.
const CompilationContextSchema = z.strictObject({
  platform: z.enum(['web', 'android', 'ios']),
  appId: z.string().trim().min(1).max(200).optional(),
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
