import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/http/api';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { submitOnce } from '@testdog/server/shared/idempotency';
import { startVerification } from '@testdog/server/issues/repository';
import { verificationInput } from '@testdog/contracts/issues/schemas';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = verificationInput.safeParse(await request.json().catch(() => null));

    if (!z.uuid().safeParse(id).success) throw new WorkspaceError('问题不存在。', 404);
    if (!parsed.success) throw new WorkspaceError('回归来源无效。');
    const body = await submitOnce(
      request,
      parsed.data,
      async (tx) => ({ run: await startVerification(id, parsed.data, userId, tx) }),
      userId,
    );

    return NextResponse.json(body, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
