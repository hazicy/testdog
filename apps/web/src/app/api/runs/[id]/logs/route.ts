import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { listBrowserLogs } from '@testdog/server/runs/logs';
import { apiError, validId } from '@testdog/server/http/api';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);

    return NextResponse.json(await listBrowserLogs(id, request, await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}
