import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TextCompiler } from '@/automation/compiler/textCompiler';
import { modelClient } from '@/server/shared/model';
import { requireUserId } from '@/server/shared/auth';
import { WorkspaceError } from '@/server/shared/errors';
import { withApiError } from '@/server/shared/http';
import { websiteSchema } from '@/features/test-cases/schemas';

export const runtime = 'nodejs';
const inputSchema = z.object({
  goal: z.string().trim().min(1).max(20000),
  url: websiteSchema.optional(),
});

export const POST = withApiError(async (request: Request) => {
  await requireUserId(request);
  const input = inputSchema.safeParse(await request.json().catch(() => null));

  if (!input.success)
    return NextResponse.json({ message: '请填写测试步骤和有效的网站地址。' }, { status: 400 });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90000)]);
  const plan = await new TextCompiler(modelClient)
    .compile(input.data.goal, input.data.url, signal)
    .catch(() => {
      throw new WorkspaceError('AI 转换失败，请重试；原文本已保留。', 502);
    });

  return NextResponse.json({ plan });
});
