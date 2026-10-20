import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/server/shared/auth';
import { moveTest } from '@testdog/server/suites/folders';
import { apiError } from '@testdog/server/http/api';
import { WorkspaceError } from '@testdog/server/shared/errors';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await requireUserId(request);
    const input = z
      .object({ folderId: z.uuid().nullable() })
      .strict()
      .safeParse(await request.json().catch(() => null));

    if (!input.success) throw new WorkspaceError('目标文件夹无效。');
    await moveTest((await params).id, input.data.folderId, scope);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
