import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError, validId } from '@/server/shared/http';
import { readPage } from '@/server/shared/pagination';
import { submitOnce } from '@/server/shared/idempotency';
import { createIssue, listIssues } from '@/server/issues/repository';
import { issueInput } from '@/features/issues/schemas';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const runId = params.get('runId') ?? undefined;

    if (runId) validId(runId);

    return NextResponse.json(
      await listIssues(readPage(request), await requireUserId(request), {
        platform: params.get('platform') ?? 'all',
        sort: params.get('sort') ?? 'last_seen',
        runId,
        days: params.has('days') ? Number(params.get('days')) : undefined,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const parsed = issueInput.safeParse(await request.json().catch(() => null));

    if (!parsed.success)
      return NextResponse.json({ message: '请填写问题标题及有效的问题信息。' }, { status: 400 });
    const body = await submitOnce(
      request,
      parsed.data,
      async (tx) => ({ issue: await createIssue(parsed.data, userId, tx) }),
      userId,
    );

    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
