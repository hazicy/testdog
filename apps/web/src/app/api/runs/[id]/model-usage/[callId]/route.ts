import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { assertRunAccess } from '@testdog/server/runs/repository';
import { readModelCall } from '@testdog/server/runs/modelUsage';
import { apiError, validId } from '@testdog/server/http/api';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; callId: string }> },
) {
  try {
    const { id, callId } = await context.params;

    validId(id);
    validId(callId);
    await assertRunAccess(id, await requireUserId(request));

    return NextResponse.json(await readModelCall(id, callId));
  } catch (error) {
    return apiError(error);
  }
}
