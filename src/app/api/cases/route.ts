import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Executor } from '@/engine/executor';
import { BrowserClient } from '@/engine/browser';
import { TextCompiler } from '@/engine/compiler';
import { Observer } from '@/engine/observer';
import { getUsers } from '@/db/queries/user';
import { getCases } from '@/db/queries/case';

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
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success)
    return NextResponse.json({ success: false, message: parsed.error.message }, { status: 400 });

  let browser;

  try {
    const input = parsed.data;
    if (input.mode !== 'record') throw new Error('缺少流程');
    const textCompiler = new TextCompiler();

    const intentNode = await textCompiler.compile(input.case);
    const browserClient = await BrowserClient.create();

    browser = browserClient.getBrowser();

    const context = await browser.newContext();

    context.setDefaultTimeout(15000);

    const page = await context.newPage();
    const observer = new Observer();
    const executor = new Executor(observer, intentNode);

    await executor.record(input.case, page);

    return NextResponse.json({
      success: true,
      mode: 'record',
    });
  } catch (error) {
    console.error('用例执行失败', error);
    return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
