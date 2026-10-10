import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { testRuns, modelCalls } from '@/db/schema';
import { readModelUsage } from '@/server/runs/modelUsage';
import { apiError, validId } from '@/server/shared/http';
import { WorkspaceError } from '@/server/shared/errors';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);
    const [run] = await db.select({ id: testRuns.id }).from(testRuns).where(eq(testRuns.id, id));

    if (!run) throw new WorkspaceError('执行记录不存在。', 404);
    const calls = await db
      .select()
      .from(modelCalls)
      .where(eq(modelCalls.runId, id))
      .orderBy(asc(modelCalls.startedAt), asc(modelCalls.id));

    return NextResponse.json({ usage: await readModelUsage(id), calls });
  } catch (error) {
    return apiError(error);
  }
}
