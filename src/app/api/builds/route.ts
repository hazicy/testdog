import { NextResponse } from 'next/server';
import { db } from '@/db';
import { automationBuilds } from '@/db/schema';
import { apiError } from '@/workspace/server/http';
export const runtime = 'nodejs';
export async function GET() {
  try {
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
