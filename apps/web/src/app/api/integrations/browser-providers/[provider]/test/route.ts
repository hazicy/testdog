import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/http/api';
import { testBrowserProvider } from '@testdog/server/browser-providers/runtime';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const userId = await requireUserId(request);

    return NextResponse.json(
      await testBrowserProvider((await context.params).provider, userId, request.signal),
    );
  } catch (error) {
    return apiError(error);
  }
}
