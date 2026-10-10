import { listTestPage } from '@/server/workspace/queries';
import { readPage } from '@/server/shared/pagination';
import { NextResponse } from 'next/server';
import { saveTest } from '@/server/test-cases/repository';
import { testSchema, testInputMessage } from '@/features/test-cases/schemas';
import { withApiError } from '@/server/shared/http';

export const runtime = 'nodejs';

export const GET = withApiError(async (request: Request) =>
  NextResponse.json(await listTestPage(readPage(request))),
);

export const POST = withApiError(async (request: Request) => {
  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: testInputMessage }, { status: 400 });

  return NextResponse.json({ test: await saveTest(parsed.data) }, { status: 201 });
});
