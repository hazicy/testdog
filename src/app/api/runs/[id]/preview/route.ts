import { assertRunAccess } from '@/server/runs/repository';
import { requireUserId } from '@/server/shared/auth';
import { RESP_TYPES } from 'redis';
import { readyRedis, redisKey } from '@/server/shared/redis';
import { apiError, validId } from '@/server/shared/http';
import type { Preview } from '@/features/runs/lib/realtime';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);
    await assertRunAccess(id, await requireUserId(request));
    const client = (await readyRedis()).withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer });
    const [bytes, meta] = await client.mGet([
      redisKey(`preview:${id}:bytes`),
      redisKey(`preview:${id}:meta`),
    ]);

    if (!bytes || !meta) return new Response(null, { status: 404 });
    const preview: Preview = JSON.parse(meta.toString());

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
