import { assertRunAccess } from '@testdog/server/runs/repository';
import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { listModelCalls, readModelUsage } from '@testdog/server/runs/modelUsage';
import { apiError, validId } from '@testdog/server/shared/http';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);
    await assertRunAccess(id, await requireUserId(request));
    const [usage, calls] = await Promise.all([readModelUsage(id), listModelCalls(id)]);

    return NextResponse.json({ usage, calls });
  } catch (error) {
    return apiError(error);
  }
}
