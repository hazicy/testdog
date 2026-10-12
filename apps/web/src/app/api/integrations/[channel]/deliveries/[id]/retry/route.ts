import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError, validId } from '@testdog/server/shared/http';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { channelSchema } from '@testdog/contracts/integrations/schemas';
import { retryDelivery } from '@testdog/server/integrations/repository';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ channel: string; id: string }> },
) {
  try {
    const userId = await requireUserId(request);
    const { channel, id } = await context.params;
    const parsed = channelSchema.safeParse(channel);

    validId(id);
    if (!parsed.success) throw new WorkspaceError('通知渠道不存在。', 404);

    return NextResponse.json(await retryDelivery(parsed.data, id, userId), { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
