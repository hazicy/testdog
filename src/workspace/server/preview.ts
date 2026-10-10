import { randomUUID } from 'node:crypto';
import { readyRedis, redisKey } from './redis';
import type { Preview } from '../realtime';

export const previewInterval = () => {
  const configured = Number(process.env.CASEFORGE_PREVIEW_INTERVAL_MS || 3000);

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

  // Binary value plus metadata change atomically; previews are expendable, never evidence.
  await client
    .multi()
    .set(redisKey(`preview:${runId}:bytes`), Buffer.from(bytes), { EX: 60 })
    .set(redisKey(`preview:${runId}:meta`), JSON.stringify(preview), { EX: 60 })
    .publish(redisKey(`run:${runId}`), JSON.stringify({ kind: 'preview', ...preview }))
    .exec();
}

export async function latestPreview(runId: string): Promise<Preview | undefined> {
  const client = await readyRedis();
  const value = await client.get(redisKey(`preview:${runId}:meta`));

  return value ? JSON.parse(value) : undefined;
}
