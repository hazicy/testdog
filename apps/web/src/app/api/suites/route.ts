import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { listSuites, saveSuite } from '@testdog/server/suites/repository';
import { readPage } from '@testdog/server/shared/pagination';
import { apiError } from '@testdog/server/http/api';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listSuites(readPage(request), await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const scope = await requireUserId(request);

    return NextResponse.json(
      await saveSuite(undefined, await request.json().catch(() => null), scope),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
