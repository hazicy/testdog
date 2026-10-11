import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TextCompiler } from '@/automation/compiler/textCompiler';
import { modelClient } from '@/server/shared/model';
import { requireUserId } from '@/server/shared/auth';
import { WorkspaceError } from '@/server/shared/errors';
import { apiError } from '@/server/shared/http';
import { websiteSchema } from '@/features/test-cases/schemas';
import { PlanSchema } from '@/automation/compiler/schema';

export const runtime = 'nodejs';
const inputSchema = z.object({
  goal: z.string().trim().min(1).max(20000),
  url: websiteSchema.optional(),
  currentPlan: PlanSchema.optional(),
});

export async function POST(request: Request) {
  try {
    await requireUserId(request);
    const input = inputSchema.safeParse(await request.json().catch(() => null));

    if (!input.success)
      return NextResponse.json({ message: '请填写测试步骤和有效的网站地址。' }, { status: 400 });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90000)]);
    const goal = input.data.currentPlan
      ? `根据修改要求调整当前测试计划。保留未要求修改的步骤、分支、输入值、节点 ID 和依赖关系；修改现有节点时保留其 ID，新增节点使用新的唯一 ID。返回调整后的完整计划。\n当前计划：${JSON.stringify(input.data.currentPlan)}\n修改要求：${input.data.goal}`
      : input.data.goal;
    const plan = await new TextCompiler(modelClient)
      .compile(goal, input.data.url, signal)
      .catch(() => {
        throw new WorkspaceError('步骤生成失败，请重试；当前画板和描述已保留。', 502);
      });

    return NextResponse.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
