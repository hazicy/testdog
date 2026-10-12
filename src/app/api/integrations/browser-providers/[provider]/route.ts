import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@/server/shared/http';
import { saveBrowserProvider } from '@/server/browser-providers/repository';

export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const userId = await requireUserId(request);

    return NextResponse.json({
      integration: await saveBrowserProvider(
        (await context.params).provider,
        await request.json().catch(() => null),
        userId,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
