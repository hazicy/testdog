import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Executor } from '@/automation/executor';
import { launchBrowser } from '@/automation/browser';
import { TextCompiler } from '@/automation/compiler/textCompiler';
import { Observer } from '@/automation/observer';

export const runtime = 'nodejs';

const RequestSchema = z.union([
  z.object({ mode: z.literal('replay'), flowId: z.uuid() }),
  z.object({
    mode: z.literal('record').default('record'),
    case: z.string().trim().min(1),
    url: z.url().optional(),
  }),
]);

export async function POST(request: NextRequest) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success)
    return NextResponse.json({ success: false, message: parsed.error.message }, { status: 400 });

  let browser;

  try {
    const input = parsed.data;

    if (input.mode !== 'record') throw new Error('缺少流程');

    const textCompiler = new TextCompiler();

    const testCase = await textCompiler.compile(input.case, input.url);
    browser = await launchBrowser();

    const context = await browser.newContext();

    context.setDefaultTimeout(15000);

    const page = await context.newPage();
    const observer = new Observer();
    const executor = new Executor(observer, testCase, input.url);

    await executor.record(page);

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
