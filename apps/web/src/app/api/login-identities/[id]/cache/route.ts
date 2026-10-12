import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError, validId } from '@testdog/server/shared/http';
import { clearLoginState } from '@testdog/server/login-identities/repository';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;

    validId(id);
    await clearLoginState(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
