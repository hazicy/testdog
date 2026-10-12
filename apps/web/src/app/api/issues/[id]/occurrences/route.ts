import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/shared/http';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { linkOccurrence } from '@testdog/server/issues/repository';
import { occurrenceInput } from '@testdog/contracts/issues/schemas';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = occurrenceInput.safeParse(await request.json().catch(() => null));

    if (!z.uuid().safeParse(id).success) throw new WorkspaceError('问题不存在。', 404);
    if (!parsed.success) throw new WorkspaceError('执行来源无效。');

    return NextResponse.json(await linkOccurrence(id, parsed.data, userId));
  } catch (error) {
    return apiError(error);
  }
}
