import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { getRun } from '@testdog/server/runs/repository';
import { requestCancellation } from '@testdog/server/runs/lifecycle';
import { apiError, validId } from '@testdog/server/shared/http';
import { jsonResponse } from '@testdog/server/shared/jsonResponse';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;

    validId(id);

    return jsonResponse(request, {
      run: await getRun(id, {
        userId: await requireUserId(request),
        includeLogs: new URL(request.url).searchParams.get('include') === 'logs',
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;

    validId(id);
    await requestCancellation(id, await requireUserId(request));

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
