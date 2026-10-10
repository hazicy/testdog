import { NextResponse } from 'next/server';
import { listBrowserLogs } from '@/server/runs/logs';
import { apiError, validId } from '@/server/shared/http';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);

    return NextResponse.json(await listBrowserLogs(id, request));
  } catch (error) {
    return apiError(error);
  }
}
