import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/server/shared/auth';
import { renameTest } from '@testdog/server/test-cases/repository';
import { apiError } from '@testdog/server/shared/http';
import { WorkspaceError } from '@testdog/server/shared/errors';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await requireUserId(request);
    const body = z
      .strictObject({ name: z.unknown() })
      .safeParse(await request.json().catch(() => null));

    if (!body.success) throw new WorkspaceError('用例名称无效。');

    return NextResponse.json({ test: await renameTest((await params).id, body.data.name, scope) });
  } catch (error) {
    return apiError(error);
  }
}
