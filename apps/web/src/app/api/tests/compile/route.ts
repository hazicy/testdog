import { z } from 'zod';
import { NextResponse } from 'next/server';
import { CompileRequestSchema } from '@testdog/contracts/execution/compilation';
import { TextCompiler } from '@testdog/engine/compiler/textCompiler';
import { modelClient } from '@testdog/server/infrastructure/model';
import { requireUserId } from '@/server/shared/auth';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { apiError } from '@testdog/server/http/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await requireUserId(request);
    const input = CompileRequestSchema.safeParse(await request.json().catch(() => null));

    if (!input.success)
      return NextResponse.json({ message: '请填写有效的测试步骤和目标信息。' }, { status: 400 });
    const deadline = AbortSignal.timeout(90000);
    const signal = AbortSignal.any([request.signal, deadline]);
    const plan = await new TextCompiler(modelClient)
      .compile(input.data, signal)
      .catch((error: unknown) => {
        if (request.signal.aborted)
          throw new WorkspaceError('步骤生成已取消；当前画板和描述已保留。', 408);
        if (deadline.aborted)
          throw new WorkspaceError('步骤生成超时，请重试；当前画板和描述已保留。', 504);
        console.error('步骤生成失败', error);
        if (
          error instanceof z.ZodError &&
          error.issues.some(
            (issue) =>
              issue.code === 'custom' && issue.path[0] === 'nodes' && issue.path[2] === 'goal',
          )
        )
          throw new WorkspaceError(
            '生成的 Navigate 步骤缺少有效网址，请在描述中提供完整的 http 或 https 地址。',
            422,
          );
        throw new WorkspaceError('步骤生成失败，请重试；当前画板和描述已保留。', 502);
      });

    return NextResponse.json({ plan });
  } catch (error) {
    return apiError(error);
  }
}
