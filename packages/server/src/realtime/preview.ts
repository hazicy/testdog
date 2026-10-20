import { randomUUID } from 'node:crypto';
import { RESP_TYPES } from 'redis';
import { readyRedis, redisKey } from '@testdog/server/infrastructure/redis';
import type { Preview } from '@testdog/contracts/runs/lib/realtime';

export const previewInterval = () => {
  const configured = Number(process.env.TESTDOG_PREVIEW_INTERVAL_MS || 3000);

  return Number.isFinite(configured) ? Math.max(1000, configured) : 3000;
};

const watchersKey = (runId: string) => redisKey(`watchers:${runId}`);

export async function watchPreview(runId: string, viewer: string, watching: boolean) {
  const client = await readyRedis();

  if (watching) {
    await client
      .multi()
      .zRemRangeByScore(watchersKey(runId), '-inf', Date.now())
      .zAdd(watchersKey(runId), { score: Date.now() + 45000, value: viewer })
      .expire(watchersKey(runId), 60)
      .exec();
  } else await client.zRem(watchersKey(runId), viewer);
}

export async function hasPreviewViewers(runId: string) {
  try {
    const client = await readyRedis();

    return (await client.zCount(watchersKey(runId), Date.now() + 1, '+inf')) > 0;
  } catch {
    return false;
  }
}

export async function publishPreview(runId: string, bytes: Uint8Array, contentType: string) {
  if (bytes.length > 2 * 1024 * 1024) return;
  const client = await readyRedis();
  const preview: Preview = {
    version: randomUUID(),
    capturedAt: new Date().toISOString(),
    contentType,
  };

  // One expiring Redis key holds only the latest image and its matching metadata.
  const key = redisKey(`preview:${runId}`);

  await client
    .multi()
    .hSet(key, { bytes: Buffer.from(bytes), meta: JSON.stringify(preview) })
    .expire(key, 60)
    .publish(redisKey(`run:${runId}`), JSON.stringify({ kind: 'preview', ...preview }))
    .exec();
}

export async function latestPreview(runId: string): Promise<Preview | undefined> {
  const client = await readyRedis();
  const value = await client.hGet(redisKey(`preview:${runId}`), 'meta');

  return value ? JSON.parse(value) : undefined;
}

/** One Redis command reads a matching image and metadata, even during concurrent publication. */
export async function readPreviewFrame(runId: string) {
  const client = (await readyRedis()).withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer });
  const { bytes, meta } = await client.hGetAll(redisKey(`preview:${runId}`));

  if (!bytes || !meta) return undefined;

  return { bytes, preview: JSON.parse(meta.toString()) as Preview };
}
