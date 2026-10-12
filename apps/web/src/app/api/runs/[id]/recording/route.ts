import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { recordingRequestSchema, recordingInputMessage } from '@testdog/contracts/runs/schemas';
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
    const parsed = recordingRequestSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success)
      return NextResponse.json({ message: recordingInputMessage }, { status: 400 });
    const { id } = await context.params;

    validId(id);

    return NextResponse.json(
      { version: await saveRecordingVersion(id, parsed.data.code, await requireUserId(request)) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
