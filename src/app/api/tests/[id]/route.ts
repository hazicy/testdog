import { NextResponse } from 'next/server';
import { saveTest, deleteTest } from '@/server/test-cases/repository';
import { testSchema } from '@/features/test-cases/schemas';
import { apiError, validId } from '@/server/shared/http';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: '请填写名称、有效的网站地址和测试步骤。' },
      { status: 400 },
    );
  try {
    validId(id);

    return NextResponse.json({ test: await saveTest(parsed.data, id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  try {
    validId(id);
    await deleteTest(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
