import { requireUserId } from '@/server/shared/auth';
import { listTestPage } from '@/server/workspace/queries';
import { readPage } from '@/server/shared/pagination';
import { NextResponse } from 'next/server';
import { saveTest } from '@/server/test-cases/repository';
import { testSchema, testValidationMessage } from '@/features/test-cases/schemas';
import { apiError } from '@/server/shared/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listTestPage(readPage(request), await requireUserId(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const parsed = testSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success)
      return NextResponse.json({ message: testValidationMessage(parsed.error) }, { status: 400 });

    return NextResponse.json(
      { test: await saveTest(parsed.data, undefined, userId) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
