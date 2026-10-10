import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { workspaceStats } from '@/server/workspace/queries';
import { apiError } from '@/server/shared/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await workspaceStats(await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}
