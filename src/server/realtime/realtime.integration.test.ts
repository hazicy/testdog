import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock('@/db', () => ({
  get db() {
    return isolated.db;
  },
}));
import { createTestDatabase } from '@/server/testing/testDatabase';
import { closeRedis, readyRedis, redisClient, redisKey } from '@/server/shared/redis';
import { hasPreviewViewers, latestPreview, publishPreview, watchPreview } from './preview';
import { flushOutbox, stopOutboxPublisher } from './realtime';
import { eventStream } from './eventStream';
import { GET as previewResponse } from '@/app/api/runs/[id]/preview/route';

const binary = process.env.CASEFORGE_TEST_REDIS_BINARY;
let server: ChildProcess;
let database: Awaited<ReturnType<typeof createTestDatabase>>;
const runId = randomUUID();

beforeAll(async () => {
  if (!binary) return;
  const socket = createServer();

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = (socket.address() as import('node:net').AddressInfo).port;

  await new Promise<void>((resolve) => socket.close(() => resolve()));
  server = spawn(
    binary,
    ['--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no'],
    { stdio: 'ignore' },
  );
  vi.stubEnv('REDIS_URL', `redis://127.0.0.1:${port}`);
  vi.stubEnv('CASEFORGE_REDIS_PREFIX', `test-${randomUUID()}`);
  redisClient();
  redisClient(true);
  await vi.waitFor(
    async () => {
      await readyRedis();
      await readyRedis(true);
    },
    { timeout: 10000 },
  );
  database = await createTestDatabase();
  isolated.db = database.db;
  await database.client.query(
    `INSERT INTO test_runs (id, name, url, goal, status) VALUES ($1, 'Live', 'https://example.com', 'Check', 'queued')`,
    [runId],
  );
}, 30000);
afterAll(async () => {
  if (!binary) return;
  stopOutboxPublisher();
  await closeRedis();
  server?.kill();
  await database?.client.close();
  vi.unstubAllEnvs();
});

it.skipIf(!binary)(
  'shares independent expiring viewers and binary previews through Redis and an owned HTTP endpoint',
  async () => {
    expect(await hasPreviewViewers(runId)).toBe(false);
    await watchPreview(runId, 'first', true);
    await watchPreview(runId, 'second', true);
    await watchPreview(runId, 'first', false);
    expect(await hasPreviewViewers(runId)).toBe(true);
    const client = await readyRedis();

    await client.zAdd(redisKey(`watchers:${runId}`), { score: Date.now() - 1, value: 'second' });
    expect(await hasPreviewViewers(runId)).toBe(false);
    const bytes = Buffer.from([255, 216, 0, 128, 255, 217]);

    await publishPreview(runId, bytes, 'image/jpeg');
    expect(await latestPreview(runId)).toMatchObject({ contentType: 'image/jpeg' });
    expect(await client.ttl(redisKey(`preview:${runId}:bytes`))).toBeGreaterThan(0);
    const response = await previewResponse(new Request('http://localhost'), {
      params: Promise.resolve({ id: runId }),
    });

    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(
      (
        await previewResponse(new Request('http://localhost'), {
          params: Promise.resolve({ id: randomUUID() }),
        })
      ).status,
    ).toBe(404);
  },
);

it.skipIf(!binary)(
  'delivers committed deltas through SSE, isolates preview notifications and removes watchers on disconnect',
  async () => {
    const abort = new AbortController();
    const response = await eventStream(
      new Request('http://localhost/events?preview=1', { signal: abort.signal }),
      runId,
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    const until = async (event: string) => {
      while (!received.includes(`event: ${event}\n`)) {
        const chunk = await reader.read();

        if (chunk.done) throw new Error(`Stream ended before ${event}`);
        received += decoder.decode(chunk.value);
      }

      const result = received;

      received = '';

      return result;
    };

    expect(await until('ready')).toContain('event: snapshot');
    await vi.waitFor(async () => expect(await hasPreviewViewers(runId)).toBe(true));
    const stepId = randomUUID();

    await database.client.query(
      `INSERT INTO run_steps (id, "runId", sequence, kind, title, status, "startedAt", "pageId", "pageUrl") VALUES ($1, $2, 1, 'action', 'Click', 'running', now(), 'page-1', '')`,
      [stepId, runId],
    );
    await flushOutbox();
    expect(await until('updates')).toContain(stepId);
    await publishPreview(runId, Buffer.from('next-image'), 'image/jpeg');
    expect(await until('preview')).not.toContain('event: updates');
    abort.abort();
    await reader.cancel();
    await vi.waitFor(async () => expect(await hasPreviewViewers(runId)).toBe(false));
  },
  10000,
);

it.skipIf(!binary)(
  'resets to a consistent snapshot when retained deltas have a gap',
  async () => {
    const abort = new AbortController();
    const response = await eventStream(
      new Request('http://localhost/events', { signal: abort.signal }),
      runId,
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let body = '';

    while (!body.includes('event: ready')) {
      const chunk = await reader.read();

      body += decoder.decode(chunk.value);
    }

    await database.client.query(`UPDATE test_runs SET name = 'Recovered snapshot' WHERE id = $1`, [
      runId,
    ]);
    await database.client.query(
      `DELETE FROM realtime_outbox WHERE "runId" = $1 AND revision = (SELECT "realtimeRevision" FROM test_runs WHERE id = $1)`,
      [runId],
    );
    const client = await readyRedis();

    await client.publish(redisKey(`run:${runId}`), '{"kind":"changed"}');
    body = '';
    while (!body.includes('Recovered snapshot')) {
      const chunk = await reader.read();

      if (chunk.done) throw new Error('Stream ended before reset');
      body += decoder.decode(chunk.value);
    }

    expect(body).toContain('event: snapshot');
    abort.abort();
    await reader.cancel();
  },
  10000,
);

it.skipIf(!binary)(
  'fails fast when Redis is down, so execution can continue without viewers',
  async () => {
    server.kill();
    await vi.waitFor(async () => expect(await hasPreviewViewers(runId)).toBe(false), {
      timeout: 5000,
    });
    await expect(flushOutbox()).resolves.toBeUndefined();
    await vi.waitFor(
      async () => {
        await expect(readyRedis()).rejects.toThrow('unavailable');
      },
      { timeout: 5000 },
    );
  },
);
