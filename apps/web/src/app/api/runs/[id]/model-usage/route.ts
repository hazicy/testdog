import { assertRunAccess } from '@testdog/server/runs/repository';
import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { modelCalls } from '@testdog/server/db/schema';
import { readModelUsage } from '@testdog/server/runs/modelUsage';
import { apiError, validId } from '@testdog/server/shared/http';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);
    await assertRunAccess(id, await requireUserId(request));
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
