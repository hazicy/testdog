import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { saveTest, deleteTest } from '@/server/test-cases/repository';
import { testSchema, testInputMessage } from '@/features/test-cases/schemas';
import { apiError, validId } from '@/server/shared/http';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const parsed = testSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) return NextResponse.json({ message: testInputMessage }, { status: 400 });
    validId(id);

    return NextResponse.json({
      test: await saveTest(parsed.data, id, await requireUserId(request)),
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
