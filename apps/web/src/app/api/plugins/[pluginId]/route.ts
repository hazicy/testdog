import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/http/api';
import { savePluginSettings } from '@testdog/server/plugins/repository';

export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ pluginId: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { pluginId } = await context.params;

    return NextResponse.json(
      await savePluginSettings(pluginId, await request.json().catch(() => null), userId),
    );
  } catch (error) {
    return apiError(error);
  }
}
