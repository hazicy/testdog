import { after, NextResponse } from 'next/server';
import { createRun, listRuns } from '@/workspace/store';
import { executeRun } from '@/workspace/run';
import { apiError } from '@/workspace/http';
import { runRequestSchema } from '@/workspace/validation';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET() {
  try {
    return NextResponse.json({ runs: await listRuns() });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  const parsed = runRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { success: false, message: '请提供用例 ID，或重放来源 ID，或测试描述与网站地址。' },
      { status: 400 },
    );
  try {
    const run = await createRun(parsed.data);
    after(() => executeRun(run));
    return NextResponse.json({ success: true, run }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
