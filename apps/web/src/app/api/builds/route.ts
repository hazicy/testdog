import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { db } from '@testdog/server/db';
import { automationBuilds } from '@testdog/server/db/schema';
import { apiError } from '@testdog/server/http/api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
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
  } catch (error) {
    return apiError(error);
  }
}
