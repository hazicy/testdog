import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { moveTests } from '@testdog/server/suites/folders';
import { apiError } from '@testdog/server/shared/http';
import { WorkspaceError } from '@testdog/server/shared/errors';

const inputSchema = z.strictObject({
  testIds: z.array(z.uuid()).min(1).max(100),
  folderId: z.uuid().nullable(),
});

export async function PATCH(request: Request) {
  try {
    const scope = await requireUserId(request);
    const input = inputSchema.safeParse(await request.json().catch(() => null));

    if (!input.success) throw new WorkspaceError('移动用例参数无效。');
    await moveTests(input.data.testIds, input.data.folderId, scope);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
