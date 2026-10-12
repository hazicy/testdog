import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError, validId } from '@testdog/server/shared/http';
import {
  saveLoginIdentity,
  deleteLoginIdentity,
} from '@testdog/server/login-identities/repository';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;

    validId(id);

    return NextResponse.json({
      identity: await saveLoginIdentity(await request.json().catch(() => null), userId, id),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;

    validId(id);
    await deleteLoginIdentity(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
