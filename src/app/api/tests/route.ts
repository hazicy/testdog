import { NextResponse } from 'next/server';
import { listTests, saveTest } from '@/workspace/server/store';
import { testSchema } from '@/workspace/validation';
import { apiError } from '@/workspace/server/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ tests: await listTests() });
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
