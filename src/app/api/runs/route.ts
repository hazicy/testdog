import { requireUserId } from '@/server/shared/auth';
import { submitOnce } from '@/server/shared/idempotency';
import { listRunPage } from '@/server/workspace/queries';
import { readPage } from '@/server/shared/pagination';
import { NextResponse } from 'next/server';
import { createRun } from '@/server/runs/repository';
import { apiError } from '@/server/shared/http';
import { runRequestSchema } from '@/features/runs/schemas';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listRunPage(readPage(request), await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const parsed = runRequestSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success)
      return NextResponse.json(
        { success: false, message: '请提供用例 ID，或重放来源 ID，或测试描述与网站地址。' },
        { status: 400 },
      );

    const body = await submitOnce(
      request,
      parsed.data,
      async (tx) => ({
        success: true,
        run: await createRun(parsed.data, tx, userId),
      }),
      userId,
    );

    return NextResponse.json(body, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
