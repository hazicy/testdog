import { assertRunAccess } from '@/server/runs/repository';
import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { modelCalls } from '@/db/schema';
import { readModelUsage } from '@/server/runs/modelUsage';
import { apiError, validId } from '@/server/shared/http';

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
