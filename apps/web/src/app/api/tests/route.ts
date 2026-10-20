import { requireUserId } from '@/server/shared/auth';
import { listTestPage } from '@testdog/server/workspace/queries';
import { readPage } from '@testdog/server/shared/pagination';
import { NextResponse } from 'next/server';
import { saveTest } from '@testdog/server/test-cases/repository';
import { apiError, validId } from '@testdog/server/http/api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const folder = new URL(request.url).searchParams.get('folder');

    if (folder && folder !== 'root') validId(folder);

    return NextResponse.json(
      await listTestPage(
        readPage(request),
        await requireUserId(request),
        folder === 'root' ? null : (folder ?? undefined),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);

    return NextResponse.json(
      { test: await saveTest(await request.json().catch(() => null), undefined, userId) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
