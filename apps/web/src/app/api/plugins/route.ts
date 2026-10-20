import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/http/api';
import { readPluginSettings } from '@testdog/server/plugins/repository';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await readPluginSettings(await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}
