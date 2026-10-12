import { requireUserId } from '@/server/shared/auth';
import { listRunPage } from '@testdog/server/workspace/queries';
import { readPage } from '@testdog/server/shared/pagination';
import { NextResponse } from 'next/server';
import { submitRun } from '@testdog/server/runs/submission';
import { apiError } from '@testdog/server/shared/http';

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
    const body = await submitRun(request, await request.json().catch(() => null), userId);

    return NextResponse.json(body, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
