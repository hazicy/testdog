import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { automationBuilds } from '@/db/schema';
import { withApiError } from '@/server/shared/http';

export const runtime = 'nodejs';

export const GET = withApiError(async (request: Request) => {
  await requireUserId(request);
  const builds = await db
    .select({
      id: automationBuilds.id,
      platform: automationBuilds.platform,
      appId: automationBuilds.appId,
      sha256: automationBuilds.sha256,
      createdAt: automationBuilds.createdAt,
    })
    .from(automationBuilds);

  return NextResponse.json({ builds });
});
