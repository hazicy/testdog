import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { apiError, validId } from '@testdog/server/shared/http';
import { listRecordingVersions, saveRecordingVersion } from '@testdog/server/runs/recordings';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;

    validId(id);

    return NextResponse.json({
      versions: await listRecordingVersions(id, await requireUserId(request)),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const userId = await requireUserId(request);
    const body = await request.json().catch(() => null);
    const { id } = await context.params;

    validId(id);

    return NextResponse.json(
      { version: await saveRecordingVersion(id, body?.code, userId) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
