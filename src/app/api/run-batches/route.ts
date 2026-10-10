import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TestTargetSchema } from '@/automation/platform/target';
import { createRun } from '@/server/runs/repository';
import { db } from '@/db';
import { apiError } from '@/server/shared/http';

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
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success)
    return NextResponse.json({ message: '请提供用例及平台目标矩阵' }, { status: 400 });
  const batchId = randomUUID();
  try {
    const runs = await db.transaction(async (tx) => {
      const resultRuns = [];
      for (const variant of result.data.variants)
        resultRuns.push(
          await createRun(
            {
              testId: result.data.testId,
              target: variant.target,
              goalOverride: variant.goal,
              batchId,
            },
            tx,
          ),
        );

      return resultRuns;
    });

    return NextResponse.json({ batchId, runs }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
