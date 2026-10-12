import { requireUserId } from '@/server/shared/auth';
import { listTestPage } from '@testdog/server/workspace/queries';
import { readPage } from '@testdog/server/shared/pagination';
import { NextResponse } from 'next/server';
import { saveTest } from '@testdog/server/test-cases/repository';
import { apiError } from '@testdog/server/shared/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listTestPage(readPage(request), await requireUserId(request)));
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
