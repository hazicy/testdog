import { NextResponse } from 'next/server';
import { workspaceStats } from '@/server/workspace/queries';
import { apiError } from '@/server/shared/http';
export const runtime = 'nodejs';
export async function GET() {
  try {
    return NextResponse.json(await workspaceStats());
  } catch (error) {
    return apiError(error);
  }
}
