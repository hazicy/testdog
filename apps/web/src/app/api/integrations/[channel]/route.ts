import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@testdog/server/http/api';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { channelSchema } from '@testdog/contracts/integrations/schemas';
import { saveIntegration } from '@testdog/server/integrations/repository';

export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ channel: string }> }) {
  try {
    const userId = await requireUserId(request);
    const parsed = channelSchema.safeParse((await context.params).channel);

    if (!parsed.success) throw new WorkspaceError('通知渠道不存在。', 404);

    return NextResponse.json({
      integration: await saveIntegration(
        parsed.data,
        await request.json().catch(() => null),
        userId,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
