import { NextResponse } from 'next/server';
import { recordingRequestSchema, recordingInputMessage } from '@/features/runs/schemas';
import { apiError, validId } from '@/server/shared/http';
import { listRecordingVersions, saveRecordingVersion } from '@/server/runs/recordings';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;

    validId(id);

    return NextResponse.json({ versions: await listRecordingVersions(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const parsed = recordingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: recordingInputMessage }, { status: 400 });
  try {
    const { id } = await context.params;

    validId(id);

    return NextResponse.json(
      { version: await saveRecordingVersion(id, parsed.data.code) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
