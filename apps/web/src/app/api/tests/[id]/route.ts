import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { saveTest, deleteTest, getTest } from '@testdog/server/test-cases/repository';
import { apiError, validId } from '@testdog/server/http/api';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;

    validId(id);

    return NextResponse.json({ test: await getTest(id, userId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;

    validId(id);

    return NextResponse.json({
      test: await saveTest(await request.json().catch(() => null), id, userId),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;

    validId(id);
    await deleteTest(id, await requireUserId(request));

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
