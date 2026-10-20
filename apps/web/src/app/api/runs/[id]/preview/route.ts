import { assertRunAccess } from '@testdog/server/runs/repository';
import { requireUserId } from '@/server/shared/auth';
import { readPreviewFrame } from '@testdog/server/realtime/preview';
import { apiError, validId } from '@testdog/server/http/api';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);
    await assertRunAccess(id, await requireUserId(request));
    const frame = await readPreviewFrame(id);

    if (!frame) return new Response(null, { status: 404 });
    const { bytes, preview } = frame;

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': preview.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
