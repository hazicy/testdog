import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCases, createCase } from '@/db/queries/case';

export const runtime = 'nodejs';

const RequestSchema = z.union([
  z.object({ mode: z.literal('replay'), flowId: z.string().uuid() }),
  z.object({
    mode: z.literal('record').default('record'),
    case: z.string().trim().min(1),
    url: z.string().url().optional(),
  }),
]);

export async function GET() {
  const cases = await getCases();
  return NextResponse.json({ cases });
}

export async function POST(request: NextRequest) {
  const { id, goal } = await request.json();
  const newCase = await createCase(id, goal);

  return NextResponse.json({ newCase });
}
