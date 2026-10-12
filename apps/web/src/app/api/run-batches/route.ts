import { requireUserId } from '@/server/shared/auth';
import { submitOnce } from '@testdog/server/shared/idempotency';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TestTargetSchema } from '@testdog/contracts/automation/platform/target';
import { createRun } from '@testdog/server/runs/submission';
import { apiError } from '@testdog/server/shared/http';

export const runtime = 'nodejs';
const schema = z.strictObject({
  testId: z.uuid(),
  variants: z
    .array(
      z.strictObject({
        target: TestTargetSchema,
        goal: z.string().trim().min(1).max(20000).optional(),
      }),
    )
    .min(1)
    .max(10),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const result = schema.safeParse(await request.json().catch(() => null));

    if (!result.success)
      return NextResponse.json({ message: '请提供用例及平台目标矩阵' }, { status: 400 });

    const body = await submitOnce(
      request,
      result.data,
      async (tx) => {
        const batchId = randomUUID();
        const runs = [];

        for (const variant of result.data.variants)
          runs.push(
            await createRun(
              {
                testId: result.data.testId,
                target: variant.target,
                goalOverride: variant.goal,
                batchId,
              },
              tx,
              userId,
            ),
          );

        return { batchId, runs };
      },
      userId,
    );

    return NextResponse.json(body, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
