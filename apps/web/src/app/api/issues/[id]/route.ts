import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/http/api';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { deleteIssue, getIssue, updateIssue } from '@testdog/server/issues/repository';
import { issueUpdate } from '@testdog/contracts/issues/schemas';

type Context = { params: Promise<{ id: string }> };
export const runtime = 'nodejs';

export async function GET(request: Request, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) throw new WorkspaceError('问题不存在。', 404);

    return NextResponse.json(await getIssue(id, userId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;
    const parsed = issueUpdate.safeParse(await request.json().catch(() => null));

    if (!z.uuid().safeParse(id).success) throw new WorkspaceError('问题不存在。', 404);
    if (!parsed.success) throw new WorkspaceError('问题修改内容无效。');

    return NextResponse.json({ issue: await updateIssue(id, parsed.data, userId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) throw new WorkspaceError('问题不存在。', 404);
    await deleteIssue(id, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
