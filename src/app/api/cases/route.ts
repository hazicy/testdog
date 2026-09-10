import { chromium } from 'playwright';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Executor } from '@/automation/executor';
import { listFlows, loadFlow, saveFlow } from '@/automation/flow-store';
export const runtime = 'nodejs';
const RequestSchema = z.union([
    z.object({ mode: z.literal('replay'), flowId: z.string().uuid() }),
    z.object({ mode: z.literal('record').default('record'), case: z.string().trim().min(1), url: z.string().url().optional() }),
]);
export async function GET() { return NextResponse.json({ flows: await listFlows() }); }
export async function POST(request: NextRequest) {
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
        return NextResponse.json({ success: false, message: parsed.error.message }, { status: 400 });
    let browser;
    try {
        const input = parsed.data;
        const flow = input.mode === 'replay' ? await loadFlow(input.flowId) : undefined;
        browser = await chromium.launch({ headless: process.env.AUTOMATION_HEADLESS === 'true' });
        const context = await browser.newContext();
        context.setDefaultTimeout(15000);
        const page = await context.newPage();
        const executor = new Executor();
        if (flow)
            return NextResponse.json({ success: true, mode: 'replay', flowId: flow.id, ...await executor.replay(flow, page) });
        if (input.mode !== 'record')
            throw new Error('缺少流程');
        const recorded = await executor.record(input.case, page, undefined, input.url);
        await saveFlow(recorded);
        return NextResponse.json({ success: true, mode: 'record', flowId: recorded.id, steps: recorded.steps.length });
    }
    catch (error) {
        console.error('用例执行失败', error);
        return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
    }
    finally {
        await browser?.close();
    }
}
