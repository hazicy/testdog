import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCases, createCase } from '@/db/queries';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  id: z.number().int(),
  goal: z.string().trim().min(1),
});

export async function GET() {
  const cases = await getCases();

  return NextResponse.json({ cases });
}

export async function POST(request: NextRequest) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.message }, { status: 400 });
  }
  const { id, goal } = parsed.data;
  const newCase = await createCase(id, goal);

  return NextResponse.json({ newCase });
}
