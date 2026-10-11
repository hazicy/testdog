import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@/server/shared/http';
import { WorkspaceError } from '@/server/shared/errors';
import { submitOnce } from '@/server/shared/idempotency';
import { channelSchema } from '@/features/integrations/schemas';
import { queueTest } from '@/server/integrations/repository';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ channel: string }> }) {
  try {
    const userId = await requireUserId(request);
    const parsed = channelSchema.safeParse((await context.params).channel);

    if (!parsed.success) throw new WorkspaceError('通知渠道不存在。', 404);

    return NextResponse.json(
      await submitOnce(request, {}, (tx) => queueTest(parsed.data, userId, tx), userId),
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
