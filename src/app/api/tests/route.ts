import { listTestPage } from '@/server/workspace/queries';
import { readPage } from '@/server/shared/pagination';
import { NextResponse } from 'next/server';
import { saveTest } from '@/server/test-cases/repository';
import { testSchema } from '@/features/test-cases/schemas';
import { apiError } from '@/server/shared/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listTestPage(readPage(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: '请填写名称、有效的网站地址和测试步骤。' },
      { status: 400 },
    );
  try {
    return NextResponse.json({ test: await saveTest(parsed.data) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
