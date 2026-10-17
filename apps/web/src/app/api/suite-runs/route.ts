import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { listSuiteRuns } from '@testdog/server/suites/runs';
import { readPage } from '@testdog/server/shared/pagination';
import { apiError } from '@testdog/server/shared/http';

export async function GET(request: Request) {
  try {
    return NextResponse.json(
      await listSuiteRuns(
        readPage(request),
        await requireUserId(request),
        new URL(request.url).searchParams.get('suiteId') ?? undefined,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
