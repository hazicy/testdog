import { chromium } from "playwright";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Executor } from "@/automation/executor";
export const runtime = "nodejs";
const RequestSchema = z.union([
  z.object({ mode: z.literal("replay"), flowId: z.string().uuid() }),
  z.object({
    mode: z.literal("record").default("record"),
    case: z.string().trim().min(1),
    url: z.string().url().optional(),
  }),
]);

export async function GET() {
  return NextResponse.json({ flows: [] });
}

export async function POST(request: NextRequest) {
  const parsed = RequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { success: false, message: parsed.error.message },
      { status: 400 },
    );
  let browser;
  try {
    const input = parsed.data;
    browser = await chromium.launch({
      headless: process.env.AUTOMATION_HEADLESS === "true",
    });
    const context = await browser.newContext();
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    const executor = new Executor();
    if (input.mode !== "record") throw new Error("缺少流程");
    const recorded = await executor.record(
      input.case,
      page,
      undefined,
      input.url,
    );
    return NextResponse.json({
      success: true,
      mode: "record",
      flowId: recorded.id,
      steps: recorded.steps.length,
    });
  } catch (error) {
    console.error("用例执行失败", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 },
    );
  } finally {
    await browser?.close();
  }
}
