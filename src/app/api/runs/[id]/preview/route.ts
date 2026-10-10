import { RESP_TYPES } from 'redis';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { testRuns } from '@/db/schema';
import { readyRedis, redisKey } from '@/server/shared/redis';
import { apiError, validId } from '@/server/shared/http';
import type { Preview } from '@/features/runs/lib/realtime';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);
    const [run] = await db.select({ id: testRuns.id }).from(testRuns).where(eq(testRuns.id, id));

    if (!run) return new Response(null, { status: 404 });
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
