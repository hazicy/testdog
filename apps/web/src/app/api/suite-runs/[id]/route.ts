import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { getSuiteRun, cancelSuiteRun } from '@testdog/server/suites/runs';
import { apiError } from '@testdog/server/http/api';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    return NextResponse.json(
      await getSuiteRun((await context.params).id, await requireUserId(request)),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await cancelSuiteRun((await context.params).id, await requireUserId(request));

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
