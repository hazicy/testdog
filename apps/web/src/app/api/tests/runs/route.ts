import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { startCaseBatch } from '@testdog/server/test-cases/batchRuns';
import { apiError } from '@testdog/server/http/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const scope = await requireUserId(request);

    return NextResponse.json(
      await startCaseBatch(request, await request.json().catch(() => null), scope),
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
