import { submitOnce } from '@/server/shared/idempotency';
import { listRunPage } from '@/server/workspace/queries';
import { readPage } from '@/server/shared/pagination';
import { NextResponse } from 'next/server';
import { createRun } from '@/server/runs/repository';
import { withApiError } from '@/server/shared/http';
import { runRequestSchema } from '@/features/runs/schemas';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const GET = withApiError(async (request: Request) =>
  NextResponse.json(await listRunPage(readPage(request))),
);

export const POST = withApiError(async (request: Request) => {
  const parsed = runRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { success: false, message: '请提供用例 ID，或重放来源 ID，或测试描述与网站地址。' },
      { status: 400 },
    );

  const body = await submitOnce(request, parsed.data, async (tx) => ({
    success: true,
    run: await createRun(parsed.data, tx),
  }));

  return NextResponse.json(body, { status: 202 });
});
