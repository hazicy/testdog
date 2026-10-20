import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { workspaceStats } from '@testdog/server/workspace/queries';
import { apiError } from '@testdog/server/http/api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await workspaceStats(await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}
