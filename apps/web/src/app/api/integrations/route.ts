import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/http/api';
import { readIntegrations } from '@testdog/server/integrations/repository';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await readIntegrations(await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}
