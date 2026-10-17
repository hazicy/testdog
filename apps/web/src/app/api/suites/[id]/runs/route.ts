import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { startSuite } from '@testdog/server/suites/runs';
import { apiError } from '@testdog/server/shared/http';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(
      await startSuite(request, (await context.params).id, await requireUserId(request)),
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
